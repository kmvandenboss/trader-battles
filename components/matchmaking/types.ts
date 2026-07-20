/**
 * Matchmaking view models — serializable shapes the /matchmaking server page
 * assembles from the repositories and hands to the client flow.
 *
 * Every number here (ratings, records, component strengths) is seed/engine
 * data read through `lib/data/repositories` — nothing is computed in the UI.
 */

import type {
  BattleStyle,
  BattleType,
  BattleWindow,
  Division,
  League,
  Market,
} from "@/lib/data/schema";

/** Profile card for one trader in the matchmaking flow (demo user or queued opponent). */
export interface MatchmakingTraderCard {
  userId: string;
  displayName: string;
  rating: number;
  league: League;
  division: Division;
  /** Simulated account plan label from the seed dataset (e.g. "50K Rapid"). */
  accountLabel: string | null;
  battleStyle: BattleStyle;
  primaryMarket: Market;
  secondaryMarkets: Market[];
  seasonWins: number;
  seasonLosses: number;
  /** Signed streak from the seed profile: positive = wins, negative = losses. */
  currentStreak: number;
  /** Seed-provided component strengths (0–100). */
  disciplineScore: number;
  riskScore: number;
  performanceScore: number;
}

/** The battle configuration the user queues with. */
export interface BattleConfig {
  market: Market;
  battleWindow: BattleWindow;
  battleType: BattleType;
}

export const DEFAULT_BATTLE_CONFIG: BattleConfig = {
  market: "NQ",
  battleWindow: "OPENING_BELL",
  battleType: "LIVE_PERFORMANCE",
};
