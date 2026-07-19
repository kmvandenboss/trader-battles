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
  BattleType,
  BattleWindow,
  League,
  Market,
} from "../schema/enums";
import type {
  AccountSnapshot,
  Achievement,
  Battle,
  BattleMetricSnapshot,
  BattleParticipant,
  ExecutionEvent,
  Firm,
  IntegrationConnection,
  Notification,
  RatingHistoryEntry,
  TraderProfile,
  TradingAccount,
  User,
} from "../schema/types";

// ---------------------------------------------------------------------------
// Composite read models
// ---------------------------------------------------------------------------

export interface TraderWithProfile {
  user: User;
  profile: TraderProfile;
  firm: Firm;
}

export interface ParticipantSummary {
  participant: BattleParticipant;
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
}

export interface BattleRepository {
  getById(battleId: string): Promise<BattleDetail | null>;
  /** Battles for a user, most recent first. */
  listForUser(
    userId: string,
    filter?: BattleHistoryFilter,
  ): Promise<BattleSummary[]>;
  getLatestForUser(userId: string): Promise<BattleDetail | null>;
  /** Most recent completed battles platform-wide (activity feed). */
  listRecent(limit: number): Promise<BattleSummary[]>;
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
  leaderboards: LeaderboardRepository;
  firms: FirmRepository;
  achievements: AchievementRepository;
  notifications: NotificationRepository;
}
