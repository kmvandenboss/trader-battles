/**
 * League/division rating bands.
 *
 * Pure lookup logic shared by seed authoring, repositories, and (later) the
 * rating engine. Each league spans 150 rating points, split into three
 * 50-point divisions (III lowest, I highest). Below the Bronze floor clamps
 * to Bronze III; Elite I is open-ended.
 *
 * Spec anchors: 1684 -> GOLD II, 1712 -> GOLD I (the demo user and his
 * example opponent).
 */

import { LEAGUES, type Division, type League } from "./schema/enums";

export const LEAGUE_SPAN = 150;
export const DIVISION_SPAN = 50;

export const LEAGUE_FLOORS: Record<League, number> = {
  BRONZE: 1300,
  SILVER: 1450,
  GOLD: 1600,
  PLATINUM: 1750,
  DIAMOND: 1900,
  ELITE: 2050,
};

export interface LeaguePlacement {
  league: League;
  division: Division;
  /** Rating at which the next division/league begins (null at Elite I). */
  promotionRating: number | null;
  /** Rating below which demotion occurs (null at Bronze III). */
  demotionRating: number | null;
}

export function leagueForRating(rating: number): LeaguePlacement {
  let league: League = "BRONZE";
  for (const candidate of LEAGUES) {
    if (rating >= LEAGUE_FLOORS[candidate]) league = candidate;
  }
  const floor = LEAGUE_FLOORS[league];
  const offset = Math.max(0, rating - floor);
  const divisionIndex = Math.min(2, Math.floor(offset / DIVISION_SPAN)); // 0=III
  const division: Division = (["III", "II", "I"] as const)[divisionIndex];

  const divisionFloor = floor + divisionIndex * DIVISION_SPAN;
  const isTop = league === "ELITE" && division === "I";
  const isBottom = league === "BRONZE" && division === "III";
  return {
    league,
    division,
    promotionRating: isTop ? null : divisionFloor + DIVISION_SPAN,
    demotionRating: isBottom ? null : divisionFloor,
  };
}
