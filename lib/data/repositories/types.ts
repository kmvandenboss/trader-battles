/**
 * Repository interfaces — the ONLY data-access surface the rest of the app
 * may use. Server components, API routes, and engines read through these
 * interfaces; they never import seed data or (later) a DB client directly.
 *
 * PLUG-IN POINT: the demo binds these interfaces to the in-memory seed
 * implementation (inMemory.ts). A future Postgres implementation (Drizzle +
 * the schema in lib/data/schema) implements these same interfaces and is
 * swapped in via getRepositories() (index.ts) with zero caller changes.
 * All methods are async for exactly that reason.
 */

import type {
  BattleResult,
  BattleStatus,
  BattleType,
  BattleWindow,
  ChallengeStatus,
  League,
  Market,
  VerificationStatus,
} from "../schema/enums";
import type {
  AccountSnapshot,
  Achievement,
  Battle,
  BattleMetricSnapshot,
  BattleParticipant,
  Challenge,
  ExecutionEvent,
  Firm,
  IntegrationConnection,
  Notification,
  RatingHistoryEntry,
  TraderProfile,
  TradingAccount,
  User,
} from "../schema/types";
import type { NormalizedExecutionEvent } from "../../integrations/types";

// ---------------------------------------------------------------------------
// Composite read models
// ---------------------------------------------------------------------------

export interface TraderWithProfile {
  user: User;
  profile: TraderProfile;
  firm: Firm;
}

/**
 * A participant row from a COMPLETED (settled) battle. The outcome columns
 * are nullable at the schema level because participants now exist from the
 * moment a battle is scheduled, but every completed battle is guaranteed to
 * carry them (saveSettlement always sets all four) — summarizeBattle
 * (derive.ts) validates and narrows at runtime.
 */
export type SettledBattleParticipant = BattleParticipant & {
  tradingAccountId: string;
  endingRating: number;
  finalScore: number;
  result: BattleResult;
};

export interface ParticipantSummary {
  participant: SettledBattleParticipant;
  trader: TraderWithProfile;
  /** Final (end-of-battle) metric snapshot: net P&L, drawdown, components. */
  metrics: BattleMetricSnapshot;
  ratingChange: number;
}

export interface BattleSummary {
  battle: Battle;
  participants: [ParticipantSummary, ParticipantSummary];
}

export interface BattleDetail extends BattleSummary {
  executionEvents: ExecutionEvent[];
  accountSnapshots: AccountSnapshot[];
  /** Chronological intra-battle metric snapshots (finals included). */
  metricTimeline: BattleMetricSnapshot[];
}

export interface BattleHistoryFilter {
  result?: "WIN" | "LOSS";
  market?: Market;
  battleType?: BattleType;
  battleWindow?: BattleWindow;
  opponentUserId?: string;
  /** ISO date bounds (inclusive) on scheduledStart. */
  from?: string;
  to?: string;
  limit?: number;
}

export interface LeaderboardQuery {
  league?: League;
  market?: Market;
  firmSlug?: string;
  /** Restrict to battles within a period when ranking by activity. */
  limit?: number;
  offset?: number;
}

export interface LeaderboardEntry {
  rank: number;
  trader: TraderWithProfile;
  winRate: number; // season, 0-1
}

export interface TraderStanding {
  globalRank: number;
  totalTraders: number;
  /** 0-100; higher is better (e.g. 92 = top 8%). */
  globalPercentile: number;
  firmRank: number;
  firmTraders: number;
  /** Rank among traders whose primary market matches this trader's. */
  marketRank: number;
  marketTraders: number;
}

export interface FirmStandings {
  firm: Firm;
  activeTraders: number;
  averageRating: number;
  weeklyWins: number;
  weeklyLosses: number;
  topTraders: TraderWithProfile[];
  mostTradedMarkets: Array<{ market: Market; battles: number }>;
}

export interface FirmVsFirmResult {
  opponentFirm: Firm;
  wins: number;
  losses: number;
}

export interface EarnedAchievement {
  achievement: Achievement;
  earnedAt: string;
}

// ---------------------------------------------------------------------------
// V1 write models (battles scheduled ahead, imported, settled after the fact)
// ---------------------------------------------------------------------------

/**
 * Lightweight composite for battles that have no settlement yet (SCHEDULED /
 * SETTLING) — participants without metrics or outcomes. The battle
 * detail/import screens read this instead of the metrics-bearing
 * ParticipantSummary.
 */
export interface ScheduledBattleParticipant {
  participant: BattleParticipant;
  trader: TraderWithProfile;
}

export interface ScheduledBattle {
  battle: Battle;
  participants: ScheduledBattleParticipant[];
}

export interface CreateBattleParticipantInput {
  userId: string;
  /** The trader's rating captured at scheduling time. */
  startingRating: number;
}

/**
 * Input for BattleRepository.create. The battle is created SCHEDULED with
 * scoringMode PNL_V1, battleType LIVE_PERFORMANCE, and verificationStatus
 * SELF_REPORTED (real imported data — never SIMULATED, never
 * provider-verified in v1).
 */
