/**
 * PNL_V1 battle scoring — straight realized PnL + capped participation bonus
 * + tiebreaker cascade. (MFFU v1; see docs/v1-divergences.md → Scoring.)
 *
 * SERVER-SIDE AUTHORITATIVE. Pure functions: window-filtered trades in,
 * numbers out. No I/O, no framework imports, no randomness. UI receives the
 * result and must NEVER recompute scores itself.
 *
 * Where this plugs in: Phase D settlement (`lib/battles/settleBattle.ts`)
 * filters each participant's imported round-trip trades to the battle window
 * `[startAt, endAt]` (a trade counts when it is BOTH entered and exited
 * inside the window — scoring starts at battle start, so trades entered
 * before the window are excluded entirely, and trades entered in-window but
 * exited after it are treated as open-at-the-buzzer and marked out), then calls
 * `calculatePnlBattleScore` per participant and `resolveBattleWinner` on the
 * pair. The existing `NORMALIZED_4F` engine (`calculateBattleScore.ts`) is
 * untouched; a battle selects a mode via `ScoringMode` in `./config`.
 *
 * The model:
 *   score = realized PnL in dollars ($1 = 1 point)
 *         + buzzer mark-out PnL of an open position at window close (if a
 *           mark price was provided in the import; absent one, the position
 *           is EXCLUDED and noted — battle PnL may differ from account PnL,
 *           label clearly in UI)
 *         + participation bonus = pointsPerTrade × min(closedTrades, maxTrades)
 *           (defaults +5/trade capped at +15 — config-driven, never
 *           hard-coded here)
 *
 * Matching is by account-size bracket, which is what keeps raw dollars fair;
 * the bracket is carried on the input for context but does not enter the
 * math. Ties are broken by the cascade in `resolveBattleWinner` without
 * touching the headline score.
 */

import type { PnlScoringConfig } from "./config";
import { resolvePnlScoringConfig } from "./config";
import { fmtUsd, round2 } from "./helpers";
import type { BattleTrade } from "./types";

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

/**
 * A position still open when the battle window closed, to be "closed at the
 * buzzer" hypothetically. V1 (async/CSV) counts it only when the import
 * provides a mark price; live mark-out mechanics (VWAP over the final
 * seconds) are deferred with the real-time-data phase.
 */
export interface OpenPositionAtClose {
  side: "LONG" | "SHORT";
  /** Contracts still open at window close. */
  size: number;
  /** Average entry price of the open contracts. */
  averageEntryPrice: number;
  /** Dollar value of one full price point per contract (e.g. NQ $20, ES $50). */
  pointValue: number;
  /** Mark price at window close, from the import. Absent → excluded + noted. */
  markPrice?: number;
}

