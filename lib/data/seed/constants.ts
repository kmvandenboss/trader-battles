/**
 * Fixed inputs for deterministic seed authoring.
 *
 * "Today" for the demo is 2026-07-18 and the season began ~4 months earlier.
 * All battle timestamps are authored in UTC from ET session windows (the
 * whole season falls inside EDT, UTC-4).
 */

import type { BattleWindow } from "../schema/enums";

/** Master seed for the whole dataset. Changing it changes every generated value. */
export const SEED = 0x7b17c0de;

/** Demo "today" (Saturday). The most recent battles land on 2026-07-17. */
export const DEMO_TODAY = "2026-07-18";

/** Season start (a Monday, ~4 months before DEMO_TODAY). */
export const SEASON_START = "2026-03-16";
export const SEASON_NAME = "2026 Season 2";

/** Last tradable day of seeded history. */
export const LAST_BATTLE_DAY = "2026-07-17";

/** ET session windows expressed as UTC clock times (EDT = UTC-4). */
export const WINDOW_TIMES_UTC: Record<
  BattleWindow,
  { start: string; end: string }
> = {
  OPENING_BELL: { start: "13:30:00", end: "15:00:00" }, // 9:30-11:00 ET
  MIDDAY: { start: "15:00:00", end: "17:00:00" }, // 11:00-13:00 ET
  AFTERNOON: { start: "17:00:00", end: "19:30:00" }, // 13:00-15:30 ET
  FULL_SESSION: { start: "13:30:00", end: "20:00:00" }, // 9:30-16:00 ET
  // 20:00-24:00 ET = 00:00-04:00 UTC the FOLLOWING day (EDT, UTC-4). These
  // time-of-day strings can't carry the +1-day roll; the seed never generates
  // Asia battles (pickWindow excludes it), so these are for type completeness.
  ASIA: { start: "00:00:00", end: "04:00:00" },
};

/**
 * Default scoring weights, mirrored from docs/PRODUCT_BRIEF.md.
 * NOTE: the authoritative scoring engine lands in lib/scoring/ (Phase 2).
 * The seed uses these only to keep authored component scores and totals
 * internally consistent; when the engine exists, seed regeneration should
 * import its configured weights instead.
 */
export const SCORE_WEIGHTS = {
  performance: 0.4,
  riskEfficiency: 0.25,
  discipline: 0.2,
  consistency: 0.15,
} as const;

export const SCORING_CONFIGURATION_ID = "scoring-config-v1";

/** All weekday ISO dates from SEASON_START through LAST_BATTLE_DAY inclusive. */
export function seasonWeekdays(): string[] {
  const days: string[] = [];
  const cursor = new Date(`${SEASON_START}T00:00:00Z`);
  const end = new Date(`${LAST_BATTLE_DAY}T00:00:00Z`);
  while (cursor.getTime() <= end.getTime()) {
    const dow = cursor.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Build a UTC ISO timestamp from an ISO date and a UTC clock time. */
export function isoAt(date: string, clockUtc: string): string {
  return `${date}T${clockUtc}.000Z`;
}
