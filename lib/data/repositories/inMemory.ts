/**
 * In-memory repository implementation backed by the deterministic seed
 * dataset (lib/data/seed). This is the demo's entire "database".
 *
 * PLUG-IN POINT: a future PostgresRepositories class implements the same
 * interfaces from ./types against the Drizzle schema in lib/data/schema.
 * Swap it in inside index.ts getRepositories(); nothing else changes.
 */

import { DEMO_TODAY } from "../seed/constants";
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
  LeaderboardEntry,
  LeaderboardQuery,
  LeaderboardRepository,
  NotificationRepository,
  ParticipantSummary,
  Repositories,
  TraderRepository,
  TraderStanding,
  TraderWithProfile,
} from "./types";

/** ISO date 7 days before the demo "today" — the firm weekly-record window. */
function weekAgoIso(): string {
  const t = new Date(`${DEMO_TODAY}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 7);
  return t.toISOString().slice(0, 10);
}

class Indexes {
  readonly traderById = new Map<string, TraderWithProfile>();
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
    const profileByUser = new Map(data.traderProfiles.map((p) => [p.userId, p]));
    for (const user of data.users) {
      const profile = profileByUser.get(user.id);
      if (!profile) continue;
      const firm = this.firmById.get(profile.firmId);
      if (!firm) continue;
      this.traderById.set(user.id, { user, profile, firm });
    }
    const demo = data.users.find((u) => u.isDemoUser);
    if (!demo) throw new Error("seed dataset has no demo user");
    this.demoUserId = demo.id;

    for (const battle of data.battles) this.battleById.set(battle.id, battle);
    this.battlesDesc = [...data.battles].sort(
      (a, b) =>
        b.scheduledStart.localeCompare(a.scheduledStart) ||
        b.id.localeCompare(a.id),
    );
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
    for (const list of this.ratingHistoryByUser.values()) {
      list.sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      );
    }
    for (const n of data.notifications) push(this.notificationsByUser, n.userId, n);
    for (const list of this.notificationsByUser.values()) {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }

  summarize(battle: Battle): BattleSummary {
    const parts = this.participantsByBattle.get(battle.id) ?? [];
    const summaries = parts.map((participant): ParticipantSummary => {
      const trader = this.traderById.get(participant.userId);
      const metrics = this.finalMetricsByParticipant.get(participant.id);
      if (!trader || !metrics)
        throw new Error(`inconsistent battle data for ${battle.id}`);
      return {
        participant,
        trader,
        metrics,
        ratingChange: participant.endingRating - participant.startingRating,
      };
    });
    if (summaries.length !== 2)
      throw new Error(`battle ${battle.id} does not have 2 participants`);
    return { battle, participants: [summaries[0], summaries[1]] };
  }

  detail(battle: Battle): BattleDetail {
    const summary = this.summarize(battle);
    const timeline = [...(this.metricsByBattle.get(battle.id) ?? [])].sort(
      (a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id),
    );
    const events = [...(this.eventsByBattle.get(battle.id) ?? [])].sort(
      (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
    );
    const snapshots = [...(this.accountSnapshotsByBattle.get(battle.id) ?? [])].sort(
      (a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id),
    );
    return {
      ...summary,
      executionEvents: events,
      accountSnapshots: snapshots,
      metricTimeline: timeline,
    };
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
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
    let traders = [...this.ix.traderById.values()];
    if (filter?.league)
      traders = traders.filter((t) => t.profile.league === filter.league);
    if (filter?.firmSlug)
      traders = traders.filter((t) => t.firm.slug === filter.firmSlug);
    if (filter?.primaryMarket)
      traders = traders.filter(
        (t) => t.profile.primaryMarket === filter.primaryMarket,
      );
    return traders.sort((a, b) => b.profile.rating - a.profile.rating);
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
    let battles = this.ix.battlesDesc.filter((b) => ids.has(b.id));
    if (filter?.market) battles = battles.filter((b) => b.market === filter.market);
    if (filter?.battleType)
      battles = battles.filter((b) => b.battleType === filter.battleType);
    if (filter?.battleWindow)
      battles = battles.filter((b) => b.battleWindow === filter.battleWindow);
    if (filter?.from)
      battles = battles.filter((b) => b.scheduledStart >= filter.from!);
    if (filter?.to)
      battles = battles.filter(
        (b) => b.scheduledStart.slice(0, 10) <= filter.to!,
      );
    if (filter?.result)
      battles = battles.filter((b) =>
        filter.result === "WIN" ? b.winnerId === userId : b.winnerId !== userId,
      );
    if (filter?.opponentUserId)
      battles = battles.filter((b) =>
        (this.ix.participantsByBattle.get(b.id) ?? []).some(
          (p) => p.userId === filter.opponentUserId,
        ),
      );
    const limited =
      filter?.limit !== undefined ? battles.slice(0, filter.limit) : battles;
    return limited.map((b) => this.ix.summarize(b));
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

  private ranked(filter?: LeaderboardQuery): TraderWithProfile[] {
    let traders = [...this.ix.traderById.values()];
    if (filter?.league)
      traders = traders.filter((t) => t.profile.league === filter.league);
    if (filter?.market)
      traders = traders.filter((t) => t.profile.primaryMarket === filter.market);
    if (filter?.firmSlug)
      traders = traders.filter((t) => t.firm.slug === filter.firmSlug);
    return traders.sort(
      (a, b) =>
        b.profile.rating - a.profile.rating ||
        a.user.displayName.localeCompare(b.user.displayName),
    );
  }

  async query(query?: LeaderboardQuery) {
    const ranked = this.ranked(query);
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? ranked.length;
    const entries: LeaderboardEntry[] = ranked
      .slice(offset, offset + limit)
      .map((trader, i) => {
        const { seasonWins: w, seasonLosses: l } = trader.profile;
        return {
          rank: offset + i + 1,
          trader,
          winRate: w + l > 0 ? w / (w + l) : 0,
        };
      });
    return { entries, total: ranked.length };
  }

  async getStanding(userId: string): Promise<TraderStanding | null> {
    const me = this.ix.traderById.get(userId);
    if (!me) return null;
    const rankIn = (list: TraderWithProfile[]) =>
      list.findIndex((t) => t.user.id === userId) + 1;
    const global = this.ranked();
    const firm = this.ranked({ firmSlug: me.firm.slug });
    const market = this.ranked({ market: me.profile.primaryMarket });
    const globalRank = rankIn(global);
    return {
      globalRank,
      totalTraders: global.length,
      globalPercentile: Math.round(
        (1 - (globalRank - 1) / global.length) * 100,
      ),
      firmRank: rankIn(firm),
      firmTraders: firm.length,
      marketRank: rankIn(market),
      marketTraders: market.length,
    };
  }
}

class InMemoryFirmRepository implements FirmRepository {
  constructor(private readonly ix: Indexes) {}

  private standingsFor(firm: Firm): FirmStandings {
    const traders = [...this.ix.traderById.values()]
      .filter((t) => t.firm.id === firm.id)
      .sort((a, b) => b.profile.rating - a.profile.rating);
    const memberIds = new Set(traders.map((t) => t.user.id));
    const weekFrom = weekAgoIso();

    let weeklyWins = 0;
    let weeklyLosses = 0;
    const marketCounts = new Map<Market, number>();
    for (const battle of this.ix.data.battles) {
      const parts = this.ix.participantsByBattle.get(battle.id) ?? [];
      const members = parts.filter((p) => memberIds.has(p.userId));
      if (members.length === 0) continue;
      marketCounts.set(
        battle.market,
        (marketCounts.get(battle.market) ?? 0) + 1,
      );
      if (battle.scheduledStart.slice(0, 10) >= weekFrom) {
        for (const p of members) {
          if (p.result === "WIN") weeklyWins++;
          else if (p.result === "LOSS") weeklyLosses++;
        }
      }
    }
    const averageRating =
      traders.length > 0
        ? Math.round(
            traders.reduce((s, t) => s + t.profile.rating, 0) / traders.length,
          )
        : 0;
    return {
      firm,
      activeTraders: traders.length,
      averageRating,
      weeklyWins,
      weeklyLosses,
      topTraders: traders.slice(0, 3),
      mostTradedMarkets: [...marketCounts.entries()]
        .map(([market, battles]) => ({ market, battles }))
        .sort((a, b) => b.battles - a.battles || a.market.localeCompare(b.market))
        .slice(0, 3),
    };
  }

  async list(): Promise<FirmStandings[]> {
    return this.ix.data.firms
      .map((f) => this.standingsFor(f))
      .sort((a, b) => b.averageRating - a.averageRating);
  }

  async getBySlug(slug: string): Promise<FirmStandings | null> {
    const firm = this.ix.firmBySlug.get(slug);
    return firm ? this.standingsFor(firm) : null;
  }

  async getFirmVsFirm(slug: string): Promise<FirmVsFirmResult[]> {
    const firm = this.ix.firmBySlug.get(slug);
    if (!firm) return [];
    const firmOf = (userId: string) =>
      this.ix.traderById.get(userId)?.firm ?? null;
    const tally = new Map<string, { wins: number; losses: number }>();
    for (const battle of this.ix.data.battles) {
      const parts = this.ix.participantsByBattle.get(battle.id) ?? [];
      if (parts.length !== 2) continue;
      const [a, b] = parts;
      const firmA = firmOf(a.userId);
      const firmB = firmOf(b.userId);
      if (!firmA || !firmB || firmA.id === firmB.id) continue;
      const mine = firmA.id === firm.id ? a : firmB.id === firm.id ? b : null;
      const theirs = mine === a ? firmB : mine === b ? firmA : null;
      if (!mine || !theirs) continue;
      const bucket = tally.get(theirs.id) ?? { wins: 0, losses: 0 };
      if (mine.result === "WIN") bucket.wins++;
      else bucket.losses++;
      tally.set(theirs.id, bucket);
    }
    return [...tally.entries()]
      .map(([firmId, record]) => ({
        opponentFirm: this.ix.firmById.get(firmId)!,
        ...record,
      }))
      .sort((a, b) => a.opponentFirm.name.localeCompare(b.opponentFirm.name));
  }
}

class InMemoryAchievementRepository implements AchievementRepository {
  constructor(private readonly ix: Indexes) {}

  async listCatalog() {
    return this.ix.data.achievements;
  }

  async listForUser(userId: string): Promise<EarnedAchievement[]> {
    const byId = new Map(this.ix.data.achievements.map((a) => [a.id, a]));
    return this.ix.data.userAchievements
      .filter((ua) => ua.userId === userId)
      .map((ua) => ({
        achievement: byId.get(ua.achievementId)!,
        earnedAt: ua.earnedAt,
      }))
      .sort((a, b) => a.earnedAt.localeCompare(b.earnedAt));
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
