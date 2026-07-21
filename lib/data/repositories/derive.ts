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
  ExecutionEvent,
  Firm,
  Notification,
  RatingHistoryEntry,
  TraderProfile,
  User,
  UserAchievement,
} from "../schema/types";
import type { League, Market } from "../schema/enums";
import type {
  BattleDetail,
  BattleHistoryFilter,
  BattleSummary,
  EarnedAchievement,
  FirmStandings,
  FirmVsFirmResult,
  LeaderboardEntry,
  LeaderboardQuery,
  ParticipantSummary,
  TraderStanding,
  TraderWithProfile,
} from "./types";

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

export function summarizeBattle(
  battle: Battle,
  participants: BattleParticipant[],
  traderById: ReadonlyMap<string, TraderWithProfile>,
  finalMetricsByParticipant: ReadonlyMap<string, BattleMetricSnapshot>,
): BattleSummary {
  const summaries = participants.map((participant): ParticipantSummary => {
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
  let battles = battlesDesc;
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
    const parts = participantsByBattle.get(battle.id) ?? [];
    const members = parts.filter((p) => memberIds.has(p.userId));
    if (members.length === 0) continue;
    marketCounts.set(battle.market, (marketCounts.get(battle.market) ?? 0) + 1);
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
    const parts = participantsByBattle.get(battle.id) ?? [];
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
