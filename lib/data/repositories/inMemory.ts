/**
 * In-memory repository implementation backed by the deterministic seed
 * dataset (lib/data/seed). This is the demo's entire "database" and remains
 * the zero-external-services default when DATABASE_URL is unset.
 *
 * All derivation logic (standings, leaderboards, percentiles, battle
 * summaries) lives in ./derive.ts and is SHARED with the Postgres
 * implementation (./postgres) so the two backends cannot drift apart.
 *
 * WRITES (the v1 surface: battles.create/saveSettlement, challenges,
 * market bars, CSV accounts, imported executions) are in-process mutations
 * of indexes built from the seed dataset. They are EPHEMERAL — per process,
 * lost on restart — which keeps the zero-DB demo fully functional for dev
 * and tests. Mutable rows are cloned at construction so writes never touch
 * the shared seed-dataset singleton.
 */

import { randomUUID } from "node:crypto";

import type { SeedDataset } from "../seed";
import type {
  AccountSnapshot,
  Battle,
  BattleMetricSnapshot,
  BattleParticipant,
  Challenge,
  ExecutionEvent,
  Firm,
  MarketBar,
  Notification,
  RatingHistoryEntry,
  TraderInvite,
  TradingAccount,
} from "../schema/types";
import type { BattleStatus, ChallengeStatus, Market } from "../schema/enums";
import {
  applySettlementToProfile,
  battleDescComparator,
  buildBattleDetail,
  buildChallengeRow,
  buildCsvAccountRow,
  buildImportedExecutionRow,
  buildInviteRow,
  buildMarketBarRow,
  buildParticipantSettlementRows,
  buildScheduledBattleRows,
  buildTraderIndex,
  challengeDescComparator,
  computeStanding,
  deriveEarnedAchievements,
  deriveFirmStandings,
  deriveFirmVsFirm,
  executionDedupeKey,
  filterAndSortTraders,
  filterBattleHistory,
  inviteDescComparator,
  isCompletedBattle,
  leaderboardPage,
  push,
  scheduledAscComparator,
  selectMarkPrice,
  sortFirmStandings,
  sortNotificationsDesc,
  sortRatingHistory,
  summarizeBattle,
} from "./derive";
import type {
  AchievementRepository,
  BattleDetail,
  BattleHistoryFilter,
  BattleRepository,
  BattleSettlementInput,
  BattleSummary,
  ChallengeRepository,
  ChallengeResponseStatus,
  CreateBattleInput,
  CreateChallengeInput,
  CreateInviteInput,
  CsvAccountOptions,
  EarnedAchievement,
  FirmRepository,
  FirmStandings,
  FirmVsFirmResult,
  ImportExecutionsResult,
  InviteRepository,
  LeaderboardQuery,
  LeaderboardRepository,
  MarketBarInput,
  MarketDataRepository,
  MarkPrice,
  NotificationRepository,
  Repositories,
  SaveBarsResult,
  ScheduledBattle,
  TraderRepository,
  TraderStanding,
  TraderWithProfile,
} from "./types";
import type { NormalizedExecutionEvent } from "../../integrations/types";

class Indexes {
  readonly traderById: Map<string, TraderWithProfile>;
  readonly firmById = new Map<string, Firm>();
  readonly firmBySlug = new Map<string, Firm>();
  readonly battleById = new Map<string, Battle>();
  readonly participantsByBattle = new Map<string, BattleParticipant[]>();
  readonly battleIdsByUser = new Map<string, string[]>();
  readonly finalMetricsByParticipant = new Map<string, BattleMetricSnapshot>();
  readonly metricsByBattle = new Map<string, BattleMetricSnapshot[]>();
  readonly eventsByBattle = new Map<string, ExecutionEvent[]>();
  readonly accountSnapshotsByBattle = new Map<string, AccountSnapshot[]>();
  readonly ratingHistoryByUser = new Map<string, RatingHistoryEntry[]>();
  readonly notificationsByUser = new Map<string, Notification[]>();
  /** All battles (any status), most recent first. */
  readonly battlesDesc: Battle[];
  readonly demoUserId: string;
  /** Mutable copy of trading accounts (CSV accounts are appended here). */
  readonly accounts: TradingAccount[];
  /** Ephemeral v1 writes. */
  readonly challenges: Challenge[] = [];
  /** Ephemeral refer-a-friend invite writes. */
  readonly invites: TraderInvite[] = [];
  /** `${instrument}|${barStartIso}` -> bar (the unique-index key). */
  readonly marketBars = new Map<string, MarketBar>();
  /** Stored execution dedupe keys (provider|eventId|accountId). */
  readonly executionKeys = new Set<string>();

