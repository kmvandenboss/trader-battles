/**
 * In-memory repository implementation backed by the deterministic seed
 * dataset (lib/data/seed). This is the demo's entire "database" and remains
 * the zero-external-services default when DATABASE_URL is unset.
 *
 * All derivation logic (standings, leaderboards, percentiles, battle
 * summaries) lives in ./derive.ts and is SHARED with the Postgres
 * implementation (./postgres) so the two backends cannot drift apart.
 */

import type { SeedDataset } from "../seed";
import type {
  AccountSnapshot,
  Battle,
  BattleMetricSnapshot,
  BattleParticipant,
  ExecutionEvent,
  Firm,
  Notification,
  RatingHistoryEntry,
} from "../schema/types";
import type { Market } from "../schema/enums";
import {
  battleDescComparator,
  buildBattleDetail,
  buildTraderIndex,
  computeStanding,
  deriveEarnedAchievements,
  deriveFirmStandings,
  deriveFirmVsFirm,
  filterAndSortTraders,
  filterBattleHistory,
  leaderboardPage,
  push,
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
  BattleSummary,
  EarnedAchievement,
  FirmRepository,
  FirmStandings,
  FirmVsFirmResult,
  LeaderboardQuery,
  LeaderboardRepository,
  NotificationRepository,
  Repositories,
  TraderRepository,
  TraderStanding,
  TraderWithProfile,
} from "./types";

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
  /** Completed battles, most recent first. */
  readonly battlesDesc: Battle[];
  readonly demoUserId: string;

  constructor(readonly data: SeedDataset) {
    for (const firm of data.firms) {
      this.firmById.set(firm.id, firm);
      this.firmBySlug.set(firm.slug, firm);
    }
    this.traderById = buildTraderIndex(data.users, data.traderProfiles, data.firms);
    const demo = data.users.find((u) => u.isDemoUser);
    if (!demo) throw new Error("seed dataset has no demo user");
    this.demoUserId = demo.id;

    for (const battle of data.battles) this.battleById.set(battle.id, battle);
    this.battlesDesc = [...data.battles].sort(battleDescComparator);
    for (const p of data.battleParticipants) {
      push(this.participantsByBattle, p.battleId, p);
      push(this.battleIdsByUser, p.userId, p.battleId);
    }
    for (const m of data.battleMetricSnapshots) {
      push(this.metricsByBattle, m.battleId, m);
      if (m.isFinal) this.finalMetricsByParticipant.set(m.participantId, m);
    }
    for (const e of data.executionEvents) {
      if (e.battleId) push(this.eventsByBattle, e.battleId, e);
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
    return this.ix.data.tradingAccounts.filter((a) => a.userId === userId);
  }

  async getConnections(userId: string) {
    return this.ix.data.integrationConnections.filter((c) => c.userId === userId);
  }
}

class InMemoryBattleRepository implements BattleRepository {
  constructor(private readonly ix: Indexes) {}

  async getById(battleId: string): Promise<BattleDetail | null> {
    const battle = this.ix.battleById.get(battleId);
    return battle ? this.ix.detail(battle) : null;
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
    const latest = this.ix.battlesDesc.find((b) => ids.has(b.id));
    return latest ? this.ix.detail(latest) : null;
  }

  async listRecent(limit: number): Promise<BattleSummary[]> {
    return this.ix.battlesDesc
      .filter((b) => b.status === "COMPLETED")
      .slice(0, limit)
      .map((b) => this.ix.summarize(b));
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
      this.ix.data.battles,
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
      this.ix.data.battles,
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
    leaderboards: new InMemoryLeaderboardRepository(ix),
    firms: new InMemoryFirmRepository(ix),
    achievements: new InMemoryAchievementRepository(ix),
    notifications: new InMemoryNotificationRepository(ix),
  };
}
