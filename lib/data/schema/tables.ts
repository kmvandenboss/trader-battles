/**
 * Drizzle ORM (pg-core) table definitions — the canonical Trader Battles
 * domain model.
 *
 * IMPORTANT: the demo runs WITHOUT a database. These tables exist so that:
 *   1. every domain type is inferred from a Postgres-portable schema
 *      (see types.ts), and
 *   2. a real Postgres can later be provisioned from this exact schema and
 *      dropped in behind lib/data/repositories/* with zero caller changes.
 *
 * Money values are stored as double precision dollars and scores as double
 * precision 0-100 values — adequate for the demo; a production migration may
 * tighten these to numeric/integer-cents without changing domain semantics.
 *
 * Timestamps use { mode: "string" } (ISO-8601 UTC strings) so seed data is
 * JSON-serializable and deterministic.
 */

import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  ACCOUNT_STATUSES,
  ACCOUNT_TYPES,
  ACHIEVEMENT_CATEGORIES,
  BATTLE_RESULTS,
  BATTLE_STATUSES,
  BATTLE_STYLES,
  BATTLE_TYPES,
  BATTLE_WINDOWS,
  CHALLENGE_STATUSES,
  CONNECTION_STATUSES,
  CONNECTION_TYPES,
  DIVISIONS,
  EXECUTION_EVENT_TYPES,
  FIRM_KINDS,
  INTEGRATION_PROVIDERS,
  LEAGUES,
  MARKETS,
  NOTIFICATION_TYPES,
  ORDER_SIDES,
  SCORING_MODES,
  VERIFICATION_STATUSES,
  type Market,
} from "./enums";
import { authUsers } from "./authTables";

// ---------------------------------------------------------------------------
// Postgres enums (kept in lockstep with the TS unions in enums.ts)
// ---------------------------------------------------------------------------

export const leagueEnum = pgEnum("league", LEAGUES);
export const divisionEnum = pgEnum("division", DIVISIONS);
export const marketEnum = pgEnum("market", MARKETS);
export const battleTypeEnum = pgEnum("battle_type", BATTLE_TYPES);
export const battleStatusEnum = pgEnum("battle_status", BATTLE_STATUSES);
export const battleWindowEnum = pgEnum("battle_window", BATTLE_WINDOWS);
export const battleResultEnum = pgEnum("battle_result", BATTLE_RESULTS);
export const battleStyleEnum = pgEnum("battle_style", BATTLE_STYLES);
export const executionEventTypeEnum = pgEnum(
  "execution_event_type",
  EXECUTION_EVENT_TYPES,
);
export const orderSideEnum = pgEnum("order_side", ORDER_SIDES);
export const verificationStatusEnum = pgEnum(
  "verification_status",
  VERIFICATION_STATUSES,
);
export const integrationProviderEnum = pgEnum(
  "integration_provider",
  INTEGRATION_PROVIDERS,
);
export const connectionTypeEnum = pgEnum("connection_type", CONNECTION_TYPES);
export const connectionStatusEnum = pgEnum(
  "connection_status",
  CONNECTION_STATUSES,
);
export const accountStatusEnum = pgEnum("account_status", ACCOUNT_STATUSES);
export const accountTypeEnum = pgEnum("account_type", ACCOUNT_TYPES);
export const firmKindEnum = pgEnum("firm_kind", FIRM_KINDS);
export const achievementCategoryEnum = pgEnum(
  "achievement_category",
  ACHIEVEMENT_CATEGORIES,
);
export const notificationTypeEnum = pgEnum(
  "notification_type",
  NOTIFICATION_TYPES,
);
export const challengeStatusEnum = pgEnum(
  "challenge_status",
  CHALLENGE_STATUSES,
);
/** Kept in lockstep with lib/scoring/config.ts — see enums.ts SCORING_MODES. */
export const scoringModeEnum = pgEnum("scoring_mode", SCORING_MODES);

// ---------------------------------------------------------------------------
// Core identity
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().unique(),
  email: text("email").notNull().unique(),
  avatarUrl: text("avatar_url"),
  /** True only for the pre-authenticated demo account (KevinV). */
  isDemoUser: boolean("is_demo_user").notNull().default(false),
  /**
   * Bridge-auth link: one Auth.js user ↔ one domain user (see authTables.ts).
   * Null for seeded demo users; set by the sign-up flow. Replaced when
   * MFFU's real identity system lands.
   */
  authUserId: text("auth_user_id")
    .unique()
    .references(() => authUsers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .notNull(),
});

/**
 * Firms / account affiliations (MFFU, Tradeify, Apex, Topstep, Independent,
 * Brokerage Accounts). All demo entities — no real partnership implied.
 * Standings (active traders, avg rating, weekly record, firm-vs-firm) are
 * DERIVED from traders + battles by FirmRepository, never stored, so they can
 * never drift out of sync with battle data.
 */