  constructor(readonly data: SeedDataset) {
    for (const firm of data.firms) {
      this.firmById.set(firm.id, firm);
      this.firmBySlug.set(firm.slug, firm);
    }
    // Clone every row the write surface can mutate, so in-process writes
    // never leak into the shared seed-dataset singleton.
    const profiles = data.traderProfiles.map((p) => ({ ...p }));
    this.accounts = data.tradingAccounts.map((a) => ({ ...a }));
    this.traderById = buildTraderIndex(data.users, profiles, data.firms);
    const demo = data.users.find((u) => u.isDemoUser);
    if (!demo) throw new Error("seed dataset has no demo user");
    this.demoUserId = demo.id;

    for (const battle of data.battles) {
      this.battleById.set(battle.id, { ...battle });
    }
    this.battlesDesc = [...this.battleById.values()].sort(battleDescComparator);
    for (const seeded of data.battleParticipants) {
      const p = { ...seeded };
      push(this.participantsByBattle, p.battleId, p);
      push(this.battleIdsByUser, p.userId, p.battleId);
    }
    for (const m of data.battleMetricSnapshots) {
      push(this.metricsByBattle, m.battleId, m);
      if (m.isFinal) this.finalMetricsByParticipant.set(m.participantId, m);
    }
    for (const e of data.executionEvents) {
      if (e.battleId) push(this.eventsByBattle, e.battleId, e);
      this.executionKeys.add(
        executionDedupeKey(e.sourceProvider, e.providerEventId, e.tradingAccountId),
      );
    }
    for (const s of data.accountSnapshots) {
      if (s.battleId) push(this.accountSnapshotsByBattle, s.battleId, s);
    }
    for (const r of data.ratingHistory) push(this.ratingHistoryByUser, r.userId, r);
    for (const list of this.ratingHistoryByUser.values()) sortRatingHistory(list);
    for (const n of data.notifications) push(this.notificationsByUser, n.userId, n);
    for (const list of this.notificationsByUser.values())
      sortNotificationsDesc(list);
  }

  summarize(battle: Battle): BattleSummary {
    return summarizeBattle(
      battle,
      this.participantsByBattle.get(battle.id) ?? [],
      this.traderById,
      this.finalMetricsByParticipant,
    );
  }

  detail(battle: Battle): BattleDetail {
    return buildBattleDetail(
      this.summarize(battle),
      this.eventsByBattle.get(battle.id) ?? [],
      this.accountSnapshotsByBattle.get(battle.id) ?? [],
      this.metricsByBattle.get(battle.id) ?? [],
    );
  }

  requireTrader(userId: string): TraderWithProfile {
    const trader = this.traderById.get(userId);
    if (!trader) throw new Error(`unknown trader ${userId}`);
    return trader;
  }

  scheduledComposite(battle: Battle): ScheduledBattle {
    const participants = (this.participantsByBattle.get(battle.id) ?? []).map(
      (participant) => ({
        participant,
        trader: this.requireTrader(participant.userId),
      }),
    );
    return { battle, participants };
  }
}

// ---------------------------------------------------------------------------
// Repository implementations
// ---------------------------------------------------------------------------

class InMemoryTraderRepository implements TraderRepository {
  constructor(private readonly ix: Indexes) {}

  async getDemoTrader(): Promise<TraderWithProfile> {
    const trader = this.ix.traderById.get(this.ix.demoUserId);
    if (!trader) throw new Error("demo trader missing");
    return trader;
  }

  async getById(userId: string): Promise<TraderWithProfile | null> {
    return this.ix.traderById.get(userId) ?? null;
  }

  async getByDisplayName(displayName: string): Promise<TraderWithProfile | null> {
    for (const trader of this.ix.traderById.values()) {
      if (trader.user.displayName === displayName) return trader;
    }
    return null;
  }

  async list(filter?: {
    league?: TraderWithProfile["profile"]["league"];
    firmSlug?: string;
    primaryMarket?: Market;
  }): Promise<TraderWithProfile[]> {
    return filterAndSortTraders([...this.ix.traderById.values()], filter);
  }

  async getRatingHistory(userId: string): Promise<RatingHistoryEntry[]> {
    return this.ix.ratingHistoryByUser.get(userId) ?? [];
  }

  async getAccounts(userId: string) {
    return this.ix.accounts.filter((a) => a.userId === userId);
  }

  async getConnections(userId: string) {
    return this.ix.data.integrationConnections.filter((c) => c.userId === userId);
  }