/** One participant's PNL_V1 scoring input, already filtered to the window. */
export interface PnlBattleInput {
  /**
   * Closed round-trip trades whose EXIT falls inside the battle window,
   * net of commission. The caller (Phase D settlement) does the window
   * filtering; this function scores exactly what it is given.
   */
  trades: BattleTrade[];
  /** Position still open at window close, if any. */
  openPosition?: OpenPositionAtClose;
  /**
   * Account-size bracket the battle was matched on (e.g. "50K").
   * Informational: matching by bracket is what makes raw-dollar scoring
   * fair; the bracket itself does not change the math.
   */
  accountBracket: string;
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export type MarkOutStatus =
  /** No open position at window close. */
  | "NONE"
  /** Open position marked to the provided price; PnL included in the score. */
  | "MARKED"
  /** Open position present but no mark price — excluded from the score. */
  | "EXCLUDED_NO_MARK";

export interface MarkOutResult {
  status: MarkOutStatus;
  /** Hypothetical buzzer-close PnL included in the score (0 unless MARKED). */
  pnl: number;
  /** Human-readable note (always present when a position existed). */
  note?: string;
}

/** Fields consumed by the tiebreaker cascade (closed round-trips only —
 * the mark-out affects the score but not the tiebreakers). */
export interface PnlTiebreakers {
  /**
   * grossProfit / grossLoss over closed trades. `Infinity` when there are
   * profits and zero losses; `0` when there are no profitable trades.
   * (Serialize with care — persist gross profit/loss alongside if needed.)
   */
  profitFactor: number;
  /** Closed trades with realizedPnl > 0. */
  winningTradeCount: number;
  /** Whether the participant closed at least one trade. */
  tookTrade: boolean;
  /**
   * Exit timestamp (epoch ms) of the first trade at which cumulative
   * realized PnL went above zero ("first to green"), or null if never green.
   */
  firstGreenAtMs: number | null;
}

export interface PnlBattleScoreResult {
  /** Headline points: realizedPnl + markOut.pnl + participationBonus. */
  score: number;
  /** Realized PnL in dollars over closed round-trips (excludes mark-out). */
  realizedPnl: number;
  /** pointsPerTrade × min(closedTradeCount, maxTrades). */
  participationBonus: number;
  closedTradeCount: number;
  tiebreakers: PnlTiebreakers;
  markOut: MarkOutResult;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function resolveMarkOut(position?: OpenPositionAtClose): MarkOutResult {
  if (!position) return { status: "NONE", pnl: 0 };
  if (position.markPrice === undefined) {
    return {
      status: "EXCLUDED_NO_MARK",
      pnl: 0,
      note:
        `Open ${position.side} ${position.size}-lot at window close had no ` +
        "mark price in the import; excluded from the battle score.",
    };
  }
  const direction = position.side === "LONG" ? 1 : -1;
  const pnl = round2(
    (position.markPrice - position.averageEntryPrice) *
      direction *
      position.size *
      position.pointValue,
  );
  return {
    status: "MARKED",
    pnl,
    note:
      `Open ${position.side} ${position.size}-lot marked out at ` +
      `${position.markPrice} for ${fmtUsd(pnl)} (hypothetical buzzer close; ` +
      "battle PnL may differ from account PnL).",
  };
}

/** First exit timestamp at which cumulative realized PnL exceeds 0. */
function findFirstGreenAtMs(trades: BattleTrade[]): number | null {
  const byExit = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  let cumulative = 0;
  for (const t of byExit) {
    cumulative += t.realizedPnl;
    if (cumulative > 0) return t.exitTime;
  }
  return null;
}

/**
 * Score one participant under PNL_V1. `config` may override the bonus tuning
 * per call; defaults come from `DEFAULT_PNL_SCORING_CONFIG`.
 */
export function calculatePnlBattleScore(
  input: PnlBattleInput,
  config?: Partial<PnlScoringConfig>,
): PnlBattleScoreResult {
  const cfg = resolvePnlScoringConfig(config);
  const trades = input.trades;

  const realizedPnl = round2(
    trades.reduce((sum, t) => sum + t.realizedPnl, 0),
  );
  const closedTradeCount = trades.length;
  const participationBonus = round2(
    cfg.pointsPerTrade * Math.min(closedTradeCount, cfg.maxTrades),
  );
  const markOut = resolveMarkOut(input.openPosition);

  const grossProfit = trades
    .filter((t) => t.realizedPnl > 0)
    .reduce((sum, t) => sum + t.realizedPnl, 0);
  const grossLoss = trades
    .filter((t) => t.realizedPnl < 0)
    .reduce((sum, t) => sum - t.realizedPnl, 0);
  const profitFactor =
    grossLoss > 0
      ? grossProfit / grossLoss
      : grossProfit > 0
        ? Number.POSITIVE_INFINITY
        : 0;

  return {
    score: round2(realizedPnl + markOut.pnl + participationBonus),
    realizedPnl,
    participationBonus,
    closedTradeCount,
    tiebreakers: {
      profitFactor,
      winningTradeCount: trades.filter((t) => t.realizedPnl > 0).length,
      tookTrade: closedTradeCount > 0,
      firstGreenAtMs: findFirstGreenAtMs(trades),
    },
    markOut,
  };
}

// ---------------------------------------------------------------------------
// Winner resolution — the tiebreaker cascade
// ---------------------------------------------------------------------------

/** Tiers in cascade order. `DEAD_TIE` means every tier compared equal. */
export const TIEBREAKER_TIERS = [
  "SCORE",
  "REALIZED_PNL",
  "PROFIT_FACTOR",
  "WINNING_TRADES",
  "TOOK_TRADE",
  "FIRST_GREEN",
] as const;
export type TiebreakerTier = (typeof TIEBREAKER_TIERS)[number] | "DEAD_TIE";

export interface WinnerResolution {
  /** Which side won — or "TIE" for a true dead tie (rating handles a draw). */
  outcome: "A" | "B" | "TIE";
  /** The cascade tier that decided it ("DEAD_TIE" when outcome is "TIE"). */
  decidedBy: TiebreakerTier;
  /** Human-readable explanation with the deciding numbers. */
  detail: string;
}

/** Tolerance for treating two dollar/point values as equal (absorbs
 * floating-point noise from imported prices; not a scoring fudge). */
const TIE_EPSILON = 1e-9;

/** -1: b ahead · 0: tie · 1: a ahead. Handles Infinity === Infinity. */
function compareHigherWins(a: number, b: number): number {
  if (a === b || Math.abs(a - b) <= TIE_EPSILON) return 0;
  return a > b ? 1 : -1;
}

/** Earlier (smaller) timestamp wins; null means "never went green". */
function compareFirstGreen(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return compareHigherWins(b, a);
}

/** Battle PnL used by the cascade's PnL tier: realized + mark-out (i.e. the
 * score without the participation bonus). */
function battlePnl(r: PnlBattleScoreResult): number {
  return r.realizedPnl + r.markOut.pnl;
}

/**
 * Resolve a PNL_V1 battle between two scored participants.
 *
 * Cascade (per docs/v1-divergences.md — each tier only consulted when every
 * earlier tier ties exactly): headline score → realized PnL (incl. mark-out,
 * i.e. score minus the bonus) → higher profit factor → more winning trades →
 * took ≥1 trade → earliest first-green. If every tier ties, the result is an
 * explicit dead tie ("TIE" / "DEAD_TIE") — the caller decides how a drawn
 * battle affects ratings.
 */
export function resolveBattleWinner(
  a: PnlBattleScoreResult,
  b: PnlBattleScoreResult,
): WinnerResolution {
  const tiers: Array<{
    tier: TiebreakerTier;
    cmp: number;
    describe: (winner: "A" | "B") => string;
  }> = [
    {
      tier: "SCORE",
      cmp: compareHigherWins(a.score, b.score),
      describe: (w) =>
        `${w} wins on score: ${a.score} vs ${b.score} points.`,
    },
    {
      tier: "REALIZED_PNL",
      cmp: compareHigherWins(battlePnl(a), battlePnl(b)),
      describe: (w) =>
        `Scores tied; ${w} wins on realized PnL: ` +
        `${fmtUsd(battlePnl(a))} vs ${fmtUsd(battlePnl(b))}.`,
    },
    {
      tier: "PROFIT_FACTOR",
      cmp: compareHigherWins(
        a.tiebreakers.profitFactor,
        b.tiebreakers.profitFactor,
      ),
      describe: (w) =>
        `Scores and PnL tied; ${w} wins on profit factor: ` +
        `${formatProfitFactor(a.tiebreakers.profitFactor)} vs ` +
        `${formatProfitFactor(b.tiebreakers.profitFactor)}.`,
    },
    {
      tier: "WINNING_TRADES",
      cmp: compareHigherWins(
        a.tiebreakers.winningTradeCount,
        b.tiebreakers.winningTradeCount,
      ),
      describe: (w) =>
        `Tied through profit factor; ${w} wins on winning trades: ` +
        `${a.tiebreakers.winningTradeCount} vs ` +
        `${b.tiebreakers.winningTradeCount}.`,
    },
    {
      tier: "TOOK_TRADE",
      cmp: compareHigherWins(
        a.tiebreakers.tookTrade ? 1 : 0,
        b.tiebreakers.tookTrade ? 1 : 0,
      ),
      describe: (w) =>
        `Tied through winning trades; ${w} wins by taking at least one trade.`,
    },
    {
      tier: "FIRST_GREEN",
      cmp: compareFirstGreen(
        a.tiebreakers.firstGreenAtMs,
        b.tiebreakers.firstGreenAtMs,
      ),
      describe: (w) =>
        `Tied through activity; ${w} wins by going green first.`,
    },
  ];

  for (const { tier, cmp, describe } of tiers) {
    if (cmp !== 0) {
      const outcome = cmp > 0 ? "A" : "B";
      return { outcome, decidedBy: tier, detail: describe(outcome) };
    }
  }
  return {
    outcome: "TIE",
    decidedBy: "DEAD_TIE",
    detail: "Every tiebreaker tier compared equal — the battle is a draw.",
  };
}

function formatProfitFactor(pf: number): string {
  return pf === Number.POSITIVE_INFINITY ? "∞" : String(round2(pf));
}