export const firms = pgTable("firms", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: firmKindEnum("kind").notNull(),
  description: text("description").notNull(),
  /** Always true in the demo: firm pages must carry demo-data labeling. */
  isDemoData: boolean("is_demo_data").notNull().default(true),
});

export const traderProfiles = pgTable("trader_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id),
  firmId: text("firm_id")
    .notNull()
    .references(() => firms.id),
  rating: integer("rating").notNull(),
  league: leagueEnum("league").notNull(),
  division: divisionEnum("division").notNull(),
  primaryMarket: marketEnum("primary_market").notNull(),
  secondaryMarkets: jsonb("secondary_markets").$type<Market[]>().notNull(),
  battleStyle: battleStyleEnum("battle_style").notNull(),
  disciplineScore: integer("discipline_score").notNull(),
  riskScore: integer("risk_score").notNull(),
  performanceScore: integer("performance_score").notNull(),
  seasonWins: integer("season_wins").notNull(),
  seasonLosses: integer("season_losses").notNull(),
  lifetimeWins: integer("lifetime_wins").notNull(),
  lifetimeLosses: integer("lifetime_losses").notNull(),
  /** Positive = consecutive wins, negative = consecutive losses. */
  currentStreak: integer("current_streak").notNull(),
  bestWinStreak: integer("best_win_streak").notNull(),
  seasonStartRating: integer("season_start_rating").notNull(),
  seasonHighRating: integer("season_high_rating").notNull(),
});

// ---------------------------------------------------------------------------
// Accounts & integrations
// ---------------------------------------------------------------------------

/** Non-sensitive account metadata. NEVER store secrets or tokens here. */
export interface TradingAccountMetadata {
  planName?: string;
  dailyDrawdownRemaining?: number;
  note?: string;
}

export const tradingAccounts = pgTable("trading_accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  provider: integrationProviderEnum("provider").notNull(),
  externalAccountId: text("external_account_id").notNull(),
  accountType: accountTypeEnum("account_type").notNull(),
  /** Display name of the firm affiliation, e.g. "MFFU" (demo data). */
  propFirm: text("prop_firm").notNull(),
  startingBalance: doublePrecision("starting_balance").notNull(),
  currentBalance: doublePrecision("current_balance").notNull(),
  status: accountStatusEnum("status").notNull(),
  connectionStatus: connectionStatusEnum("connection_status").notNull(),
  maximumContracts: integer("maximum_contracts").notNull(),
  dailyLossLimit: doublePrecision("daily_loss_limit").notNull(),
  metadata: jsonb("metadata").$type<TradingAccountMetadata>().notNull(),
  verificationStatus: verificationStatusEnum("verification_status").notNull(),
});

/**
 * Non-secret connection metadata. Real integrations will keep tokens in a
 * dedicated secrets store — NEVER in this column.
 */
export interface AccessMetadata {
  scopes?: string[];
  note?: string;
}

export const integrationConnections = pgTable("integration_connections", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  provider: integrationProviderEnum("provider").notNull(),
  connectionType: connectionTypeEnum("connection_type").notNull(),
  status: connectionStatusEnum("status").notNull(),
  externalUserId: text("external_user_id").notNull(),
  accessMetadata: jsonb("access_metadata").$type<AccessMetadata>().notNull(),
  connectedAt: timestamp("connected_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  lastSyncedAt: timestamp("last_synced_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  verificationStatus: verificationStatusEnum("verification_status").notNull(),
});

// ---------------------------------------------------------------------------
// Battles
// ---------------------------------------------------------------------------