  async findOrCreateCsvAccount(
    userId: string,
    externalAccountId: string,
    opts?: CsvAccountOptions,
  ): Promise<TradingAccount> {
    const existing = this.ix.accounts.find(
      (a) =>
        a.userId === userId &&
        a.provider === "csv" &&
        a.externalAccountId === externalAccountId,
    );
    if (existing) return existing;
    const account = buildCsvAccountRow(
      userId,
      externalAccountId,
      opts,
      `acct-csv-${randomUUID()}`,
    );
    this.ix.accounts.push(account);
    return account;
  }
}

class InMemoryBattleRepository implements BattleRepository {
  constructor(private readonly ix: Indexes) {}

  async getById(battleId: string): Promise<BattleDetail | null> {
    const battle = this.ix.battleById.get(battleId);
    return battle && isCompletedBattle(battle) ? this.ix.detail(battle) : null;
  }

  async listForUser(
    userId: string,
    filter?: BattleHistoryFilter,
  ): Promise<BattleSummary[]> {
    const ids = new Set(this.ix.battleIdsByUser.get(userId) ?? []);
    const mine = this.ix.battlesDesc.filter((b) => ids.has(b.id));
    const filtered = filterBattleHistory(
      mine,
      userId,
      this.ix.participantsByBattle,
      filter,
    );
    return filtered.map((b) => this.ix.summarize(b));
  }

  async getLatestForUser(userId: string): Promise<BattleDetail | null> {
    const ids = new Set(this.ix.battleIdsByUser.get(userId) ?? []);
    const latest = this.ix.battlesDesc.find(
      (b) => ids.has(b.id) && isCompletedBattle(b),
    );
    return latest ? this.ix.detail(latest) : null;
  }

  async listRecent(limit: number): Promise<BattleSummary[]> {
    return this.ix.battlesDesc
      .filter(isCompletedBattle)
      .slice(0, limit)
      .map((b) => this.ix.summarize(b));
  }

  // --- V1 write surface ----------------------------------------------------

  async create(input: CreateBattleInput): Promise<Battle> {
    const battleId = `battle-v1-${randomUUID()}`;
    const { battle, participants } = buildScheduledBattleRows(
      input,
      battleId,
      new Date().toISOString(),
    );
    this.ix.battleById.set(battle.id, battle);
    this.ix.battlesDesc.push(battle);
    this.ix.battlesDesc.sort(battleDescComparator);
    this.ix.participantsByBattle.set(battle.id, participants);
    for (const p of participants) push(this.ix.battleIdsByUser, p.userId, battle.id);
    return battle;
  }

  async listScheduledForUser(userId: string): Promise<ScheduledBattle[]> {
    const ids = new Set(this.ix.battleIdsByUser.get(userId) ?? []);
    return [...this.ix.battleById.values()]
      .filter(
        (b) =>
          ids.has(b.id) && (b.status === "SCHEDULED" || b.status === "SETTLING"),
      )
      .sort(scheduledAscComparator)
      .map((b) => this.ix.scheduledComposite(b));
  }

  async getScheduledById(battleId: string): Promise<ScheduledBattle | null> {
    const battle = this.ix.battleById.get(battleId);
    return battle ? this.ix.scheduledComposite(battle) : null;
  }

  async updateStatus(battleId: string, status: BattleStatus): Promise<void> {
    const battle = this.ix.battleById.get(battleId);
    if (!battle) throw new Error(`unknown battle ${battleId}`);
    battle.status = status;
  }

