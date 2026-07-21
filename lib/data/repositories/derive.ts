/**
 * Shared, pure derivation helpers used by BOTH repository implementations:
 * the in-memory seed impl (inMemory.ts) and the Postgres impl (postgres/).
 *
 * Firm standings, leaderboards, ranks, percentiles, and battle summaries are
 * DERIVED from traders + battles here — never stored — and both impls import
 * these exact functions, so the two backends cannot drift apart.
 *
 * Everything in this module is pure: plain domain rows in, plain read models
 * out. No I/O, no ORM imports, no environment access.
 *
 * NOTE: the firm "weekly record" window is anchored to the demo `DEMO_TODAY`
 * constant so the seeded dataset derives identical standings on either
 * backend. When v1 settlement (Phase D) introduces real, current battles,
 * re-anchor this to the actual current date in one place — here.
 */

import { DEMO_TODAY } from "../seed/constants";
import type {
  AccountSnapshot,
  Achievement,
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
  TraderProfile,
  TradingAccount,
  User,
  UserAchievement,
} from "../schema/types";
import type { BattleResult, League, Market } from "../schema/enums";
import { leagueForRating } from "../leagues";
import type {
  BattleDetail,
  BattleHistoryFilter,
  BattleSummary,
  CreateBattleInput,
  CreateChallengeInput,
  CreateInviteInput,
  CsvAccountOptions,
  EarnedAchievement,
  FirmStandings,
  FirmVsFirmResult,
  LeaderboardEntry,
  LeaderboardQuery,
  MarketBarInput,
  MarkPrice,
  ParticipantSettlementInput,
  ParticipantSummary,
  SettledBattleParticipant,
  TraderStanding,
  TraderWithProfile,
} from "./types";
import type { NormalizedExecutionEvent } from "../../integrations/types";

// ---------------------------------------------------------------------------
// Small shared utilities
// ---------------------------------------------------------------------------

