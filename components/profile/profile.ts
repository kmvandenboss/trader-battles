/**
 * Trader-profile loader — assembles a fully serializable view model for the
 * demo user's profile (/profile) and any seeded trader (/profile/[userId])
 * from data read through the repositories.
 *
 * IMPORTANT (Rule 4): this module computes NO scores, ratings, standings, or
 * win rates. Rating history, skill indicators, records, standings, and the
 * league placement all come already-computed from getRepositories() and the
 * pure leagueForRating helper. It only shapes those values for rendering and
 * hands plain objects to server + client components.
 *
 * Server-only (no "use client").
 */

import { getRepositories } from "@/lib/data/repositories";
import type {
  Achievement,
  BattleResult,
  BattleStyle,
  Division,
  League,
  Market,
} from "@/lib/data/schema";
import type {
  EarnedAchievement,
  TraderStanding,
} from "@/lib/data/repositories/types";
import { formatDate } from "@/components/battle/format";
import type { RatingPoint } from "./rating-history-chart";

/** One row in a trader's recent-battles list on their profile. */
export interface ProfileBattleRow {
  battleId: string;
  iso: string;
  dateLabel: string;
  market: Market;
  result: BattleResult;
  selfScore: number;
  opponentScore: number;
  opponentUserId: string;
  opponentName: string;
  opponentLeague: League;
  opponentDivision: Division;
  ratingChange: number;
}

export interface ProfileViewModel {
  userId: string;
  isDemoUser: boolean;
  displayName: string;
  league: League;
  division: Division;
  rating: number;
  firmName: string;
  firmSlug: string;
  styleLabel: BattleStyle;
  primaryMarket: Market;
  secondaryMarkets: Market[];
  // Records
  seasonWins: number;
  seasonLosses: number;
  lifetimeWins: number;
  lifetimeLosses: number;
  currentStreak: number;
  bestWinStreak: number;
  seasonStartRating: number;
  seasonHighRating: number;
  // Skill indicators (competitive, NOT returns)
  disciplineScore: number;
  riskScore: number;
  performanceScore: number;
  // Charts / standings / badges / history
  ratingHistory: RatingPoint[];
  standing: TraderStanding | null;
  earnedAchievements: EarnedAchievement[];
  catalog: Achievement[];
  recentBattles: ProfileBattleRow[];
}

async function buildProfile(userId: string): Promise<ProfileViewModel | null> {
  const { traders, leaderboards, achievements, battles } = getRepositories();
  const trader = await traders.getById(userId);
  if (!trader) return null;

  const [ratingHistory, standing, earned, catalog, recent] = await Promise.all([
    traders.getRatingHistory(userId),
    leaderboards.getStanding(userId),
    achievements.listForUser(userId),
    achievements.listCatalog(),
    battles.listForUser(userId, { limit: 5 }),
  ]);

  const { profile } = trader;

  const recentBattles: ProfileBattleRow[] = recent.map((summary) => {
    const [a, b] = summary.participants;
    const self = a.trader.user.id === userId ? a : b;
    const other = a.trader.user.id === userId ? b : a;
    return {
      battleId: summary.battle.id,
      iso: summary.battle.scheduledStart,
      dateLabel: formatDate(summary.battle.scheduledStart),
      market: summary.battle.market,
      result: self.participant.result,
      selfScore: self.participant.finalScore,
      opponentScore: other.participant.finalScore,
      opponentUserId: other.trader.user.id,
      opponentName: other.trader.user.displayName,
      opponentLeague: other.trader.profile.league,
      opponentDivision: other.trader.profile.division,
      ratingChange: self.ratingChange,
    };
  });

  return {
    userId: trader.user.id,
    isDemoUser: trader.user.isDemoUser,
    displayName: trader.user.displayName,
    league: profile.league,
    division: profile.division,
    rating: profile.rating,
    firmName: trader.firm.name,
    firmSlug: trader.firm.slug,
    styleLabel: profile.battleStyle,
    primaryMarket: profile.primaryMarket,
    secondaryMarkets: profile.secondaryMarkets,
    seasonWins: profile.seasonWins,
    seasonLosses: profile.seasonLosses,
    lifetimeWins: profile.lifetimeWins,
    lifetimeLosses: profile.lifetimeLosses,
    currentStreak: profile.currentStreak,
    bestWinStreak: profile.bestWinStreak,
    seasonStartRating: profile.seasonStartRating,
    seasonHighRating: profile.seasonHighRating,
    disciplineScore: profile.disciplineScore,
    riskScore: profile.riskScore,
    performanceScore: profile.performanceScore,
    ratingHistory: ratingHistory.map((entry, index) => ({
      index,
      rating: entry.newRating,
    })),
    standing,
    earnedAchievements: earned,
    catalog,
    recentBattles,
  };
}

/** The pre-authenticated demo user's profile (KevinV). */
export async function loadDemoProfile(): Promise<ProfileViewModel | null> {
  const { traders } = getRepositories();
  const demo = await traders.getDemoTrader();
  return buildProfile(demo.user.id);
}

/** Any seeded trader's profile; null if the user id is unknown. */
export async function loadTraderProfile(
  userId: string,
): Promise<ProfileViewModel | null> {
  return buildProfile(userId);
}