  async saveSettlement(input: BattleSettlementInput): Promise<void> {
    const battle = this.ix.battleById.get(input.battleId);
    if (!battle) throw new Error(`unknown battle ${input.battleId}`);
    const stored = this.ix.participantsByBattle.get(input.battleId) ?? [];

    // Replace any prior FINAL snapshots for this battle (intra-battle
    // telemetry, when present, is preserved).
    const keptMetrics = (this.ix.metricsByBattle.get(input.battleId) ?? []).filter(
      (m) => !m.isFinal,
    );

    for (const pInput of input.participants) {
      const participant = stored.find((p) => p.userId === pInput.userId);
      if (!participant) {
        throw new Error(
          `battle ${input.battleId} has no participant for user ${pInput.userId}`,
        );
      }
      const previousResult = participant.result;
      const rows = buildParticipantSettlementRows(
        participant,
        pInput,
        input.battleId,
        input.endTime,
        input.verificationStatus,
      );
      Object.assign(participant, rows.participant);
      keptMetrics.push(rows.finalSnapshot);
      this.ix.finalMetricsByParticipant.set(participant.id, rows.finalSnapshot);

      const history = (this.ix.ratingHistoryByUser.get(pInput.userId) ?? []).filter(
        (r) => r.battleId !== input.battleId,
      );
      history.push(rows.ratingEntry);
      this.ix.ratingHistoryByUser.set(pInput.userId, sortRatingHistory(history));

      const trader = this.ix.requireTrader(pInput.userId);
      Object.assign(
        trader.profile,
        applySettlementToProfile(
          trader.profile,
          previousResult,
          pInput.result,
          pInput.endingRating,
        ),
      );
    }
    this.ix.metricsByBattle.set(input.battleId, keptMetrics);

    battle.status = "COMPLETED";
    battle.winnerId = input.winnerId;
    battle.endTime = input.endTime;
    battle.actualStart = battle.actualStart ?? battle.scheduledStart;
    battle.decidedBy = input.decidedBy;
    battle.resolutionDetail = input.resolutionDetail;
  }

  async saveImportedExecutions(
    battleId: string,
    participantUserId: string,
    tradingAccountId: string,
    events: NormalizedExecutionEvent[],
  ): Promise<ImportExecutionsResult> {
    if (!this.ix.battleById.has(battleId))
      throw new Error(`unknown battle ${battleId}`);
    let inserted = 0;
    let skippedDuplicates = 0;
    for (const event of events) {
      const key = executionDedupeKey(
        event.sourceProvider,
        event.providerEventId,
        tradingAccountId,
      );
      if (this.ix.executionKeys.has(key)) {
        skippedDuplicates++;
        continue;
      }
      const row = buildImportedExecutionRow(
        event,
        `exec-${randomUUID()}`,
        battleId,
        participantUserId,
        tradingAccountId,
      );
      push(this.ix.eventsByBattle, battleId, row);
      this.ix.executionKeys.add(key);
      inserted++;
    }
    return { inserted, skippedDuplicates };
  }

  async listImportedExecutions(
    battleId: string,
    userId: string,
  ): Promise<ExecutionEvent[]> {
    return (this.ix.eventsByBattle.get(battleId) ?? [])
      .filter((e) => e.userId === userId)
      .sort(
        (a, b) =>
          a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
      );
  }
}

class InMemoryChallengeRepository implements ChallengeRepository {
  constructor(private readonly ix: Indexes) {}

  async create(input: CreateChallengeInput): Promise<Challenge> {
    const challenge = buildChallengeRow(
      input,
      `challenge-${randomUUID()}`,
      new Date().toISOString(),
    );
    this.ix.challenges.push(challenge);
    return challenge;
  }

  async getById(id: string): Promise<Challenge | null> {
    return this.ix.challenges.find((c) => c.id === id) ?? null;
  }

  async listForUser(
    userId: string,
  ): Promise<{ incoming: Challenge[]; outgoing: Challenge[] }> {
    const incoming = this.ix.challenges
      .filter((c) => c.opponentUserId === userId)
      .sort(challengeDescComparator);
    const outgoing = this.ix.challenges
      .filter((c) => c.challengerUserId === userId)
      .sort(challengeDescComparator);
    return { incoming, outgoing };
  }

  async respond(
    id: string,
    status: ChallengeResponseStatus,
    respondedAt: string,
    options?: { expectedStatus?: ChallengeStatus },
  ): Promise<Challenge | null> {
    const challenge = this.ix.challenges.find((c) => c.id === id);
    if (!challenge) return null;
    // Double-accept guard: only update when the current status matches.
    if (options?.expectedStatus && challenge.status !== options.expectedStatus)
      return null;
    challenge.status = status;
    challenge.respondedAt = respondedAt;
    return challenge;
  }

  async linkBattle(id: string, battleId: string): Promise<void> {
    const challenge = this.ix.challenges.find((c) => c.id === id);
    if (!challenge) throw new Error(`unknown challenge ${id}`);
    challenge.battleId = battleId;
  }
}

class InMemoryInviteRepository implements InviteRepository {
  constructor(private readonly ix: Indexes) {}

  async create(input: CreateInviteInput): Promise<TraderInvite> {
    const invite = buildInviteRow(
      input,
      `invite-${randomUUID()}`,
      randomUUID().slice(0, 8),
      new Date().toISOString(),
    );
    this.ix.invites.push(invite);
    return invite;
  }

  async listForUser(inviterUserId: string): Promise<TraderInvite[]> {
    return this.ix.invites
      .filter((i) => i.inviterUserId === inviterUserId)
      .sort(inviteDescComparator);
  }
}