export interface CreateBattleInput {
  /** ISO UTC — start of the battle window. */
  scheduledStart: string;
  /** ISO UTC — end of the battle window. */
  scheduledEnd: string;
  battleWindow: BattleWindow;
  /** Optional instrument pin; null/omitted = open choice (v1 default). */
  market?: Market | null;
  /** Account-size bracket label, e.g. "50K". */
  accountBracket?: string | null;
  participants: [CreateBattleParticipantInput, CreateBattleParticipantInput];
  /** ISO UTC; defaults to the current time. */
  createdAt?: string;
}

/** Per-participant settlement values (computed by lib/battles/settleBattle). */
export interface ParticipantSettlementInput {
  userId: string;
  tradingAccountId: string;
  endingRating: number;
  /** Headline points (PNL_V1: dollars + bonus; may be negative/large). */
  finalScore: number;
  result: BattleResult;
  realizedPnl: number;
  participationBonus: number;
  closedTradeCount: number;
  /** Gross profit / loss dollars (loss POSITIVE). Never a profit factor. */
  grossProfit: number;
  grossLoss: number;
  markOutPnl: number;
  markOutStatus: string | null;
  markOutNote: string | null;
  /** For the final metric snapshot row. */
  maximumDrawdown: number;
  tradeCount: number;
}

/** Input for BattleRepository.saveSettlement — one call persists everything. */
export interface BattleSettlementInput {
  battleId: string;
  /** Null on a draw. */
  winnerId: string | null;
  /** ISO UTC — when the battle window closed / was settled. */
  endTime: string;
  /** Tiebreaker-cascade stage that decided it, e.g. "REALIZED_PNL". */
  decidedBy: string;
  resolutionDetail: string | null;
  /** SELF_REPORTED / CLIENT_VERIFIED for imported data — never SIMULATED. */
  verificationStatus: VerificationStatus;
  participants: [ParticipantSettlementInput, ParticipantSettlementInput];
}

export interface ImportExecutionsResult {
  inserted: number;
  skippedDuplicates: number;
}

export interface CreateChallengeInput {
  challengerUserId: string;
  opponentUserId: string;
  /** ISO calendar date of the proposed session, e.g. "2026-07-22". */
  sessionDate: string;
  battleWindow: BattleWindow;
  /** Optional instrument pin; null/omitted = open choice. */
  market?: Market | null;
  accountBracket: string;
  message?: string | null;
  /** ISO UTC; defaults to the current time. */
  createdAt?: string;
}

/** The states a pending challenge can be moved to by a user response. */
export type ChallengeResponseStatus = "ACCEPTED" | "DECLINED" | "CANCELLED";

export interface MarketBarInput {
  /** ISO UTC start of the 1-minute bar. */
  barStart: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SaveBarsResult {
  inserted: number;
  replaced: number;
}

export interface MarkPrice {
  /** CLOSE of the freshest bar at/before the requested time. */
  price: number;
  /** ISO UTC start of that bar. */
  barStart: string;
}

export interface CsvAccountOptions {
  /** Account-size bracket label ("50K" → $50,000 starting balance). */
  bracket?: string;
  /** Defaults to PROP_EVALUATION. */
  accountType?: "PROP_EVALUATION" | "PROP_FUNDED";
  /** Optional human label, stored in account metadata (planName). */
  displayLabel?: string;
}

// ---------------------------------------------------------------------------
// Repository interfaces
// ---------------------------------------------------------------------------

export interface TraderRepository {
  /** The pre-authenticated demo user (KevinV). */
  getDemoTrader(): Promise<TraderWithProfile>;
  getById(userId: string): Promise<TraderWithProfile | null>;
  getByDisplayName(displayName: string): Promise<TraderWithProfile | null>;
  list(filter?: {
    league?: League;
    firmSlug?: string;
    primaryMarket?: Market;
  }): Promise<TraderWithProfile[]>;
  getRatingHistory(userId: string): Promise<RatingHistoryEntry[]>;
  getAccounts(userId: string): Promise<TradingAccount[]>;
  getConnections(userId: string): Promise<IntegrationConnection[]>;
  /**
   * Find (by userId + provider "csv" + externalAccountId) or create the
   * trading account a CSV import belongs to. Created accounts are
   * SELF_REPORTED, CONNECTED, ACTIVE, propFirm "MFFU"; starting/current
   * balance derive from the bracket ("50K" → 50000; unknown → 0).
   */
  findOrCreateCsvAccount(
    userId: string,
    externalAccountId: string,
    opts?: CsvAccountOptions,
  ): Promise<TradingAccount>;
}

export interface BattleRepository {
  getById(battleId: string): Promise<BattleDetail | null>;
  /** COMPLETED battles for a user, most recent first. */
  listForUser(
    userId: string,
    filter?: BattleHistoryFilter,
  ): Promise<BattleSummary[]>;
  /** The user's most recent COMPLETED battle. */
  getLatestForUser(userId: string): Promise<BattleDetail | null>;
  /** Most recent completed battles platform-wide (activity feed). */
  listRecent(limit: number): Promise<BattleSummary[]>;