/** ISO date 7 days before the demo "today" — the firm weekly-record window. */
export function weekAgoIso(): string {
  const t = new Date(`${DEMO_TODAY}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - 7);
  return t.toISOString().slice(0, 10);
}

/** Append `value` to the array under `key`, creating it if needed. */
export function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

// ---------------------------------------------------------------------------
// Traders
// ---------------------------------------------------------------------------

/**
 * Join users + profiles + firms into TraderWithProfile, keyed by user id.
 * Users without a profile, or profiles pointing at a missing firm, are
 * skipped (same semantics on both backends).
 */
export function buildTraderIndex(
  users: User[],
  profiles: TraderProfile[],
  firms: Firm[],
): Map<string, TraderWithProfile> {
  const firmById = new Map(firms.map((f) => [f.id, f]));
  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
  const traderById = new Map<string, TraderWithProfile>();
  for (const user of users) {
    const profile = profileByUser.get(user.id);
    if (!profile) continue;
    const firm = firmById.get(profile.firmId);
    if (!firm) continue;
    traderById.set(user.id, { user, profile, firm });
  }
  return traderById;
}

/** traders.list ordering: rating descending (stable over the input order). */
export function filterAndSortTraders(
  traders: TraderWithProfile[],
  filter?: {
    league?: League;
    firmSlug?: string;
    primaryMarket?: Market;
  },
): TraderWithProfile[] {
  let result = [...traders];
  if (filter?.league)
    result = result.filter((t) => t.profile.league === filter.league);
  if (filter?.firmSlug)
    result = result.filter((t) => t.firm.slug === filter.firmSlug);
  if (filter?.primaryMarket)
    result = result.filter(
      (t) => t.profile.primaryMarket === filter.primaryMarket,
    );
  return result.sort((a, b) => b.profile.rating - a.profile.rating);
}

// ---------------------------------------------------------------------------
// Battles
// ---------------------------------------------------------------------------

/** Battles most recent first; id descending as a deterministic tiebreak. */
export function battleDescComparator(a: Battle, b: Battle): number {
  return (
    b.scheduledStart.localeCompare(a.scheduledStart) || b.id.localeCompare(a.id)
  );
}

/** History/standings/summaries only ever consider settled battles. */
export function isCompletedBattle(battle: Battle): boolean {
  return battle.status === "COMPLETED";
}

/**
 * Narrow a participant row to its settled shape. Outcome columns are
 * nullable in the schema (participants exist from scheduling time), but a
 * COMPLETED battle's participants always carry them — anything else is
 * inconsistent data and throws rather than mislabeling an unsettled row.
 */
export function toSettledParticipant(
  participant: BattleParticipant,
): SettledBattleParticipant {
  const { tradingAccountId, endingRating, finalScore, result } = participant;
  if (
    tradingAccountId === null ||
    endingRating === null ||
    finalScore === null ||
    result === null
  ) {
    throw new Error(
      `participant ${participant.id} of battle ${participant.battleId} has no settlement`,
    );
  }
  return { ...participant, tradingAccountId, endingRating, finalScore, result };
}

export function summarizeBattle(
  battle: Battle,
  participants: BattleParticipant[],
  traderById: ReadonlyMap<string, TraderWithProfile>,
  finalMetricsByParticipant: ReadonlyMap<string, BattleMetricSnapshot>,
): BattleSummary {
  const summaries = participants.map((row): ParticipantSummary => {
    const participant = toSettledParticipant(row);
    const trader = traderById.get(participant.userId);
    const metrics = finalMetricsByParticipant.get(participant.id);
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

export function buildBattleDetail(
  summary: BattleSummary,
  executionEvents: ExecutionEvent[],
  accountSnapshots: AccountSnapshot[],
  metricSnapshots: BattleMetricSnapshot[],
): BattleDetail {
  const timeline = [...metricSnapshots].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id),
  );
  const events = [...executionEvents].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  );
  const snapshots = [...accountSnapshots].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id),
  );
  return {
    ...summary,
    executionEvents: events,
    accountSnapshots: snapshots,
    metricTimeline: timeline,
  };
}

/**
 * Apply a BattleHistoryFilter to a user's battles (already most recent
 * first). Returns the filtered — and, when `limit` is set, truncated — list.
 */
export function filterBattleHistory(
  battlesDesc: Battle[],
  userId: string,
  participantsByBattle: ReadonlyMap<string, BattleParticipant[]>,
  filter?: BattleHistoryFilter,
): Battle[] {
  // History is explicitly settled-battles-only: SCHEDULED/SETTLING v1
  // battles surface through BattleRepository.listScheduledForUser instead.
  let battles = battlesDesc.filter(isCompletedBattle);
  // A null market (v1 open-instrument battle) never matches a market filter.
  if (filter?.market) battles = battles.filter((b) => b.market === filter.market);
  if (filter?.battleType)
    battles = battles.filter((b) => b.battleType === filter.battleType);
  if (filter?.battleWindow)
    battles = battles.filter((b) => b.battleWindow === filter.battleWindow);
  if (filter?.from)
    battles = battles.filter((b) => b.scheduledStart >= filter.from!);
  if (filter?.to)
    battles = battles.filter((b) => b.scheduledStart.slice(0, 10) <= filter.to!);
  if (filter?.result)
    battles = battles.filter((b) =>
      filter.result === "WIN" ? b.winnerId === userId : b.winnerId !== userId,
    );
  if (filter?.opponentUserId)
    battles = battles.filter((b) =>
      (participantsByBattle.get(b.id) ?? []).some(
        (p) => p.userId === filter.opponentUserId,
      ),
    );
  return filter?.limit !== undefined ? battles.slice(0, filter.limit) : battles;
}

// ---------------------------------------------------------------------------
// Leaderboards & standings
// ---------------------------------------------------------------------------

/** Leaderboard order: rating desc, display name asc (fully deterministic). */
export function rankTraders(
  traders: TraderWithProfile[],
  filter?: LeaderboardQuery,
): TraderWithProfile[] {
  let result = [...traders];
  if (filter?.league)
    result = result.filter((t) => t.profile.league === filter.league);
  if (filter?.market)
    result = result.filter((t) => t.profile.primaryMarket === filter.market);
  if (filter?.firmSlug)
    result = result.filter((t) => t.firm.slug === filter.firmSlug);
  return result.sort(
    (a, b) =>
      b.profile.rating - a.profile.rating ||
      a.user.displayName.localeCompare(b.user.displayName),
  );
}

export function leaderboardPage(
  traders: TraderWithProfile[],
  query?: LeaderboardQuery,
): { entries: LeaderboardEntry[]; total: number } {
  const ranked = rankTraders(traders, query);
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

export function computeStanding(
  userId: string,
  traders: TraderWithProfile[],
): TraderStanding | null {
  const me = traders.find((t) => t.user.id === userId);
  if (!me) return null;
  const rankIn = (list: TraderWithProfile[]) =>
    list.findIndex((t) => t.user.id === userId) + 1;
  const global = rankTraders(traders);
  const firm = rankTraders(traders, { firmSlug: me.firm.slug });
  const market = rankTraders(traders, { market: me.profile.primaryMarket });
  const globalRank = rankIn(global);
  return {
    globalRank,
    totalTraders: global.length,
    globalPercentile: Math.round((1 - (globalRank - 1) / global.length) * 100),
    firmRank: rankIn(firm),
    firmTraders: firm.length,
    marketRank: rankIn(market),
    marketTraders: market.length,
  };
}

// ---------------------------------------------------------------------------
// Firms
// ---------------------------------------------------------------------------

export function deriveFirmStandings(
  firm: Firm,
  allTraders: TraderWithProfile[],
  battles: Battle[],
  participantsByBattle: ReadonlyMap<string, BattleParticipant[]>,
): FirmStandings {
  const traders = allTraders
    .filter((t) => t.firm.id === firm.id)
    .sort((a, b) => b.profile.rating - a.profile.rating);
  const memberIds = new Set(traders.map((t) => t.user.id));
  const weekFrom = weekAgoIso();

  let weeklyWins = 0;
  let weeklyLosses = 0;
  const marketCounts = new Map<Market, number>();
  for (const battle of battles) {
    // Only settled battles count toward standings; a participant's null
    // result (unsettled) or DRAW contributes to neither W nor L.
    if (!isCompletedBattle(battle)) continue;
    const parts = participantsByBattle.get(battle.id) ?? [];
    const members = parts.filter((p) => memberIds.has(p.userId));
    if (members.length === 0) continue;
    // A null market (open-instrument v1 battle) counts in no market bucket.
    if (battle.market !== null) {
      marketCounts.set(battle.market, (marketCounts.get(battle.market) ?? 0) + 1);
    }
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

/** FirmStandings list order: average rating descending (stable). */
export function sortFirmStandings(list: FirmStandings[]): FirmStandings[] {
  return list.sort((a, b) => b.averageRating - a.averageRating);
}

export function deriveFirmVsFirm(
  firm: Firm,
  traderById: ReadonlyMap<string, TraderWithProfile>,
  firmById: ReadonlyMap<string, Firm>,
  battles: Battle[],
  participantsByBattle: ReadonlyMap<string, BattleParticipant[]>,
): FirmVsFirmResult[] {
  const firmOf = (userId: string) => traderById.get(userId)?.firm ?? null;
  const tally = new Map<string, { wins: number; losses: number }>();
  for (const battle of battles) {
    // Only settled battles count; null results (unsettled) and DRAWs are
    // excluded from the head-to-head record on both sides.
    if (!isCompletedBattle(battle)) continue;
    const parts = participantsByBattle.get(battle.id) ?? [];
    if (parts.length !== 2) continue;
    const [a, b] = parts;
    const firmA = firmOf(a.userId);
    const firmB = firmOf(b.userId);
    if (!firmA || !firmB || firmA.id === firmB.id) continue;
    const mine = firmA.id === firm.id ? a : firmB.id === firm.id ? b : null;
    const theirs = mine === a ? firmB : mine === b ? firmA : null;
    if (!mine || !theirs) continue;
    if (mine.result !== "WIN" && mine.result !== "LOSS") continue;
    const bucket = tally.get(theirs.id) ?? { wins: 0, losses: 0 };
    if (mine.result === "WIN") bucket.wins++;
    else bucket.losses++;
    tally.set(theirs.id, bucket);
  }
  return [...tally.entries()]
    .map(([firmId, record]) => ({
      opponentFirm: firmById.get(firmId)!,
      ...record,
    }))
    .sort((a, b) => a.opponentFirm.name.localeCompare(b.opponentFirm.name));
}

// ---------------------------------------------------------------------------
// Rating history, achievements, notifications
// ---------------------------------------------------------------------------

/** Chronological: createdAt asc, id asc. Sorts in place, returns the list. */
export function sortRatingHistory(
  entries: RatingHistoryEntry[],
): RatingHistoryEntry[] {
  return entries.sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/** Most recent first, id asc on equal timestamps (backend-independent order). Sorts in place. */
export function sortNotificationsDesc(list: Notification[]): Notification[] {
  return list.sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
}

export function deriveEarnedAchievements(
  catalog: Achievement[],
  userAchievements: UserAchievement[],
  userId: string,
): EarnedAchievement[] {
  const byId = new Map(catalog.map((a) => [a.id, a]));
  return userAchievements
    .filter((ua) => ua.userId === userId)
    .map((ua) => ({
      achievement: byId.get(ua.achievementId)!,
      earnedAt: ua.earnedAt,
    }))
    .sort((a, b) => a.earnedAt.localeCompare(b.earnedAt));
}

// ---------------------------------------------------------------------------
// V1 write-path helpers — shared by BOTH backends so battle creation,
// settlement, and market-data reads behave identically in-memory and on
// Postgres. All pure.
// ---------------------------------------------------------------------------

/** Newest first: createdAt desc, id desc as a deterministic tiebreak. */
export function challengeDescComparator(a: Challenge, b: Challenge): number {
  return (
    b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  );
}

/** Newest first: createdAt desc, id desc as a deterministic tiebreak. */
export function inviteDescComparator(
  a: TraderInvite,
  b: TraderInvite,
): number {
  return (
    b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
  );
}

/** Scheduled battles soonest first (start asc, id asc). */
export function scheduledAscComparator(a: Battle, b: Battle): number {
  return (
    a.scheduledStart.localeCompare(b.scheduledStart) || a.id.localeCompare(b.id)
  );
}

/**
 * Starting balance for an account-size bracket label: "50K" → 50000,
 * "150K" → 150000. Unknown/unparseable brackets yield 0 (honest "unknown"
 * rather than a made-up balance).
 */
export function bracketStartingBalance(bracket: string | undefined): number {
  if (!bracket) return 0;
  const match = /^(\d+(?:\.\d+)?)\s*K$/i.exec(bracket.trim());
  if (!match) return 0;
  return Math.round(parseFloat(match[1]) * 1000);
}

/** How stale a bar may be and still serve as a mark price (exclusive bound). */
export const MARK_PRICE_MAX_AGE_MS = 5 * 60_000;

/** Stored market bars are 1-minute bars: a bar's CLOSE prints barStart + 1m. */
export const MARKET_BAR_LENGTH_MS = 60_000;

/**
 * Pick the mark price from a set of bars: the CLOSE of the latest bar that
 * ENDS at or before `at` (barStart <= at − 1 minute) — a bar that is still
 * forming at the buzzer closes AFTER it and must never leak post-window
 * price action into a mark. Freshness cutoff unchanged: barStart >
 * at − 5 minutes. Null when nothing qualifies. Deterministic (ties on
 * barStart cannot occur — one bar per (instrument, barStart)).
 */
export function selectMarkPrice(
  bars: readonly MarketBar[],
  atIso: string,
): MarkPrice | null {
  const atMs = Date.parse(atIso);
  const latestMs = atMs - MARKET_BAR_LENGTH_MS; // bar must END by `at`
  const earliestMs = atMs - MARK_PRICE_MAX_AGE_MS;
  let best: MarketBar | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const bar of bars) {
    const ms = Date.parse(bar.barStart);
    if (ms <= latestMs && ms > earliestMs && ms > bestMs) {
      best = bar;
      bestMs = ms;
    }
  }
  return best ? { price: best.close, barStart: best.barStart } : null;
}

/**
 * Row builders for the v1 write surface. Both backends persist EXACTLY
 * these rows; only id generation and storage differ.
 */

/** scoringConfigurationId stamped on v1 PNL_V1 battles. */
export const PNL_V1_SCORING_CONFIGURATION_ID = "scoring-config-pnl-v1";

/** Battle + participant rows for BattleRepository.create. */
export function buildScheduledBattleRows(
  input: CreateBattleInput,
  battleId: string,
  nowIso: string,
): { battle: Battle; participants: BattleParticipant[] } {
  const battle: Battle = {
    id: battleId,
    battleType: "LIVE_PERFORMANCE",
    market: input.market ?? null,
    status: "SCHEDULED",
    scheduledStart: input.scheduledStart,
    scheduledEnd: input.scheduledEnd,
    actualStart: null,
    endTime: null,
    battleWindow: input.battleWindow,
    scoringConfigurationId: PNL_V1_SCORING_CONFIGURATION_ID,
    scoringMode: "PNL_V1",
    accountBracket: input.accountBracket ?? null,
    winnerId: null,
    decidedBy: null,
    resolutionDetail: null,
    // Real (imported) data — never SIMULATED, never provider-verified in v1.
    verificationStatus: "SELF_REPORTED",
    createdAt: input.createdAt ?? nowIso,
  };
  const participants: BattleParticipant[] = input.participants.map((p) => ({
    // Deterministic per (battle, user) so settlement rows can reference it.
    id: `bp-${battleId}-${p.userId}`,
    battleId,
    userId: p.userId,
    tradingAccountId: null,
    startingRating: p.startingRating,
    endingRating: null,
    finalScore: null,
    result: null,
    verificationStatus: "SELF_REPORTED",
    realizedPnl: null,
    participationBonus: null,
    closedTradeCount: null,
    grossProfit: null,
    grossLoss: null,
    markOutPnl: null,
    markOutStatus: null,
    markOutNote: null,
  }));
  return { battle, participants };
}

/**
 * Invite row for InviteRepository.create. `id` and `inviteCode` are
 * generated by the calling repository's create() method (randomUUID-based),
 * never by the caller of the repository.
 */
export function buildInviteRow(
  input: CreateInviteInput,
  id: string,
  inviteCode: string,
  nowIso: string,
): TraderInvite {
  return {
    id,
    inviterUserId: input.inviterUserId,
    inviteeName: input.inviteeName ?? null,
    inviteeEmail: input.inviteeEmail,
    message: input.message ?? null,
    inviteCode,
    createdAt: nowIso,
  };
}

/** Challenge row for ChallengeRepository.create. */
export function buildChallengeRow(
  input: CreateChallengeInput,
  id: string,
  nowIso: string,
): Challenge {
  return {
    id,
    challengerUserId: input.challengerUserId,
    opponentUserId: input.opponentUserId,
    status: "PENDING",
    sessionDate: input.sessionDate,
    battleWindow: input.battleWindow,
    market: input.market ?? null,
    accountBracket: input.accountBracket,
    message: input.message ?? null,
    battleId: null,
    createdAt: input.createdAt ?? nowIso,
    respondedAt: null,
  };
}

/** Trading-account row for TraderRepository.findOrCreateCsvAccount. */
export function buildCsvAccountRow(
  userId: string,
  externalAccountId: string,
  opts: CsvAccountOptions | undefined,
  id: string,
): TradingAccount {
  const balance = bracketStartingBalance(opts?.bracket);
  return {
    id,
    userId,
    provider: "csv",
    externalAccountId,
    accountType: opts?.accountType ?? "PROP_EVALUATION",
    propFirm: "MFFU",
    startingBalance: balance,
    currentBalance: balance,
    status: "ACTIVE",
    connectionStatus: "CONNECTED",
    // Unknown limits default to 0 ("not tracked") rather than invented caps.
    maximumContracts: 0,
    dailyLossLimit: 0,
    metadata: {
      ...(opts?.displayLabel ? { planName: opts.displayLabel } : {}),
      note: "Created from a CSV trade import (self-reported).",
    },
    verificationStatus: "SELF_REPORTED",
  };
}

/** Dedupe key for stored executions: provider-native id scoped to account. */
export function executionDedupeKey(
  sourceProvider: ExecutionEvent["sourceProvider"],
  providerEventId: string,
  tradingAccountId: string,
): string {
  return `${sourceProvider}|${providerEventId}|${tradingAccountId}`;
}

/** execution_events row for an imported, already-normalized event. */
export function buildImportedExecutionRow(
  event: NormalizedExecutionEvent,
  id: string,
  battleId: string,
  userId: string,
  tradingAccountId: string,
): ExecutionEvent {
  return {
    id,
    providerEventId: event.providerEventId,
    sourceProvider: event.sourceProvider,
    tradingAccountId,
    battleId,
    userId,
    instrument: event.instrument,
    side: event.side,
    quantity: event.quantity,
    price: event.price,
    commission: event.commission,
    occurredAt: event.occurredAt,
    receivedAt: event.receivedAt,
    eventType: event.eventType,
    verificationStatus: event.verificationStatus,
    rawPayload: event.rawPayload,
  };
}

/**
 * market_bars row. The id is deterministic per (instrument, barStart) —
 * the same key the unique index enforces — so upserts converge.
 */
export function buildMarketBarRow(
  instrument: Market,
  bar: MarketBarInput,
  source: string,
  importedAt: string,
): MarketBar {
  const barStart = new Date(bar.barStart).toISOString();
  return {
    id: `bar-${instrument}-${barStart}`,
    instrument,
    barStart,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    source,
    importedAt,
  };
}

/**
 * The settlement rows for one participant: the updated participant row, the
 * final battle_metric_snapshot, and the rating_history entry. Row ids are
 * deterministic per (battle, user) so a re-settlement REPLACES the prior
 * rows instead of accumulating.
 */
export function buildParticipantSettlementRows(
  stored: BattleParticipant,
  input: ParticipantSettlementInput,
  battleId: string,
  endTime: string,
  verificationStatus: Battle["verificationStatus"],
): {
  participant: BattleParticipant;
  finalSnapshot: BattleMetricSnapshot;
  ratingEntry: RatingHistoryEntry;
} {
  const participant: BattleParticipant = {
    ...stored,
    tradingAccountId: input.tradingAccountId,
    endingRating: input.endingRating,
    finalScore: input.finalScore,
    result: input.result,
    verificationStatus,
    realizedPnl: input.realizedPnl,
    participationBonus: input.participationBonus,
    closedTradeCount: input.closedTradeCount,
    grossProfit: input.grossProfit,
    grossLoss: input.grossLoss,
    markOutPnl: input.markOutPnl,
    markOutStatus: input.markOutStatus,
    markOutNote: input.markOutNote,
  };
  const finalSnapshot: BattleMetricSnapshot = {
    id: `bms-${battleId}-${input.userId}-final`,
    battleId,
    participantId: stored.id,
    // Battle P&L includes the hypothetical mark-out — may differ from
    // account P&L; the UI labels this honestly.
    netPnl: input.realizedPnl + input.markOutPnl,
    maximumDrawdown: input.maximumDrawdown,
    tradeCount: input.tradeCount,
    riskUtilization: 0,
    // PNL_V1 has no 4-factor components; zeros keep the row shape valid.
    performanceScore: 0,
    riskEfficiencyScore: 0,
    disciplineScore: 0,
    consistencyScore: 0,
    totalBattleScore: input.finalScore,
    isFinal: true,
    timestamp: endTime,
    verificationStatus,
  };
  const ratingEntry: RatingHistoryEntry = {
    id: `rh-${battleId}-${input.userId}`,
    userId: input.userId,
    battleId,
    previousRating: stored.startingRating,
    newRating: input.endingRating,
    change: input.endingRating - stored.startingRating,
    createdAt: endTime,
  };
  return { participant, finalSnapshot, ratingEntry };
}

/**
 * The trader-profile fields a settlement updates. Pure so both backends
 * apply EXACTLY the same rating/record/streak semantics.
 *
 * Idempotency contract (see BattleRepository.saveSettlement): the caller
 * passes `previousResult` = the result this battle had already contributed
 * (null on first settlement). The prior W/L contribution is reversed before
 * the new one is applied, and the rating is set ABSOLUTELY to endingRating,
 * so re-running the same settlement converges to the identical profile.
 *
 * Streak semantics: a DRAW resets the streak to 0. On a re-settlement whose
 * result is unchanged the streak is left untouched; if a re-settlement
 * CHANGES the result, the prior chain cannot be reconstructed, so the
 * streak restarts at 1 / -1 / 0 in the new direction (best-effort,
 * documented limitation — bestWinStreak never shrinks).
 */
export function applySettlementToProfile(
  profile: TraderProfile,
  previousResult: BattleResult | null,
  result: BattleResult,
  endingRating: number,
): TraderProfile {
  let {
    seasonWins,
    seasonLosses,
    lifetimeWins,
    lifetimeLosses,
    currentStreak,
    bestWinStreak,
  } = profile;

  // Reverse the prior contribution of THIS battle (re-settlement).
  if (previousResult === "WIN") {
    seasonWins = Math.max(0, seasonWins - 1);
    lifetimeWins = Math.max(0, lifetimeWins - 1);
  } else if (previousResult === "LOSS") {
    seasonLosses = Math.max(0, seasonLosses - 1);
    lifetimeLosses = Math.max(0, lifetimeLosses - 1);
  }

  // Apply the new result. A DRAW increments neither W nor L.
  if (result === "WIN") {
    seasonWins += 1;
    lifetimeWins += 1;
  } else if (result === "LOSS") {
    seasonLosses += 1;
    lifetimeLosses += 1;
  }

  if (previousResult === null) {
    // First settlement: extend/replace the running streak.
    if (result === "WIN") currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
    else if (result === "LOSS")
      currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
    else currentStreak = 0;
  } else if (previousResult !== result) {
    // Changed re-settlement: restart in the new direction (best effort).
    currentStreak = result === "WIN" ? 1 : result === "LOSS" ? -1 : 0;
  }
  // previousResult === result → streak unchanged (idempotent re-run).

  bestWinStreak = Math.max(bestWinStreak, currentStreak);
  const placement = leagueForRating(endingRating);
  return {
    ...profile,
    rating: endingRating,
    league: placement.league,
    division: placement.division,
    seasonWins,
    seasonLosses,
    lifetimeWins,
    lifetimeLosses,
    currentStreak,
    bestWinStreak,
    seasonHighRating: Math.max(profile.seasonHighRating, endingRating),
  };
}
