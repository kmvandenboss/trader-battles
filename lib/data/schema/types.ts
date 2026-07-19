/**
 * Domain types inferred from the Drizzle schema (tables.ts).
 *
 * Everything outside lib/data should import THESE types (via lib/data/schema)
 * rather than drizzle table objects, so the rest of the app never couples to
 * the ORM. When a real Postgres arrives, these types are already the row
 * shapes it will return.
 */

import type {
  accountSnapshots,
  achievements,
  battleMetricSnapshots,
  battleParticipants,
  battles,
  executionEvents,
  firms,
  integrationConnections,
  notifications,
  ratingHistory,
  tradingAccounts,
  traderProfiles,
  userAchievements,
  users,
} from "./tables";

export type User = typeof users.$inferSelect;
export type Firm = typeof firms.$inferSelect;
export type TraderProfile = typeof traderProfiles.$inferSelect;
export type TradingAccount = typeof tradingAccounts.$inferSelect;
export type IntegrationConnection = typeof integrationConnections.$inferSelect;
export type Battle = typeof battles.$inferSelect;
export type BattleParticipant = typeof battleParticipants.$inferSelect;
export type ExecutionEvent = typeof executionEvents.$inferSelect;
export type AccountSnapshot = typeof accountSnapshots.$inferSelect;
export type BattleMetricSnapshot = typeof battleMetricSnapshots.$inferSelect;
export type RatingHistoryEntry = typeof ratingHistory.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