  // --- V1 write surface (scheduled windows → import → settlement) ----------

  /**
   * Create a SCHEDULED PNL_V1 battle plus its two participant rows
   * (outcome columns null until settlement). Returns the battle row.
   */
  create(input: CreateBattleInput): Promise<Battle>;
  /** A user's v1 battles still in flight (SCHEDULED or SETTLING), soonest first. */
  listScheduledForUser(userId: string): Promise<ScheduledBattle[]>;
  /** The metrics-free composite for any battle (any status) — import/detail screens. */
  getScheduledById(battleId: string): Promise<ScheduledBattle | null>;
  updateStatus(battleId: string, status: BattleStatus): Promise<void>;
  /**
   * Persist a full settlement in one call: participant outcomes + PNL_V1
   * columns, battle result columns (status COMPLETED), one final
   * battle_metric_snapshot per participant, one rating_history row per
   * participant, and the trader_profiles rating/record/streak updates.
   * Idempotent: re-settling the same battle replaces the prior settlement
   * rows (deterministic row ids) and reverses the prior W/L contribution
   * before applying the new one — same input twice yields identical state.
   */
  saveSettlement(input: BattleSettlementInput): Promise<void>;
  /**
   * Persist imported (already normalized) execution events with battle
   * linkage. An event whose (sourceProvider, providerEventId,
   * tradingAccountId) is already stored is skipped — re-imports are
   * idempotent.
   */
  saveImportedExecutions(
    battleId: string,
    participantUserId: string,
    tradingAccountId: string,
    events: NormalizedExecutionEvent[],
  ): Promise<ImportExecutionsResult>;
  /** Stored execution events for one participant of a battle, chronological. */
  listImportedExecutions(
    battleId: string,
    userId: string,
  ): Promise<ExecutionEvent[]>;
}

export interface ChallengeRepository {
  /** Create a PENDING challenge (id "challenge-<uuid>"). */
  create(input: CreateChallengeInput): Promise<Challenge>;
  getById(id: string): Promise<Challenge | null>;
  /** A user's challenges, newest first, split by direction. */
  listForUser(
    userId: string,
  ): Promise<{ incoming: Challenge[]; outgoing: Challenge[] }>;
  /**
   * Move a challenge out of PENDING. Returns the updated challenge, or null
   * if it does not exist.
   *
   * When `options.expectedStatus` is provided, the update only applies if
   * the row's CURRENT status matches it; otherwise null is returned and
   * nothing is written. Callers pass `{ expectedStatus: "PENDING" }` to
   * guard double-accept races (on Postgres this is an atomic conditional
   * UPDATE ... WHERE status = expected).
   */
  respond(
    id: string,
    status: ChallengeResponseStatus,
    respondedAt: string,
    options?: { expectedStatus?: ChallengeStatus },
  ): Promise<Challenge | null>;
  /** Attach the materialized battle after an accept. */
  linkBattle(id: string, battleId: string): Promise<void>;
}

export interface MarketDataRepository {
  /**
   * Upsert 1-minute OHLCV bars for an instrument, one row per
   * (instrument, barStart) — re-imports replace existing bars.
   */
  saveBars(
    instrument: Market,
    bars: MarketBarInput[],
    source: string,
  ): Promise<SaveBarsResult>;
  /**
   * The CLOSE of the latest bar that ENDS at or before `at` (1-minute
   * bars: barStart <= at − 1 minute), with a freshness cutoff of
   * barStart > at − 5 minutes. A bar still forming at the buzzer closes
   * after it and is never used, so no post-window price action leaks into
   * a mark. Null when no bar is close enough — settlement then excludes
   * the open position and notes it.
   */
  getMarkPrice(instrument: Market, atIso: string): Promise<MarkPrice | null>;
  /** Whether any bar exists with fromIso <= barStart <= toIso. */
  hasBars(instrument: Market, fromIso: string, toIso: string): Promise<boolean>;
}

export interface LeaderboardRepository {
  query(query?: LeaderboardQuery): Promise<{
    entries: LeaderboardEntry[];
    total: number;
  }>;
  getStanding(userId: string): Promise<TraderStanding | null>;
}

export interface FirmRepository {
  list(): Promise<FirmStandings[]>;
  getBySlug(slug: string): Promise<FirmStandings | null>;
  getFirmVsFirm(slug: string): Promise<FirmVsFirmResult[]>;
}

export interface AchievementRepository {
  listCatalog(): Promise<Achievement[]>;
  listForUser(userId: string): Promise<EarnedAchievement[]>;
}

export interface NotificationRepository {
  listForUser(
    userId: string,
    options?: { unreadOnly?: boolean },
  ): Promise<Notification[]>;
  countUnread(userId: string): Promise<number>;
}

/** Everything the app reads through. Obtain via getRepositories(). */
export interface Repositories {
  traders: TraderRepository;
  battles: BattleRepository;
  challenges: ChallengeRepository;
  marketData: MarketDataRepository;
  leaderboards: LeaderboardRepository;
  firms: FirmRepository;
  achievements: AchievementRepository;
  notifications: NotificationRepository;
}