class InMemoryMarketDataRepository implements MarketDataRepository {
  constructor(private readonly ix: Indexes) {}

  async saveBars(
    instrument: Market,
    bars: MarketBarInput[],
    source: string,
  ): Promise<SaveBarsResult> {
    const importedAt = new Date().toISOString();
    let inserted = 0;
    let replaced = 0;
    for (const bar of bars) {
      const row = buildMarketBarRow(instrument, bar, source, importedAt);
      const key = `${instrument}|${row.barStart}`;
      if (this.ix.marketBars.has(key)) replaced++;
      else inserted++;
      this.ix.marketBars.set(key, row);
    }
    return { inserted, replaced };
  }

  async getMarkPrice(instrument: Market, atIso: string): Promise<MarkPrice | null> {
    const bars = [...this.ix.marketBars.values()].filter(
      (b) => b.instrument === instrument,
    );
    return selectMarkPrice(bars, atIso);
  }

  async hasBars(instrument: Market, fromIso: string, toIso: string): Promise<boolean> {
    const fromMs = Date.parse(fromIso);
    const toMs = Date.parse(toIso);
    for (const bar of this.ix.marketBars.values()) {
      if (bar.instrument !== instrument) continue;
      const ms = Date.parse(bar.barStart);
      if (ms >= fromMs && ms <= toMs) return true;
    }
    return false;
  }
}

class InMemoryLeaderboardRepository implements LeaderboardRepository {
  constructor(private readonly ix: Indexes) {}

  async query(query?: LeaderboardQuery) {
    return leaderboardPage([...this.ix.traderById.values()], query);
  }

  async getStanding(userId: string): Promise<TraderStanding | null> {
    return computeStanding(userId, [...this.ix.traderById.values()]);
  }
}

class InMemoryFirmRepository implements FirmRepository {
  constructor(private readonly ix: Indexes) {}

  private standingsFor(firm: Firm): FirmStandings {
    return deriveFirmStandings(
      firm,
      [...this.ix.traderById.values()],
      [...this.ix.battleById.values()],
      this.ix.participantsByBattle,
    );
  }

  async list(): Promise<FirmStandings[]> {
    return sortFirmStandings(
      this.ix.data.firms.map((f) => this.standingsFor(f)),
    );
  }

  async getBySlug(slug: string): Promise<FirmStandings | null> {
    const firm = this.ix.firmBySlug.get(slug);
    return firm ? this.standingsFor(firm) : null;
  }

  async getFirmVsFirm(slug: string): Promise<FirmVsFirmResult[]> {
    const firm = this.ix.firmBySlug.get(slug);
    if (!firm) return [];
    return deriveFirmVsFirm(
      firm,
      this.ix.traderById,
      this.ix.firmById,
      [...this.ix.battleById.values()],
      this.ix.participantsByBattle,
    );
  }
}

class InMemoryAchievementRepository implements AchievementRepository {
  constructor(private readonly ix: Indexes) {}

  async listCatalog() {
    return this.ix.data.achievements;
  }

  async listForUser(userId: string): Promise<EarnedAchievement[]> {
    return deriveEarnedAchievements(
      this.ix.data.achievements,
      this.ix.data.userAchievements,
      userId,
    );
  }
}

class InMemoryNotificationRepository implements NotificationRepository {
  constructor(private readonly ix: Indexes) {}

  async listForUser(userId: string, options?: { unreadOnly?: boolean }) {
    const all = this.ix.notificationsByUser.get(userId) ?? [];
    return options?.unreadOnly ? all.filter((n) => !n.read) : all;
  }

  async countUnread(userId: string): Promise<number> {
    return (this.ix.notificationsByUser.get(userId) ?? []).filter((n) => !n.read)
      .length;
  }
}

/** Build the full in-memory repository set from a seed dataset. */
export function createInMemoryRepositories(data: SeedDataset): Repositories {
  const ix = new Indexes(data);
  return {
    traders: new InMemoryTraderRepository(ix),
    battles: new InMemoryBattleRepository(ix),
    challenges: new InMemoryChallengeRepository(ix),
    invites: new InMemoryInviteRepository(ix),
    marketData: new InMemoryMarketDataRepository(ix),
    leaderboards: new InMemoryLeaderboardRepository(ix),
    firms: new InMemoryFirmRepository(ix),
    achievements: new InMemoryAchievementRepository(ix),
    notifications: new InMemoryNotificationRepository(ix),
  };
}
