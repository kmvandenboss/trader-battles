/**
 * ET calendar-date display helpers for the challenge flow. Battle sessions
 * are named by their US-Eastern calendar date (lib/battles/battleWindows);
 * these helpers only FORMAT dates for display and form bounds — the window
 * math itself lives in the battle layer.
 */

/** en-CA yields ISO "YYYY-MM-DD" — the shape the challenge service expects. */
const ET_ISO_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's ET calendar date as "YYYY-MM-DD" (server clock, ET wall date). */
export function etTodayIso(now: Date = new Date()): string {
  return ET_ISO_DATE.format(now);
}

const SESSION_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Wed, Jul 22, 2026" from a challenge's "2026-07-22" session date. */
export function formatSessionDate(sessionDate: string): string {
  const [year, month, day] = sessionDate.split("-").map(Number);
  return SESSION_DATE_FORMAT.format(new Date(Date.UTC(year, month - 1, day)));
}
