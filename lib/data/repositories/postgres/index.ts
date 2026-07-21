/**
 * Postgres (Neon) repository implementation — the v1 real-data path.
 *
 * Implements the exact `Repositories` interface from ../types against the
 * Drizzle schema in lib/data/schema via the neon-http driver, selected by
 * getRepositories() when DATABASE_URL is set. Zero caller changes: server
 * components, API routes, and engines keep reading through the same
 * interface they used against the in-memory seed.
 *
 * Design: methods load the needed rows via Drizzle, then reuse the SAME
 * pure derivation helpers (../derive.ts) as the in-memory implementation
 * for every ranking, standing, percentile, and battle summary. Dataset
 * scale is tiny (tens of traders, hundreds of battles), so correctness and
 * no-drift beat SQL cleverness; row loads use deterministic primary-key
 * ordering so stable sorts resolve ties reproducibly.
 *
 * Neon is standard Postgres — this implementation migrates to MFFU's own
 * Postgres untouched (only the driver in ./client.ts could change).
 */

import { and, asc, count, eq, inArray } from "drizzle-orm";

import * as t from "../../schema/tables";
import type {
  Battle,
  BattleMetricSnapshot,
  BattleParticipant,
  Firm,
  IntegrationConnection,
  Notification,
  RatingHistoryEntry,
  TradingAccount,
} from "../../schema/types";
import type { Market } from "../../schema/enums";
import {
  battleDescComparator,
  buildBattleDetail,
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
} from "../derive";
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
} from "../types";
import { createDb, type Db } from "./client";
import {
  mapAccountSnapshot,
  mapBattle,
  mapBattleMetricSnapshot,
  mapExecutionEvent,
  mapIntegrationConnection,
  mapNotification,
  mapRatingHistoryEntry,
  mapUser,
  mapUserAchievement,
} from "./rows";

// ---------------------------------------------------------------------------
// Shared row loaders
// ---------------------------------------------------------------------------

type TraderJoinRow = {
  user: typeof t.users.$inferSelect;
  profile: typeof t.traderProfiles.$inferSelect;
  firm: typeof t.firms.$inferSelect;
};

function toTrader(row: TraderJoinRow): TraderWithProfile {
  return { user: mapUser(row.user), profile: row.profile, firm: row.firm };
}

/** users ⋈ trader_profiles ⋈ firms, deterministically ordered by user id. */
function traderJoin(db: Db) {
  return db
    .select({ user: t.users, profile: t.traderProfiles, firm: t.firms })
    .from(t.users)
    .innerJoin(t.traderProfiles, eq(t.traderProfiles.userId, t.users.id))
    .innerJoin(t.firms, eq(t.firms.id, t.traderProfiles.firmId));
}

async function loadAllTraders(db: Db): Promise<TraderWithProfile[]> {
  const rows = await traderJoin(db).orderBy(asc(t.users.id));
  return rows.map(toTrader);
}

async function loadTradersByUserIds(
  db: Db,
  userIds: string[],
): Promise<Map<string, TraderWithProfile>> {
  if (userIds.length === 0) return new Map();
  const rows = await traderJoin(db)
    .where(inArray(t.users.id, userIds))
    .orderBy(asc(t.users.id));
  return new Map(rows.map((r) => [r.user.id, toTrader(r)]));
}

async function loadParticipantsByBattle(
  db: Db,
  battleIds: string[],
): Promise<Map<string, BattleParticipant[]>> {
  const grouped = new Map<string, BattleParticipant[]>();
  if (battleIds.length === 0) return grouped;
  const rows = await db
    .select()
    .from(t.battleParticipants)
    .where(inArray(t.battleParticipants.battleId, battleIds))
    .orderBy(asc(t.battleParticipants.id));
  for (const p of rows) push(grouped, p.battleId, p);
  return grouped;
}

