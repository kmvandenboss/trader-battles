/**
 * battleWindows — pure ET→UTC session-window computation for v1 scheduled
 * battles.
 *
 * A challenge names a session date + battle window (e.g. "2026-07-22 Opening
 * Bell"); accepting it materializes a battle whose UTC bounds come from
 * here. Window times are US-Eastern wall-clock (matching the enum comments
 * in lib/data/schema/enums.ts):
 *
 *   OPENING_BELL  09:30–11:00 ET
 *   MIDDAY        11:00–13:00 ET
 *   AFTERNOON     13:00–15:30 ET
 *   FULL_SESSION  09:30–16:00 ET
 *
 * US DST is implemented directly (no timezone library): Eastern is EDT
 * (UTC−4) from the second Sunday of March through the day BEFORE the first
 * Sunday of November, else EST (UTC−5). DST transitions happen at 2 a.m.
 * local — before every window start — so the boundary dates themselves are
 * unambiguous: 2026-03-08 (spring forward) is already EDT at 9:30 a.m.;
 * 2026-11-01 (fall back) is already EST.
 *
 * Pure functions — no I/O, no framework imports, no Date.now.
 */

import type { BattleWindow } from "@/lib/data/schema";

export interface WindowBoundsUtc {
  /** ISO UTC instant the window opens (inclusive). */
  startAt: string;
  /** ISO UTC instant the window closes (inclusive buzzer). */
  endAt: string;
}

/** ET wall-clock minutes-from-midnight per window. */
const WINDOW_MINUTES_ET: Record<BattleWindow, { start: number; end: number }> = {
  OPENING_BELL: { start: 9 * 60 + 30, end: 11 * 60 },
  MIDDAY: { start: 11 * 60, end: 13 * 60 },
  AFTERNOON: { start: 13 * 60, end: 15 * 60 + 30 },
  FULL_SESSION: { start: 9 * 60 + 30, end: 16 * 60 },
};

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number;
}

/** Parse + validate a "YYYY-MM-DD" calendar date. Throws on invalid input. */
export function parseSessionDate(sessionDate: string): CalendarDate {
  const match = DATE_PATTERN.exec(sessionDate);
  if (!match) {
    throw new Error(
      `invalid session date "${sessionDate}" — expected YYYY-MM-DD`,
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Round-trip through Date.UTC to reject impossible dates (2026-02-30).
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new Error(`invalid session date "${sessionDate}" — no such day`);
  }
  return { year, month, day };
}

/** Day-of-month of the Nth Sunday of a month (month 1-12, n >= 1). */
function nthSundayOfMonth(year: number, month: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun
  const firstSunday = 1 + ((7 - firstDow) % 7);
  return firstSunday + (n - 1) * 7;
}

/**
 * Whether US-Eastern observes daylight saving on this calendar date (for
 * times after 2 a.m. local — all battle windows qualify). DST runs from the
 * second Sunday of March (inclusive) to the first Sunday of November
 * (exclusive). For 2026: Mar 8 through Oct 31 are EDT; Nov 1 is EST.
 */
export function isEasternDaylightTime(sessionDate: string): boolean {
  const { year, month, day } = parseSessionDate(sessionDate);
  if (month < 3 || month > 11) return false;
  if (month > 3 && month < 11) return true;
  if (month === 3) return day >= nthSundayOfMonth(year, 3, 2);
  return day < nthSundayOfMonth(year, 11, 1); // month === 11
}

/**
 * UTC bounds of a battle window on a given ET session date.
 *
 *   windowBoundsUtc("2026-07-13", "OPENING_BELL")
 *     -> { startAt: "2026-07-13T13:30:00.000Z", endAt: "2026-07-13T15:00:00.000Z" }
 *
 * Throws on an invalid session date.
 */
export function windowBoundsUtc(
  sessionDate: string,
  battleWindow: BattleWindow,
): WindowBoundsUtc {
  const { year, month, day } = parseSessionDate(sessionDate);
  const offsetHours = isEasternDaylightTime(sessionDate) ? 4 : 5; // ET behind UTC
  const window = WINDOW_MINUTES_ET[battleWindow];

  const toUtcIso = (minutesEt: number): string =>
    new Date(
      Date.UTC(year, month - 1, day, offsetHours, 0, 0, 0) + minutesEt * 60_000,
    ).toISOString();

  return { startAt: toUtcIso(window.start), endAt: toUtcIso(window.end) };
}
