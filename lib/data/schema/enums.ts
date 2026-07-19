/**
 * Shared domain enums for Trader Battles.
 *
 * Single source of truth for every categorical value in the domain model.
 * Each enum is authored as a `const` tuple so we can derive:
 *   1. a strict TypeScript union type, and
 *   2. a Postgres `pgEnum` (see tables.ts) that stays byte-for-byte in sync.
 *
 * All demo data must carry `verificationStatus: "SIMULATED"`. The other
 * verification states exist so future live integrations (NinjaTrader,
 * Tradovate, Rithmic, ...) can plug in without schema changes.
 */

export const LEAGUES = [
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "DIAMOND",
  "ELITE",
] as const;
export type League = (typeof LEAGUES)[number];

export const DIVISIONS = ["III", "II", "I"] as const;
export type Division = (typeof DIVISIONS)[number];

export const MARKETS = ["NQ", "MNQ", "ES", "MES", "CL", "GC"] as const;
export type Market = (typeof MARKETS)[number];

export const BATTLE_TYPES = [
  "LIVE_PERFORMANCE",
  "REPLAY_CHALLENGE",
  "DISCIPLINE_BATTLE",
] as const;
export type BattleType = (typeof BATTLE_TYPES)[number];

export const BATTLE_STATUSES = [
  "SCHEDULED",
  "MATCHMAKING",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
] as const;
export type BattleStatus = (typeof BATTLE_STATUSES)[number];

export const BATTLE_WINDOWS = [
  "OPENING_BELL", // 9:30-11:00 a.m. ET
  "MIDDAY", // 11:00 a.m.-1:00 p.m. ET
  "AFTERNOON", // 1:00-3:30 p.m. ET
  "FULL_SESSION", // 9:30 a.m.-4:00 p.m. ET
] as const;
export type BattleWindow = (typeof BATTLE_WINDOWS)[number];

export const BATTLE_RESULTS = ["WIN", "LOSS", "DRAW"] as const;
export type BattleResult = (typeof BATTLE_RESULTS)[number];

export const BATTLE_STYLES = [
  "BALANCED",
  "AGGRESSIVE",
  "DEFENSIVE",
  "MOMENTUM",
  "SELECTIVE",
  "HIGH_FREQUENCY",
] as const;
export type BattleStyle = (typeof BATTLE_STYLES)[number];

export const EXECUTION_EVENT_TYPES = [
  "ORDER_SUBMITTED",
  "ORDER_ACCEPTED",
  "ORDER_CANCELLED",
  "ORDER_REJECTED",
  "PARTIAL_FILL",
  "FILL",
  "POSITION_OPENED",
  "POSITION_REDUCED",
  "POSITION_CLOSED",
  "ACCOUNT_SNAPSHOT",
] as const;
export type ExecutionEventType = (typeof EXECUTION_EVENT_TYPES)[number];

export const ORDER_SIDES = ["BUY", "SELL"] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];

/**
 * Verification states for accounts, executions, battles, and snapshots.
 * The demo NEVER uses PROVIDER_VERIFIED — everything is SIMULATED and is
 * surfaced in the UI as "Simulated Demo Data" / "Demo Verified".
 */
export const VERIFICATION_STATUSES = [
  "SIMULATED",
  "SELF_REPORTED",
  "CLIENT_VERIFIED",
  "PROVIDER_VERIFIED",
  "MANUALLY_REVIEWED",
  "DISPUTED",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const INTEGRATION_PROVIDERS = [
  "mock",
  "ninjatrader",
  "tradovate",
  "rithmic",
] as const;
export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export const CONNECTION_TYPES = [
  "SIMULATED",
  "DESKTOP_ADDON",
  "API",
  "FILE_IMPORT",
] as const;
export type ConnectionType = (typeof CONNECTION_TYPES)[number];

export const CONNECTION_STATUSES = [
  "CONNECTED",
  "DISCONNECTED",
  "PENDING",
  "ERROR",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED", "CLOSED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ACCOUNT_TYPES = [
  "PROP_EVALUATION",
  "PROP_FUNDED",
  "BROKERAGE",
  "SIMULATED",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const FIRM_KINDS = ["PROP_FIRM", "AFFILIATION"] as const;
export type FirmKind = (typeof FIRM_KINDS)[number];

export const ACHIEVEMENT_CATEGORIES = [
  "PARTICIPATION",
  "DISCIPLINE",
  "IMPROVEMENT",
  "COMPETITIVE_SUCCESS",
  "MARKET_SPECIALIZATION",
] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export const NOTIFICATION_TYPES = [
  "MATCH_FOUND",
  "OPPONENT_QUEUED",
  "BATTLE_STARTING",
  "BATTLE_RESULT",
  "RATING_INCREASED",
  "LEAGUE_PROMOTION",
  "RIVAL_PASSED",
  "NEW_CHALLENGE",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