async function loadFinalMetrics(
  db: Db,
  battleIds: string[],
): Promise<Map<string, BattleMetricSnapshot>> {
  if (battleIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(t.battleMetricSnapshots)
    .where(
      and(
        inArray(t.battleMetricSnapshots.battleId, battleIds),
        eq(t.battleMetricSnapshots.isFinal, true),
      ),
    )
    .orderBy(asc(t.battleMetricSnapshots.id));
  return new Map(rows.map((m) => [m.participantId, mapBattleMetricSnapshot(m)]));
}

/** Summarize already-loaded battles (order preserved). */
async function summarizeBattles(
  db: Db,
  battles: Battle[],
): Promise<BattleSummary[]> {
  if (battles.length === 0) return [];
  const battleIds = battles.map((b) => b.id);
  const participantsByBattle = await loadParticipantsByBattle(db, battleIds);
  const finalMetrics = await loadFinalMetrics(db, battleIds);
  const userIds = [
    ...new Set(
      [...participantsByBattle.values()].flat().map((p) => p.userId),
    ),
  ];
  const traderById = await loadTradersByUserIds(db, userIds);
  return battles.map((b) =>
    summarizeBattle(
      b,
      participantsByBattle.get(b.id) ?? [],
      traderById,
      finalMetrics,
    ),
  );
}

/** All battles a user participated in, most recent first. */
async function loadUserBattlesDesc(db: Db, userId: string): Promise<Battle[]> {
  const parts = await db
    .select({ battleId: t.battleParticipants.battleId })
    .from(t.battleParticipants)
    .where(eq(t.battleParticipants.userId, userId));
  const battleIds = [...new Set(parts.map((p) => p.battleId))];
  if (battleIds.length === 0) return [];
  const rows = await db
    .select()
    .from(t.battles)
    .where(inArray(t.battles.id, battleIds));
  return rows.map(mapBattle).sort(battleDescComparator);
}

// ---------------------------------------------------------------------------
// Repository implementations
// ---------------------------------------------------------------------------

class PostgresTraderRepository implements TraderRepository {
  constructor(private readonly db: Db) {}

  async getDemoTrader(): Promise<TraderWithProfile> {
    const rows = await traderJoin(this.db)
      .where(eq(t.users.isDemoUser, true))
      .orderBy(asc(t.users.id))
      .limit(1);
    if (rows.length === 0) throw new Error("demo trader missing");
    return toTrader(rows[0]);
  }

  async getById(userId: string): Promise<TraderWithProfile | null> {
    const rows = await traderJoin(this.db).where(eq(t.users.id, userId)).limit(1);
    return rows.length > 0 ? toTrader(rows[0]) : null;
  }

  async getByDisplayName(displayName: string): Promise<TraderWithProfile | null> {
    const rows = await traderJoin(this.db)
      .where(eq(t.users.displayName, displayName))
      .limit(1);
    return rows.length > 0 ? toTrader(rows[0]) : null;
  }

  async list(filter?: {
    league?: TraderWithProfile["profile"]["league"];
    firmSlug?: string;
    primaryMarket?: Market;
  }): Promise<TraderWithProfile[]> {
    return filterAndSortTraders(await loadAllTraders(this.db), filter);
  }

  async getRatingHistory(userId: string): Promise<RatingHistoryEntry[]> {
    const rows = await this.db
      .select()
      .from(t.ratingHistory)
      .where(eq(t.ratingHistory.userId, userId));
    return sortRatingHistory(rows.map(mapRatingHistoryEntry));
  }

  async getAccounts(userId: string): Promise<TradingAccount[]> {
    return this.db
      .select()
      .from(t.tradingAccounts)
      .where(eq(t.tradingAccounts.userId, userId))
      .orderBy(asc(t.tradingAccounts.id));
  }

  async getConnections(userId: string): Promise<IntegrationConnection[]> {
    const rows = await this.db
      .select()
      .from(t.integrationConnections)
      .where(eq(t.integrationConnections.userId, userId))
      .orderBy(asc(t.integrationConnections.id));
    return rows.map(mapIntegrationConnection);
  }
}

class PostgresBattleRepository implements BattleRepository {
  constructor(private readonly db: Db) {}

  async getById(battleId: string): Promise<BattleDetail | null> {
    const battleRows = await this.db
      .select()
      .from(t.battles)
      .where(eq(t.battles.id, battleId))
      .limit(1);
    if (battleRows.length === 0) return null;
    const battle = mapBattle(battleRows[0]);

    const [participantsByBattle, metricRows, eventRows, snapshotRows] =
      await Promise.all([
        loadParticipantsByBattle(this.db, [battle.id]),
        this.db
          .select()
          .from(t.battleMetricSnapshots)
          .where(eq(t.battleMetricSnapshots.battleId, battle.id)),
        this.db
          .select()
          .from(t.executionEvents)
          .where(eq(t.executionEvents.battleId, battle.id)),
        this.db
          .select()
          .from(t.accountSnapshots)
          .where(eq(t.accountSnapshots.battleId, battle.id)),
      ]);

    const participants = participantsByBattle.get(battle.id) ?? [];
    const metrics = metricRows.map(mapBattleMetricSnapshot);
    const finalMetrics = new Map(
      metrics.filter((m) => m.isFinal).map((m) => [m.participantId, m]),
    );
    const traderById = await loadTradersByUserIds(
      this.db,
      participants.map((p) => p.userId),
    );
    const summary = summarizeBattle(battle, participants, traderById, finalMetrics);
    return buildBattleDetail(
      summary,
      eventRows.map(mapExecutionEvent),
      snapshotRows.map(mapAccountSnapshot),
      metrics,
    );
  }

  async listForUser(
    userId: string,
    filter?: BattleHistoryFilter,
  ): Promise<BattleSummary[]> {
    const mine = await loadUserBattlesDesc(this.db, userId);
    if (mine.length === 0) return [];
    // Participants of the candidate battles (needed for the opponent filter,
    // and again by summarize — reloaded there for the filtered subset only).
    const participantsByBattle = await loadParticipantsByBattle(
      this.db,
      mine.map((b) => b.id),
    );
    const filtered = filterBattleHistory(mine, userId, participantsByBattle, filter);
    return summarizeBattles(this.db, filtered);
  }

  async getLatestForUser(userId: string): Promise<BattleDetail | null> {
    const mine = await loadUserBattlesDesc(this.db, userId);
    return mine.length > 0 ? this.getById(mine[0].id) : null;
  }

  async listRecent(limit: number): Promise<BattleSummary[]> {
    const rows = await this.db
      .select()
      .from(t.battles)
      .where(eq(t.battles.status, "COMPLETED"));
    const recent = rows.map(mapBattle).sort(battleDescComparator).slice(0, limit);
    return summarizeBattles(this.db, recent);
  }
}

class PostgresLeaderboardRepository implements LeaderboardRepository {
  constructor(private readonly db: Db) {}

  async query(query?: LeaderboardQuery) {
    return leaderboardPage(await loadAllTraders(this.db), query);
  }

  async getStanding(userId: string): Promise<TraderStanding | null> {
    return computeStanding(userId, await loadAllTraders(this.db));
  }
}

class PostgresFirmRepository implements FirmRepository {
  constructor(private readonly db: Db) {}

  /** Firms + everything firm standings derive from (traders + battles). */
  private async loadContext(): Promise<{
    firms: Firm[];
    traders: TraderWithProfile[];
    battles: Battle[];
    participantsByBattle: Map<string, BattleParticipant[]>;
  }> {
    const [firms, traders, battleRows, participantRows] = await Promise.all([
      this.db.select().from(t.firms).orderBy(asc(t.firms.id)),
      loadAllTraders(this.db),
      this.db.select().from(t.battles).orderBy(asc(t.battles.id)),
      this.db
        .select()
        .from(t.battleParticipants)
        .orderBy(asc(t.battleParticipants.id)),
    ]);
    const participantsByBattle = new Map<string, BattleParticipant[]>();
    for (const p of participantRows) push(participantsByBattle, p.battleId, p);
    return {
      firms,
      traders,
      battles: battleRows.map(mapBattle),
      participantsByBattle,
    };
  }

  async list(): Promise<FirmStandings[]> {
    const ctx = await this.loadContext();
    return sortFirmStandings(
      ctx.firms.map((f) =>
        deriveFirmStandings(f, ctx.traders, ctx.battles, ctx.participantsByBattle),
      ),
    );
  }

  async getBySlug(slug: string): Promise<FirmStandings | null> {
    const ctx = await this.loadContext();
    const firm = ctx.firms.find((f) => f.slug === slug);
    if (!firm) return null;
    return deriveFirmStandings(
      firm,
      ctx.traders,
      ctx.battles,
      ctx.participantsByBattle,
    );
  }

  async getFirmVsFirm(slug: string): Promise<FirmVsFirmResult[]> {
    const ctx = await this.loadContext();
    const firm = ctx.firms.find((f) => f.slug === slug);
    if (!firm) return [];
    const traderById = new Map(ctx.traders.map((tr) => [tr.user.id, tr]));
    const firmById = new Map(ctx.firms.map((f) => [f.id, f]));
    return deriveFirmVsFirm(
      firm,
      traderById,
      firmById,
      ctx.battles,
      ctx.participantsByBattle,
    );
  }
}

class PostgresAchievementRepository implements AchievementRepository {
  constructor(private readonly db: Db) {}

  async listCatalog() {
    return this.db.select().from(t.achievements).orderBy(asc(t.achievements.id));
  }

  async listForUser(userId: string): Promise<EarnedAchievement[]> {
    const [catalog, earned] = await Promise.all([
      this.listCatalog(),
      this.db
        .select()
        .from(t.userAchievements)
        .where(eq(t.userAchievements.userId, userId))
        .orderBy(asc(t.userAchievements.id)),
    ]);
    return deriveEarnedAchievements(
      catalog,
      earned.map(mapUserAchievement),
      userId,
    );
  }
}

class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly db: Db) {}

  async listForUser(
    userId: string,
    options?: { unreadOnly?: boolean },
  ): Promise<Notification[]> {
    const rows = await this.db
      .select()
      .from(t.notifications)
      .where(eq(t.notifications.userId, userId))
      .orderBy(asc(t.notifications.id));
    const all = sortNotificationsDesc(rows.map(mapNotification));
    return options?.unreadOnly ? all.filter((n) => !n.read) : all;
  }

  async countUnread(userId: string): Promise<number> {
    const rows = await this.db
      .select({ value: count() })
      .from(t.notifications)
      .where(
        and(eq(t.notifications.userId, userId), eq(t.notifications.read, false)),
      );
    return rows[0]?.value ?? 0;
  }
}

/**
 * Build the full Postgres repository set. Connects lazily via neon-http —
 * no query runs until a repository method is awaited.
 */
export function createPostgresRepositories(databaseUrl: string): Repositories {
  const db = createDb(databaseUrl);
  return {
    traders: new PostgresTraderRepository(db),
    battles: new PostgresBattleRepository(db),
    leaderboards: new PostgresLeaderboardRepository(db),
    firms: new PostgresFirmRepository(db),
    achievements: new PostgresAchievementRepository(db),
    notifications: new PostgresNotificationRepository(db),
  };
}