export const battles = pgTable("battles", {
  id: text("id").primaryKey(),
  battleType: battleTypeEnum("battle_type").notNull(),
  /**
   * NULLABLE since v1: instrument choice is open to each trader, so a v1
   * battle does not pin one product (null = open choice). Seeded demo
   * battles always carry a market.
   */
  market: marketEnum("market"),
  status: battleStatusEnum("status").notNull(),
  scheduledStart: timestamp("scheduled_start", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  /**
   * End of the v1 battle window [scheduledStart, scheduledEnd]. Settlement
   * scores only trades inside this window. Null on seeded demo battles
   * (their duration is implied by battleWindow + endTime).
   */
  scheduledEnd: timestamp("scheduled_end", {
    withTimezone: true,
    mode: "string",
  }),
  actualStart: timestamp("actual_start", {
    withTimezone: true,
    mode: "string",
  }),
  endTime: timestamp("end_time", { withTimezone: true, mode: "string" }),
  battleWindow: battleWindowEnum("battle_window").notNull(),
  scoringConfigurationId: text("scoring_configuration_id").notNull(),
  /**
   * Which scoring engine settles this battle. Seeded demo battles are
   * NORMALIZED_4F (the retained 4-factor mode); v1 battles are PNL_V1.
   */
  scoringMode: scoringModeEnum("scoring_mode")
    .notNull()
    .default("NORMALIZED_4F"),
  /**
   * Account-size bracket label (e.g. "50K"). Informational — matching by
   * bracket happens at challenge/matchmaking time, not here.
   */
  accountBracket: text("account_bracket"),
  winnerId: text("winner_id").references(() => users.id),
  /** Tiebreaker-cascade outcome, e.g. "REALIZED_PNL" or "PROFIT_FACTOR". */
  decidedBy: text("decided_by"),
  /** Human-readable settlement resolution detail (cascade explanation). */
  resolutionDetail: text("resolution_detail"),
  verificationStatus: verificationStatusEnum("verification_status").notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
});

/**
 * One row per (battle, trader). Since v1, participant rows are created when
 * a battle is SCHEDULED — before any import or settlement exists — so the
 * account link and every outcome column are NULLABLE and filled by
 * settlement (BattleRepository.saveSettlement).
 */
export const battleParticipants = pgTable("battle_participants", {
  id: text("id").primaryKey(),
  battleId: text("battle_id")
    .notNull()
    .references(() => battles.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  /** Null until the trader's account is known (v1: at import time). */
  tradingAccountId: text("trading_account_id").references(
    () => tradingAccounts.id,
  ),
  startingRating: integer("starting_rating").notNull(),
  /** Null until settled. */
  endingRating: integer("ending_rating"),
  /**
   * Authoritative battle score (computed server-side, never in UI). Null
   * until settled. For NORMALIZED_4F battles this is the 0-100 composite;
   * for PNL_V1 battles it is the headline points value (mark-out realized
   * PnL dollars + participation bonus) and can be negative or large.
   */
  finalScore: doublePrecision("final_score"),
  /** Null until settled. */
  result: battleResultEnum("result"),
  verificationStatus: verificationStatusEnum("verification_status").notNull(),
  // --- PNL_V1 settlement detail (all null until settled; null on 4F rows).
  /** Realized PnL dollars from in-window closed round-trips. */
  realizedPnl: doublePrecision("realized_pnl"),
  /** Capped participation bonus points applied to finalScore. */
  participationBonus: doublePrecision("participation_bonus"),
  /** Closed round-trip trades inside the window. */
  closedTradeCount: integer("closed_trade_count"),
  /**
   * Gross profit / gross loss dollars (loss stored as a POSITIVE number).
   * We persist these two, NEVER a profit factor — profit factor can be
   * Infinity (gross loss 0) and is derived at read time by the scoring
   * engine's tiebreaker instead.
   */
  grossProfit: doublePrecision("gross_profit"),
  grossLoss: doublePrecision("gross_loss"),
  /** Hypothetical buzzer mark-out PnL for a position open at window close. */
  markOutPnl: doublePrecision("mark_out_pnl"),
  /** How the mark-out was resolved (e.g. "NONE", "MARKED", "EXCLUDED"). */
  markOutStatus: text("mark_out_status"),
  /** Honest note when a mark-out was estimated or excluded. */
  markOutNote: text("mark_out_note"),
});

/**
 * Direct challenges (v1): a trader challenges a specific opponent to a named
 * future window. On ACCEPTED the challenge materializes into a Battle
 * (battleId set via ChallengeRepository.linkBattle); both trade that same
 * window and are scored on it.
 */
export const challenges = pgTable("challenges", {
  id: text("id").primaryKey(),
  challengerUserId: text("challenger_user_id")
    .notNull()
    .references(() => users.id),
  opponentUserId: text("opponent_user_id")
    .notNull()
    .references(() => users.id),
  status: challengeStatusEnum("status").notNull(),
  /** ISO calendar date of the proposed session, e.g. "2026-07-22". */
  sessionDate: text("session_date").notNull(),
  battleWindow: battleWindowEnum("battle_window").notNull(),
  /** Optional instrument pin; null = open choice (the v1 default). */
  market: marketEnum("market"),
  /** Account-size bracket both sides compete in, e.g. "50K". */
  accountBracket: text("account_bracket").notNull(),
  message: text("message"),
  /** Set when the challenge is accepted and materialized into a battle. */
  battleId: text("battle_id").references(() => battles.id),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  respondedAt: timestamp("responded_at", {
    withTimezone: true,
    mode: "string",
  }),
});

/**
 * Imported 1-minute OHLCV market bars. Used by v1 settlement to mark open
 * positions at the window close (buzzer mark-out). One bar per
 * (instrument, barStart) — imports UPSERT on that key so re-imports are
 * idempotent (MarketDataRepository.saveBars).
 */
export const marketBars = pgTable(
  "market_bars",
  {
    id: text("id").primaryKey(),
    instrument: marketEnum("instrument").notNull(),
    /** UTC start of the 1-minute bar. */
    barStart: timestamp("bar_start", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull(),
    /** Where the bar came from, e.g. "csv". */
    source: text("source").notNull(),
    importedAt: timestamp("imported_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    uniqueIndex("market_bars_instrument_bar_start_idx").on(
      table.instrument,
      table.barStart,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Execution events — THE key future-facing model. Every provider (mock today,
// NinjaTrader/Tradovate/Rithmic later) is normalized into this exact shape
// before anything downstream (ledger, scoring, battles) sees it.
// ---------------------------------------------------------------------------

export const executionEvents = pgTable("execution_events", {
  id: text("id").primaryKey(),
  /** Provider-native event id — the dedupe key alongside sourceProvider. */
  providerEventId: text("provider_event_id").notNull(),
  sourceProvider: integrationProviderEnum("source_provider").notNull(),
  tradingAccountId: text("trading_account_id")
    .notNull()
    .references(() => tradingAccounts.id),
  battleId: text("battle_id").references(() => battles.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  instrument: marketEnum("instrument").notNull(),
  side: orderSideEnum("side").notNull(),
  quantity: integer("quantity").notNull(),
  price: doublePrecision("price").notNull(),
  commission: doublePrecision("commission").notNull(),
  occurredAt: timestamp("occurred_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  receivedAt: timestamp("received_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  eventType: executionEventTypeEnum("event_type").notNull(),
  verificationStatus: verificationStatusEnum("verification_status").notNull(),
  /** Provider payload as received, for audit/replay. Mock payloads only. */
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
});

// ---------------------------------------------------------------------------
// Snapshots & history
// ---------------------------------------------------------------------------

export const accountSnapshots = pgTable("account_snapshots", {
  id: text("id").primaryKey(),
  tradingAccountId: text("trading_account_id")
    .notNull()
    .references(() => tradingAccounts.id),
  battleId: text("battle_id").references(() => battles.id),
  balance: doublePrecision("balance").notNull(),
  equity: doublePrecision("equity").notNull(),
  realizedPnl: doublePrecision("realized_pnl").notNull(),
  unrealizedPnl: doublePrecision("unrealized_pnl").notNull(),
  /** Signed contracts: positive long, negative short, 0 flat. */
  openPosition: integer("open_position").notNull(),
  drawdown: doublePrecision("drawdown").notNull(),
  timestamp: timestamp("timestamp", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  sourceProvider: integrationProviderEnum("source_provider").notNull(),
  verificationStatus: verificationStatusEnum("verification_status").notNull(),
});

export const battleMetricSnapshots = pgTable("battle_metric_snapshots", {
  id: text("id").primaryKey(),
  battleId: text("battle_id")
    .notNull()
    .references(() => battles.id),
  participantId: text("participant_id")
    .notNull()
    .references(() => battleParticipants.id),
  netPnl: doublePrecision("net_pnl").notNull(),
  maximumDrawdown: doublePrecision("maximum_drawdown").notNull(),
  tradeCount: integer("trade_count").notNull(),
  /** 0-1 fraction of permitted risk consumed. */
  riskUtilization: doublePrecision("risk_utilization").notNull(),
  performanceScore: doublePrecision("performance_score").notNull(),
  riskEfficiencyScore: doublePrecision("risk_efficiency_score").notNull(),
  disciplineScore: doublePrecision("discipline_score").notNull(),
  consistencyScore: doublePrecision("consistency_score").notNull(),
  totalBattleScore: doublePrecision("total_battle_score").notNull(),
  /** True for the end-of-battle authoritative snapshot. */
  isFinal: boolean("is_final").notNull().default(false),
  timestamp: timestamp("timestamp", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
  verificationStatus: verificationStatusEnum("verification_status").notNull(),
});

export const ratingHistory = pgTable("rating_history", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  battleId: text("battle_id")
    .notNull()
    .references(() => battles.id),
  previousRating: integer("previous_rating").notNull(),
  newRating: integer("new_rating").notNull(),
  change: integer("change").notNull(),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
});

// ---------------------------------------------------------------------------
// Achievements & notifications
// ---------------------------------------------------------------------------

export const achievements = pgTable("achievements", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description").notNull(),
  category: achievementCategoryEnum("category").notNull(),
  /** lucide-react icon name — UI resolves it, data stays framework-free. */
  icon: text("icon").notNull(),
});

export const userAchievements = pgTable("user_achievements", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  achievementId: text("achievement_id")
    .notNull()
    .references(() => achievements.id),
  earnedAt: timestamp("earned_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
});

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** Optional deep link target (battle, profile, leaderboard...). */
  href: text("href"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at", {
    withTimezone: true,
    mode: "string",
  }).notNull(),
});
