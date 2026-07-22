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

import { randomUUID } from "node:crypto";

import { and, asc, count, desc, eq, gt, gte, inArray, lte, sql } from "drizzle-orm";

import * as t from "../../schema/tables";
import type {
  Battle,
  BattleMetricSnapshot,
  BattleParticipant,
  Challenge,
  ExecutionEvent,
  Firm,
  IntegrationConnection,
  Notification,
  RatingHistoryEntry,
  TraderInvite,
  TradingAccount,
} from "../../schema/types";
import type { BattleStatus, ChallengeStatus, Market } from "../../schema/enums";
import {
  applySettlementToProfile,
  battleDescComparator,
  buildBattleDetail,
  buildChallengeRow,
  buildCsvAccountRow,
  buildImportedExecutionRow,
  buildInviteRow,
  buildMarketBarRow,
  buildNotificationRow,
  buildParticipantSettlementRows,
  buildScheduledBattleRows,
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
  MARK_PRICE_MAX_AGE_MS,
  MARKET_BAR_LENGTH_MS,
  push,
  scheduledAscComparator,
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
  BattleSettlementInput,
  BattleSummary,
  ChallengeRepository,
  ChallengeResponseStatus,
  CreateBattleInput,
  CreateChallengeInput,
  CreateInviteInput,
  CreateNotificationInput,
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
} from "../types";
import type { NormalizedExecutionEvent } from "../../../integrations/types";
import { createDb, type Db } from "./client";
import {
  mapAccountSnapshot,
  mapBattle,
  mapBattleMetricSnapshot,
  mapChallenge,
  mapExecutionEvent,
  mapIntegrationConnection,
  mapMarketBar,
  mapNotification,
  mapRatingHistoryEntry,
  mapTraderInvite,
  mapUser,
  mapUserAchievement,
} from "./rows";

/** Keep IN-list / VALUES statements comfortably inside driver limits. */
const CHUNK = 100;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(rows.slice(i, i + CHUNK));
  return out;
}

