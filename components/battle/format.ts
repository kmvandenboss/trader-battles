/**
 * Display formatting for the Live Battle screen.
 *
 * Pure presentation helpers only — every number formatted here was already
 * computed by the battle/scoring engines. No scoring math lives in the UI.
 */

import type {
  BattleStyle,
  BattleType,
  BattleWindow,
  Division,
  FirmKind,
  League,
  Market,
} from "@/lib/data/schema";

export const FIRM_KIND_LABELS: Record<FirmKind, string> = {
  PROP_FIRM: "Prop firm",
  AFFILIATION: "Affiliation",
};

export const BATTLE_WINDOW_LABELS: Record<BattleWindow, string> = {
  OPENING_BELL: "Opening Bell · 9:30–11:00 ET",
  MIDDAY: "Midday · 11:00–13:00 ET",
  AFTERNOON: "Afternoon · 13:00–15:30 ET",
  FULL_SESSION: "Full Session · 9:30–16:00 ET",
};

export const BATTLE_TYPE_LABELS: Record<BattleType, string> = {
  LIVE_PERFORMANCE: "Live Performance Battle",
  REPLAY_CHALLENGE: "Replay Challenge",
  DISCIPLINE_BATTLE: "Discipline Battle",
};

export const MARKET_LABELS: Record<Market, string> = {
  NQ: "NQ · E-mini Nasdaq-100",
  MNQ: "MNQ · Micro Nasdaq-100",
  ES: "ES · E-mini S&P 500",
  MES: "MES · Micro S&P 500",
  CL: "CL · Crude Oil",
  GC: "GC · Gold",
};

/** Just the ticker symbol, e.g. "NQ" — safer than splitting MARKET_LABELS. */
export function marketTicker(market: Market): string {
  return MARKET_LABELS[market].split(" · ")[0];
}

/** Just the market name/descriptor, e.g. "E-mini Nasdaq-100". */
export function marketName(market: Market): string {
  return MARKET_LABELS[market].split(" · ")[1] ?? market;
}

export const BATTLE_STYLE_LABELS: Record<BattleStyle, string> = {
  BALANCED: "Balanced",
  AGGRESSIVE: "Aggressive",
  DEFENSIVE: "Defensive",
  MOMENTUM: "Momentum",
  SELECTIVE: "Selective",
  HIGH_FREQUENCY: "High Frequency",
};

export const LEAGUE_LABELS: Record<League, string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
  DIAMOND: "Diamond",
  ELITE: "Elite",
};

/** "Gold II" from seed-provided league + division. */
export function formatLeague(league: League, division: Division): string {
  return `${LEAGUE_LABELS[league]} ${division}`;
}

/** "18–11" from seed-provided season wins/losses. */
export function formatRecord(wins: number, losses: number): string {
  return `${wins}–${losses}`;
}

/** "3W" / "2L" / "—" from the seed's signed streak counter. */
export function formatStreak(currentStreak: number): string {
  if (currentStreak === 0) return "—";
  return `${Math.abs(currentStreak)}${currentStreak > 0 ? "W" : "L"}`;
}

/** "$1,013" (always unsigned magnitude). */
export function formatUsd(value: number): string {
  return `$${Math.abs(Math.round(value)).toLocaleString("en-US")}`;
}

/** "+$1,013" / "-$704" / "$0". */
export function formatSignedUsd(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "$0";
  return `${rounded > 0 ? "+" : "-"}${formatUsd(rounded)}`;
}

/** Battle-clock countdown, e.g. "87:12" (minutes:seconds). */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const ET_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
});

/** Session wall-clock in ET for an absolute timestamp, e.g. "9:42". */
export function formatSessionTime(timestampMs: number): string {
  return ET_TIME_FORMAT.format(new Date(timestampMs));
}

/** Session wall-clock for "battle start + elapsed", e.g. "10:15". */
export function sessionTimeAt(
  startTimestampMs: number,
  elapsedMs: number,
): string {
  return formatSessionTime(startTimestampMs + elapsedMs);
}

/** Session wall-clock in ET for an ISO timestamp string, e.g. "1:04". */
export function sessionTimeFromIso(iso: string): string {
  return formatSessionTime(Date.parse(iso));
}

const ET_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const ET_DATETIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Calendar date in ET for an ISO timestamp, e.g. "Jul 17, 2026". */
export function formatDate(iso: string): string {
  return ET_DATE_FORMAT.format(new Date(Date.parse(iso)));
}

/** Short date + time in ET for an ISO timestamp, e.g. "Jul 17, 2026, 1:00 PM". */
export function formatDateTime(iso: string): string {
  return ET_DATETIME_FORMAT.format(new Date(Date.parse(iso)));
}

/** "83.9" — one-decimal presentation of an already-computed score. */
export function formatScore(value: number): string {
  return value.toFixed(1);
}

/** "62%" from an already-computed 0–1 win-rate fraction. */
export function formatWinRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** "Long 2" / "Short 1" / "Flat" from a signed open position. */
export function formatPosition(position: number): string {
  if (position === 0) return "Flat";
  return `${position > 0 ? "Long" : "Short"} ${Math.abs(position)}`;
}

/** "+12" / "-9" / "±0" for already-computed rating movement. */
export function formatRatingDelta(change: number): string {
  if (change === 0) return "±0";
  return `${change > 0 ? "+" : ""}${change}`;
}

/** Uppercase initials for an avatar, e.g. "KevinV" -> "KV". */
export function initialsFor(displayName: string): string {
  const letters = displayName.match(/[A-Z]/g);
  if (letters && letters.length >= 2) return letters.slice(0, 2).join("");
  return displayName.slice(0, 2).toUpperCase();
}