/** `excluded."col"` reference for ON CONFLICT DO UPDATE sets. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

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

  async findOrCreateCsvAccount(
    userId: string,
    externalAccountId: string,
    opts?: CsvAccountOptions,
  ): Promise<TradingAccount> {
    const existing = await this.db
      .select()
      .from(t.tradingAccounts)
      .where(
        and(
          eq(t.tradingAccounts.userId, userId),
          eq(t.tradingAccounts.provider, "csv"),
          eq(t.tradingAccounts.externalAccountId, externalAccountId),
        ),
      )
      .orderBy(asc(t.tradingAccounts.id))
      .limit(1);
    if (existing.length > 0) return existing[0];
    const account = buildCsvAccountRow(
      userId,
      externalAccountId,
      opts,
      `acct-csv-${randomUUID()}`,
    );
    await this.db.insert(t.tradingAccounts).values(account);
    return account;
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
    // BattleDetail is a settled composite; unsettled battles are served by
    // getScheduledById instead (same semantics as the in-memory backend).
    if (!isCompletedBattle(battle)) return null;

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
    const mine = (await loadUserBattlesDesc(this.db, userId)).filter(
      isCompletedBattle,
    );
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

  // --- V1 write surface ----------------------------------------------------

  async create(input: CreateBattleInput): Promise<Battle> {
    const battleId = `battle-v1-${randomUUID()}`;
    const { battle, participants } = buildScheduledBattleRows(
      input,
      battleId,
      new Date().toISOString(),
    );
    // neon-http has no transactions: insert parent first, children second,
    // so a partial failure leaves an inert (participant-less) battle row.
    await this.db.insert(t.battles).values(battle);
    await this.db.insert(t.battleParticipants).values(participants);
    return battle;
  }

  private async toScheduledComposites(
    battles: Battle[],
  ): Promise<ScheduledBattle[]> {
    if (battles.length === 0) return [];
    const participantsByBattle = await loadParticipantsByBattle(
      this.db,
      battles.map((b) => b.id),
    );
    const userIds = [
      ...new Set([...participantsByBattle.values()].flat().map((p) => p.userId)),
    ];
    const traderById = await loadTradersByUserIds(this.db, userIds);
    return battles.map((battle) => ({
      battle,
      participants: (participantsByBattle.get(battle.id) ?? []).map((p) => {
        const trader = traderById.get(p.userId);
        if (!trader)
          throw new Error(`inconsistent battle data for ${battle.id}`);
        return { participant: p, trader };
      }),
    }));
  }

  async listScheduledForUser(userId: string): Promise<ScheduledBattle[]> {
    const parts = await this.db
      .select({ battleId: t.battleParticipants.battleId })
      .from(t.battleParticipants)
      .where(eq(t.battleParticipants.userId, userId));
    const battleIds = [...new Set(parts.map((p) => p.battleId))];
    if (battleIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t.battles)
      .where(
        and(
          inArray(t.battles.id, battleIds),
          inArray(t.battles.status, ["SCHEDULED", "SETTLING"]),
        ),
      );
    const battles = rows.map(mapBattle).sort(scheduledAscComparator);
    return this.toScheduledComposites(battles);
  }

  async getScheduledById(battleId: string): Promise<ScheduledBattle | null> {
    const rows = await this.db
      .select()
      .from(t.battles)
      .where(eq(t.battles.id, battleId))
      .limit(1);
    if (rows.length === 0) return null;
    const composites = await this.toScheduledComposites([mapBattle(rows[0])]);
    return composites[0] ?? null;
  }

  async updateStatus(battleId: string, status: BattleStatus): Promise<void> {
    await this.db
      .update(t.battles)
      .set({ status })
      .where(eq(t.battles.id, battleId));
  }

  async saveSettlement(input: BattleSettlementInput): Promise<void> {
    const battleRows = await this.db
      .select()
      .from(t.battles)
      .where(eq(t.battles.id, input.battleId))
      .limit(1);
    if (battleRows.length === 0)
      throw new Error(`unknown battle ${input.battleId}`);
    const battle = mapBattle(battleRows[0]);
    const stored = await this.db
      .select()
      .from(t.battleParticipants)
      .where(eq(t.battleParticipants.battleId, input.battleId))
      .orderBy(asc(t.battleParticipants.id));

    // neon-http has no transactions — statements run sequentially with the
    // battle-row status flip LAST as the "commit point" (a crash mid-way
    // leaves the battle SETTLING and the settlement safely re-runnable:
    // every row id below is deterministic per (battle, user)).

    // Replace prior settlement snapshot/rating rows for this battle.
    await this.db
      .delete(t.battleMetricSnapshots)
      .where(
        and(
          eq(t.battleMetricSnapshots.battleId, input.battleId),
          eq(t.battleMetricSnapshots.isFinal, true),
        ),
      );
    await this.db
      .delete(t.ratingHistory)
      .where(eq(t.ratingHistory.battleId, input.battleId));

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
      // .set() includes the unchanged id/battleId/userId keys — harmless
      // no-op assignments that keep this a single shared row shape.
      await this.db
        .update(t.battleParticipants)
        .set(rows.participant)
        .where(eq(t.battleParticipants.id, participant.id));
      await this.db.insert(t.battleMetricSnapshots).values(rows.finalSnapshot);
      await this.db.insert(t.ratingHistory).values(rows.ratingEntry);

      const profileRows = await this.db
        .select()
        .from(t.traderProfiles)
        .where(eq(t.traderProfiles.userId, pInput.userId))
        .limit(1);
      if (profileRows.length === 0)
        throw new Error(`trader profile missing for ${pInput.userId}`);
      const updated = applySettlementToProfile(
        profileRows[0],
        previousResult,
        pInput.result,
        pInput.endingRating,
      );
      await this.db
        .update(t.traderProfiles)
        .set(updated)
        .where(eq(t.traderProfiles.userId, pInput.userId));
    }

    await this.db
      .update(t.battles)
      .set({
        status: "COMPLETED",
        winnerId: input.winnerId,
        endTime: input.endTime,
        actualStart: battle.actualStart ?? battle.scheduledStart,
        decidedBy: input.decidedBy,
        resolutionDetail: input.resolutionDetail,
      })
      .where(eq(t.battles.id, input.battleId));
  }

  async saveImportedExecutions(
    battleId: string,
    participantUserId: string,
    tradingAccountId: string,
    events: NormalizedExecutionEvent[],
  ): Promise<ImportExecutionsResult> {
    if (events.length === 0) return { inserted: 0, skippedDuplicates: 0 };
    // Existing keys for this account among the incoming provider event ids.
    const seen = new Set<string>();
    for (const c of chunks(events.map((e) => e.providerEventId))) {
      const rows = await this.db
        .select({
          sourceProvider: t.executionEvents.sourceProvider,
          providerEventId: t.executionEvents.providerEventId,
        })
        .from(t.executionEvents)
        .where(
          and(
            eq(t.executionEvents.tradingAccountId, tradingAccountId),
            inArray(t.executionEvents.providerEventId, c),
          ),
        );
      for (const r of rows)
        seen.add(
          executionDedupeKey(r.sourceProvider, r.providerEventId, tradingAccountId),
        );
    }

    const toInsert: ExecutionEvent[] = [];
    let skippedDuplicates = 0;
    for (const event of events) {
      const key = executionDedupeKey(
        event.sourceProvider,
        event.providerEventId,
        tradingAccountId,
      );
      if (seen.has(key)) {
        skippedDuplicates++;
        continue;
      }
      seen.add(key);
      toInsert.push(
        buildImportedExecutionRow(
          event,
          `exec-${randomUUID()}`,
          battleId,
          participantUserId,
          tradingAccountId,
        ),
      );
    }
    for (const c of chunks(toInsert)) {
      await this.db.insert(t.executionEvents).values(c);
    }
    return { inserted: toInsert.length, skippedDuplicates };
  }

  async listImportedExecutions(
    battleId: string,
    userId: string,
  ): Promise<ExecutionEvent[]> {
    const rows = await this.db
      .select()
      .from(t.executionEvents)
      .where(
        and(
          eq(t.executionEvents.battleId, battleId),
          eq(t.executionEvents.userId, userId),
        ),
      );
    return rows
      .map(mapExecutionEvent)
      .sort(
        (a, b) =>
          a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
      );
  }
}

class PostgresChallengeRepository implements ChallengeRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateChallengeInput): Promise<Challenge> {
    const challenge = buildChallengeRow(
      input,
      `challenge-${randomUUID()}`,
      new Date().toISOString(),
    );
    await this.db.insert(t.challenges).values(challenge);
    return challenge;
  }

  async getById(id: string): Promise<Challenge | null> {
    const rows = await this.db
      .select()
      .from(t.challenges)
      .where(eq(t.challenges.id, id))
      .limit(1);
    return rows.length > 0 ? mapChallenge(rows[0]) : null;
  }

  async listForUser(
    userId: string,
  ): Promise<{ incoming: Challenge[]; outgoing: Challenge[] }> {
    const [incomingRows, outgoingRows] = await Promise.all([
      this.db
        .select()
        .from(t.challenges)
        .where(eq(t.challenges.opponentUserId, userId)),
      this.db
        .select()
        .from(t.challenges)
        .where(eq(t.challenges.challengerUserId, userId)),
    ]);
    return {
      incoming: incomingRows.map(mapChallenge).sort(challengeDescComparator),
      outgoing: outgoingRows.map(mapChallenge).sort(challengeDescComparator),
    };
  }

  async respond(
    id: string,
    status: ChallengeResponseStatus,
    respondedAt: string,
    options?: { expectedStatus?: ChallengeStatus },
  ): Promise<Challenge | null> {
    // Atomic conditional UPDATE: with expectedStatus set, a concurrent
    // responder that already moved the row makes this match 0 rows → null.
    const where = options?.expectedStatus
      ? and(
          eq(t.challenges.id, id),
          eq(t.challenges.status, options.expectedStatus),
        )
      : eq(t.challenges.id, id);
    const rows = await this.db
      .update(t.challenges)
      .set({ status, respondedAt })
      .where(where)
      .returning();
    return rows.length > 0 ? mapChallenge(rows[0]) : null;
  }

  async linkBattle(id: string, battleId: string): Promise<void> {
    await this.db
      .update(t.challenges)
      .set({ battleId })
      .where(eq(t.challenges.id, id));
  }
}

class PostgresInviteRepository implements InviteRepository {
  constructor(private readonly db: Db) {}

  async create(input: CreateInviteInput): Promise<TraderInvite> {
    const invite = buildInviteRow(
      input,
      `invite-${randomUUID()}`,
      randomUUID().slice(0, 8),
      new Date().toISOString(),
    );
    await this.db.insert(t.traderInvites).values(invite);
    return invite;
  }

  async listForUser(inviterUserId: string): Promise<TraderInvite[]> {
    const rows = await this.db
      .select()
      .from(t.traderInvites)
      .where(eq(t.traderInvites.inviterUserId, inviterUserId));
    return rows.map(mapTraderInvite).sort(inviteDescComparator);
  }
}

class PostgresMarketDataRepository implements MarketDataRepository {
  constructor(private readonly db: Db) {}

  async saveBars(
    instrument: Market,
    bars: MarketBarInput[],
    source: string,
  ): Promise<SaveBarsResult> {
    if (bars.length === 0) return { inserted: 0, replaced: 0 };
    const importedAt = new Date().toISOString();
    // Deduplicate the input batch on barStart (last one wins), mirroring the
    // upsert semantics row-by-row.
    const byStart = new Map<string, ReturnType<typeof buildMarketBarRow>>();
    for (const bar of bars) {
      const row = buildMarketBarRow(instrument, bar, source, importedAt);
      byStart.set(row.barStart, row);
    }
    const rows = [...byStart.values()];

    // Count how many of these (instrument, barStart) keys already exist.
    let replaced = 0;
    for (const c of chunks(rows.map((r) => r.barStart))) {
      const existing = await this.db
        .select({ barStart: t.marketBars.barStart })
        .from(t.marketBars)
        .where(
          and(
            eq(t.marketBars.instrument, instrument),
            inArray(t.marketBars.barStart, c),
          ),
        );
      replaced += existing.length;
    }

    for (const c of chunks(rows)) {
      await this.db
        .insert(t.marketBars)
        .values(c)
        .onConflictDoUpdate({
          target: [t.marketBars.instrument, t.marketBars.barStart],
          set: {
            open: sqlExcluded("open"),
            high: sqlExcluded("high"),
            low: sqlExcluded("low"),
            close: sqlExcluded("close"),
            volume: sqlExcluded("volume"),
            source: sqlExcluded("source"),
            importedAt: sqlExcluded("imported_at"),
          },
        });
    }
    return { inserted: rows.length - replaced, replaced };
  }

  async getMarkPrice(instrument: Market, atIso: string): Promise<MarkPrice | null> {
    const atMs = Date.parse(atIso);
    // Same semantics as derive.selectMarkPrice: the bar must END by `at`
    // (never a bar still forming at the buzzer), freshness cutoff 5 min.
    const latest = new Date(atMs - MARKET_BAR_LENGTH_MS).toISOString();
    const earliest = new Date(atMs - MARK_PRICE_MAX_AGE_MS).toISOString();
    const rows = await this.db
      .select()
      .from(t.marketBars)
      .where(
        and(
          eq(t.marketBars.instrument, instrument),
          lte(t.marketBars.barStart, latest),
          gt(t.marketBars.barStart, earliest),
        ),
      )
      .orderBy(desc(t.marketBars.barStart))
      .limit(1);
    if (rows.length === 0) return null;
    const bar = mapMarketBar(rows[0]);
    return { price: bar.close, barStart: bar.barStart };
  }

  async hasBars(instrument: Market, fromIso: string, toIso: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: t.marketBars.id })
      .from(t.marketBars)
      .where(
        and(
          eq(t.marketBars.instrument, instrument),
          gte(t.marketBars.barStart, new Date(fromIso).toISOString()),
          lte(t.marketBars.barStart, new Date(toIso).toISOString()),
        ),
      )
      .limit(1);
    return rows.length > 0;
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

  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification = buildNotificationRow(
      input,
      `notification-${randomUUID()}`,
      new Date().toISOString(),
    );
    await this.db.insert(t.notifications).values(notification);
    return notification;
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
    challenges: new PostgresChallengeRepository(db),
    invites: new PostgresInviteRepository(db),
    marketData: new PostgresMarketDataRepository(db),
    leaderboards: new PostgresLeaderboardRepository(db),
    firms: new PostgresFirmRepository(db),
    achievements: new PostgresAchievementRepository(db),
    notifications: new PostgresNotificationRepository(db),
  };
}
