/**
 * settleBattle — pure v1 settlement of a scheduled battle window.
 *
 * THE Phase D core. Given the window, both participants' imported
 * per-instrument results (ledger trades + open positions), and buzzer mark
 * prices, this produces the full settled outcome: scores, winner, rating
 * changes, and a persistence-ready `BattleSettlementInput`. Pure — no I/O,
 * no repositories, no Date.now; mark prices are handed in by the caller.
 *
 * Rules implemented (docs/v1-divergences.md → Scoring):
 *
 *  - "[decided] Scoring starts at battle start. Only trades opened after the
 *    window opens count." A counted realized trade has
 *    entryTime >= startAt AND exitTime <= endAt. Trades entered BEFORE the
 *    window are excluded ENTIRELY — even if they exit inside it — which
 *    kills the green-day selection exploit. Exclusions are itemized with
 *    reasons in the report.
 *
 *  - "[decided] Realized PnL only, with a buzzer mark-out for open
 *    positions." Trades entered in-window but exited AFTER the buzzer were
 *    open at close: their entry price/size is known, so they are
 *    reconstructed as open-at-close exposure, together with any still-OPEN
 *    import rows whose entry is in-window. If all open exposure is one
 *    instrument + one side it is aggregated (quantity-weighted average
 *    entry) into ONE OpenPositionAtClose and marked at the provided price.
 *    No mark price → the scoring engine emits EXCLUDED_NO_MARK (the honest
 *    path — excluded and noted). Mixed instruments/sides: only the largest
 *    single-instrument-same-side bucket is marked out; the rest is excluded
 *    with explicit notes (documented v1 limitation).
 *
 *  - Scoring is `calculatePnlBattleScore` + `resolveBattleWinner`
 *    (lib/scoring — never reimplemented here). Ratings are
 *    `calculateRatingChange` with `PNL_V1_RATING_CONFIG`, completionRatio 1,
 *    zero violations.
 *
 *  - `maximumDrawdown` is peak-to-trough over the CUMULATIVE REALIZED PnL
 *    sequence of counted trades ordered by exit time. Intra-trade drawdown
 *    is unknowable from round-trip CSVs (only avg entry/exit per trade
 *    survive), so this is trade-close granularity — stated honestly.
 *
 *  - Gross profit / gross loss are persisted (loss POSITIVE); a profit
 *    factor is NEVER emitted for persistence (Infinity hazard — it is
 *    derived at read time by the scoring tiebreakers instead).
 */

import type { BattleResult, Market, VerificationStatus } from "@/lib/data/schema";
import type {
  BattleSettlementInput,
  ParticipantSettlementInput,
} from "@/lib/data/repositories/types";
import { MARKET_SPECS } from "@/lib/executions/positionLedger";
import type { OpenPositionSummary } from "@/lib/executions/import/importTrades";
import {
  calculatePnlBattleScore,
  resolveBattleWinner,
  type OpenPositionAtClose,
  type PnlBattleScoreResult,
  type WinnerResolution,
} from "@/lib/scoring/calculatePnlBattleScore";
import type { PnlScoringConfig } from "@/lib/scoring/config";
import type { BattleTrade } from "@/lib/scoring/calculateBattleScore";
import {
  calculateRatingChange,
  PNL_V1_RATING_CONFIG,
  type RatingChangeResult,
} from "@/lib/ratings/calculateRatingChange";

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

export interface SettlementWindow {
  /** ISO UTC — battle window open (inclusive). */
  startAt: string;
  /** ISO UTC — battle window close / buzzer (inclusive). */
  endAt: string;
}

/** One instrument's imported result for a participant (from
 * importTradesFromCsv / settlement replay — ledger output, unfiltered). */
export interface ParticipantInstrumentImport {
  instrument: Market;
  /** All reconstructed round-trip trades for this instrument. */
  trades: BattleTrade[];
  /** Position still open at the END of the import, if any. */
  openPosition: OpenPositionSummary | null;
}

export interface SettlementParticipantInput {
  userId: string;
  /** Trader display name for user-facing settlement copy (the persisted
   * resolution detail + report). Falls back to userId when absent. */
  displayName?: string;
  /** The trading account the import belongs to (persisted on settlement). */
  tradingAccountId: string;
  /** Rating captured at scheduling time (keeps re-settles idempotent). */
  rating: number;
  imports: ParticipantInstrumentImport[];
  /**
   * Buzzer mark price per instrument (bar close at/just before endAt).
   * `undefined` = no fresh mark available — open exposure in that
   * instrument is excluded and noted (EXCLUDED_NO_MARK).
   */
  markPrices: Partial<Record<Market, number>>;
}

export interface SettleBattleInput {
  battleId: string;
  window: SettlementWindow;
  /** Account-size bracket the battle was matched on (informational). */
  accountBracket?: string | null;
  /** PNL_V1 bonus tuning override; defaults from lib/scoring/config. */
  scoringConfig?: Partial<PnlScoringConfig>;
  participants: [SettlementParticipantInput, SettlementParticipantInput];
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export type TradeExclusionReason =
  /** Entered before the window opened (excluded entirely — see header). */
  | "ENTERED_BEFORE_WINDOW"
  /** Entered at/after the buzzer. */
  | "ENTERED_AFTER_WINDOW";

export interface ExcludedTrade {
  instrument: Market;
  trade: BattleTrade;
  reason: TradeExclusionReason;
}

/** A trade entered in-window that exited after the buzzer — treated as open
 * exposure at close (full size at average entry; partial pre-buzzer exits
 * are unknowable from round-trip data). */
export interface OpenAtBuzzerTrade {
  instrument: Market;
  trade: BattleTrade;
}

export interface ParticipantSettlementOutcome {
  userId: string;
  /** Resolved display name (input displayName, else userId). */
  displayName: string;
  tradingAccountId: string;
  /** Full scoring-engine output (score, bonus, tiebreakers, mark-out). */
  score: PnlBattleScoreResult;
  result: BattleResult;
  rating: RatingChangeResult;
  /** In-window realized trades that entered the score, exit-time order. */
  countedTrades: BattleTrade[];
  excludedTrades: ExcludedTrade[];
  openAtBuzzerTrades: OpenAtBuzzerTrade[];
  /** The single marked-out position handed to the scoring engine (null =
   * flat at the buzzer). */
  openPositionAtClose: (OpenPositionAtClose & { instrument: Market }) | null;
  /** Open exposure that could NOT be marked out (mixed instrument/side or
   * out-of-window entry) — every entry is an explicit honest note. */
  exposureNotes: string[];
  /** Peak-to-trough of cumulative realized PnL over counted trades. */
  maximumDrawdown: number;
  /** Persist-safe pair (loss POSITIVE). Never a profit factor. */
  grossProfit: number;
  grossLoss: number;
}

export interface SettleBattleResult {
  winnerId: string | null;
  /** The raw scoring-engine resolution. Its `detail` uses positional "A"/"B"
   * labels and is for internal use only — never display or persist it. */
  resolution: WinnerResolution;
  /** User-facing resolution detail with trader display names (winner named
   * first). This is what gets persisted and rendered. */
  resolutionDetail: string;
  participants: [ParticipantSettlementOutcome, ParticipantSettlementOutcome];
  /** Ready for BattleRepository.saveSettlement — persists the whole outcome. */
  settlementInput: BattleSettlementInput;
  /** Human-readable settlement report (window, exclusions, mark-outs,
   * resolution, rating movement) — display verbatim. */
  report: string[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const round2 = (value: number): number => Math.round(value * 100) / 100;

const usd = (value: number): string =>
  `${value < 0 ? "-" : ""}$${Math.abs(round2(value)).toFixed(2)}`;

interface ExposureBucket {
  instrument: Market;
  side: "LONG" | "SHORT";
  quantity: number;
  /** Sum of entryPrice * quantity (for the weighted average). */
  notional: number;
  sources: string[];
}

export interface WindowClassification {
  countedTrades: BattleTrade[];
  excludedTrades: ExcludedTrade[];
  openAtBuzzerTrades: OpenAtBuzzerTrade[];
  openPositionAtClose: (OpenPositionAtClose & { instrument: Market }) | null;
  exposureNotes: string[];
  /** Still-open import rows whose entry fell inside the window (they feed
   * the open-at-close exposure alongside openAtBuzzerTrades). */
  inWindowOpenPositionCount: number;
}

/**
 * Classify a participant's imports against the window and reconstruct the
 * single markable open-at-close position (see header rules). Exported as
 * THE single source of the window rules: settlement uses it to score, and
 * settlementService's import preview uses it to tell the trader what will
 * count — the two can never drift.
 */
export function classifyWindow(
  imports: ParticipantInstrumentImport[],
  markPrices: Partial<Record<Market, number>>,
  startMs: number,
  endMs: number,
): WindowClassification {
  const countedTrades: BattleTrade[] = [];
  const excludedTrades: ExcludedTrade[] = [];
  const openAtBuzzerTrades: OpenAtBuzzerTrade[] = [];
  const exposureNotes: string[] = [];
  const buckets = new Map<string, ExposureBucket>();
  let inWindowOpenPositionCount = 0;

  const addExposure = (
    instrument: Market,
    side: "LONG" | "SHORT",
    quantity: number,
    entryPrice: number,
    source: string,
  ) => {
    const key = `${instrument}|${side}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.quantity += quantity;
      bucket.notional += entryPrice * quantity;
      bucket.sources.push(source);
    } else {
      buckets.set(key, {
        instrument,
        side,
        quantity,
        notional: entryPrice * quantity,
        sources: [source],
      });
    }
  };

  for (const imported of imports) {
    for (const trade of imported.trades) {
      if (trade.entryTime < startMs) {
        excludedTrades.push({
          instrument: imported.instrument,
          trade,
          reason: "ENTERED_BEFORE_WINDOW",
        });
      } else if (trade.entryTime >= endMs) {
        excludedTrades.push({
          instrument: imported.instrument,
          trade,
          reason: "ENTERED_AFTER_WINDOW",
        });
      } else if (trade.exitTime > endMs) {
        // Entered in-window, exited after the buzzer: open at close.
        openAtBuzzerTrades.push({ instrument: imported.instrument, trade });
        addExposure(
          imported.instrument,
          trade.side,
          trade.size,
          trade.entryPrice,
          `${trade.side} ${trade.size} ${imported.instrument} @ ${trade.entryPrice} (exited after the buzzer)`,
        );
      } else {
        countedTrades.push(trade);
      }
    }

    const open = imported.openPosition;
    if (open) {
      if (open.entryTimeMs >= startMs && open.entryTimeMs < endMs) {
        inWindowOpenPositionCount++;
        addExposure(
          imported.instrument,
          open.side,
          open.quantity,
          open.avgEntryPrice,
          `${open.side} ${open.quantity} ${imported.instrument} @ ${open.avgEntryPrice} (still open in the import)`,
        );
      } else {
        const when =
          open.entryTimeMs < startMs ? "before the window opened" : "after the buzzer";
        exposureNotes.push(
          `Open ${open.side} ${open.quantity}-lot ${imported.instrument} was entered ${when} — outside the battle window, not scored.`,
        );
      }
    }
  }

  countedTrades.sort((a, b) => a.exitTime - b.exitTime);

  // Pick the single markable bucket (largest quantity; deterministic ties).
  const allBuckets = [...buckets.values()].sort(
    (a, b) =>
      b.quantity - a.quantity ||
      a.instrument.localeCompare(b.instrument) ||
      a.side.localeCompare(b.side),
  );

  let openPositionAtClose: (OpenPositionAtClose & { instrument: Market }) | null =
    null;
  if (allBuckets.length > 0) {
    const marked = allBuckets[0];
    openPositionAtClose = {
      instrument: marked.instrument,
      side: marked.side,
      size: marked.quantity,
      averageEntryPrice: marked.notional / marked.quantity,
      pointValue: MARKET_SPECS[marked.instrument].pointValue,
      markPrice: markPrices[marked.instrument],
    };
    for (const skipped of allBuckets.slice(1)) {
      exposureNotes.push(
        `Excluded open exposure at the buzzer: ${skipped.side} ${skipped.quantity}-lot ` +
          `${skipped.instrument} (${skipped.sources.join("; ")}) — v1 marks out only ` +
          `the largest single-instrument, same-side position; the rest is excluded and noted.`,
      );
    }
  }

  return {
    countedTrades,
    excludedTrades,
    openAtBuzzerTrades,
    openPositionAtClose,
    exposureNotes,
    inWindowOpenPositionCount,
  };
}

/**
 * Peak-to-trough drawdown of the cumulative realized-PnL sequence, trades
 * ordered by exit time. Peak floors at 0 (a battle starts flat). Intra-trade
 * excursions are not visible in round-trip data — see file header.
 */
export function realizedDrawdown(tradesByExit: BattleTrade[]): number {
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of tradesByExit) {
    cumulative += trade.realizedPnl;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }
  return round2(maxDrawdown);
}

const EXCLUSION_LABEL: Record<TradeExclusionReason, string> = {
  ENTERED_BEFORE_WINDOW: "entered before the window opened",
  ENTERED_AFTER_WINDOW: "entered after the buzzer",
};

const formatProfitFactorDetail = (pf: number): string =>
  pf === Number.POSITIVE_INFINITY ? "∞" : String(round2(pf));

/**
 * User-facing resolution detail. `resolveBattleWinner`'s own `detail` labels
 * the sides positionally ("A wins…") — fine internally, unacceptable in the
 * settled-result UI — so the PERSISTED detail is rebuilt here from the same
 * deciding numbers, phrased like the scoring engine but with trader display
 * names and the WINNER's value always named first (unambiguous vs-order).
 * lib/scoring stays untouched.
 */
function describeResolutionWithNames(
  resolution: WinnerResolution,
  names: [string, string],
  scores: PnlBattleScoreResult[],
): string {
  if (resolution.outcome === "TIE") {
    // The engine's dead-tie sentence contains no positional labels.
    return resolution.detail;
  }
  const winner = resolution.outcome === "A" ? 0 : 1;
  const loser = 1 - winner;
  const w = names[winner];
  const ws = scores[winner];
  const ls = scores[loser];
  const battlePnlOf = (s: PnlBattleScoreResult) => s.realizedPnl + s.markOut.pnl;

  switch (resolution.decidedBy) {
    case "SCORE":
      return `${w} wins on score: ${ws.score} vs ${ls.score} points.`;
    case "REALIZED_PNL":
      return (
        `Scores tied; ${w} wins on realized PnL: ` +
        `${usd(battlePnlOf(ws))} vs ${usd(battlePnlOf(ls))}.`
      );
    case "PROFIT_FACTOR":
      return (
        `Scores and PnL tied; ${w} wins on profit factor: ` +
        `${formatProfitFactorDetail(ws.tiebreakers.profitFactor)} vs ` +
        `${formatProfitFactorDetail(ls.tiebreakers.profitFactor)}.`
      );
    case "WINNING_TRADES":
      return (
        `Tied through profit factor; ${w} wins on winning trades: ` +
        `${ws.tiebreakers.winningTradeCount} vs ${ls.tiebreakers.winningTradeCount}.`
      );
    case "TOOK_TRADE":
      return `Tied through winning trades; ${w} wins by taking at least one trade.`;
    case "FIRST_GREEN":
      return `Tied through activity; ${w} wins by going green first.`;
    default:
      return resolution.detail;
  }
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

/** Imported CSV data is SELF_REPORTED — never SIMULATED (Rule 1). */
const SETTLEMENT_VERIFICATION: VerificationStatus = "SELF_REPORTED";

export function settleBattle(input: SettleBattleInput): SettleBattleResult {
  const startMs = Date.parse(input.window.startAt);
  const endMs = Date.parse(input.window.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error(
      `settleBattle: invalid window [${input.window.startAt}, ${input.window.endAt}]`,
    );
  }

  const bracket = input.accountBracket ?? "UNSPECIFIED";

  const windowed = input.participants.map((p) =>
    classifyWindow(p.imports, p.markPrices, startMs, endMs),
  );
  const scores = windowed.map((w) =>
    calculatePnlBattleScore(
      {
        trades: w.countedTrades,
        openPosition: w.openPositionAtClose ?? undefined,
        accountBracket: bracket,
      },
      input.scoringConfig,
    ),
  );

  const resolution = resolveBattleWinner(scores[0], scores[1]);
  const names: [string, string] = [
    input.participants[0].displayName ?? input.participants[0].userId,
    input.participants[1].displayName ?? input.participants[1].userId,
  ];
  const resolutionDetail = describeResolutionWithNames(resolution, names, scores);
  const results: [BattleResult, BattleResult] =
    resolution.outcome === "A"
      ? ["WIN", "LOSS"]
      : resolution.outcome === "B"
        ? ["LOSS", "WIN"]
        : ["DRAW", "DRAW"];
  const winnerId =
    resolution.outcome === "A"
      ? input.participants[0].userId
      : resolution.outcome === "B"
        ? input.participants[1].userId
        : null;

  const outcomes = input.participants.map((participant, index) => {
    const other = input.participants[1 - index];
    const rating = calculateRatingChange(
      {
        playerRating: participant.rating,
        opponentRating: other.rating,
        playerScore: scores[index].score,
        opponentScore: scores[1 - index].score,
        result: results[index],
        completionRatio: 1,
        playerViolationCount: 0,
      },
      PNL_V1_RATING_CONFIG,
    );

    const counted = windowed[index].countedTrades;
    let grossProfit = 0;
    let grossLoss = 0;
    for (const trade of counted) {
      if (trade.realizedPnl >= 0) grossProfit += trade.realizedPnl;
      else grossLoss += Math.abs(trade.realizedPnl);
    }

    const outcome: ParticipantSettlementOutcome = {
      userId: participant.userId,
      displayName: names[index],
      tradingAccountId: participant.tradingAccountId,
      score: scores[index],
      result: results[index],
      rating,
      countedTrades: counted,
      excludedTrades: windowed[index].excludedTrades,
      openAtBuzzerTrades: windowed[index].openAtBuzzerTrades,
      openPositionAtClose: windowed[index].openPositionAtClose,
      exposureNotes: windowed[index].exposureNotes,
      maximumDrawdown: realizedDrawdown(counted),
      grossProfit: round2(grossProfit),
      grossLoss: round2(grossLoss),
    };
    return outcome;
  }) as [ParticipantSettlementOutcome, ParticipantSettlementOutcome];

  const settlementParticipants = outcomes.map((o) => {
    const row: ParticipantSettlementInput = {
      userId: o.userId,
      tradingAccountId: o.tradingAccountId,
      endingRating: o.rating.newRating,
      finalScore: o.score.score,
      result: o.result,
      realizedPnl: o.score.realizedPnl,
      participationBonus: o.score.participationBonus,
      closedTradeCount: o.score.closedTradeCount,
      grossProfit: o.grossProfit,
      grossLoss: o.grossLoss,
      markOutPnl: o.score.markOut.pnl,
      markOutStatus: o.score.markOut.status,
      markOutNote: o.score.markOut.note ?? null,
      maximumDrawdown: o.maximumDrawdown,
      tradeCount: o.score.closedTradeCount,
    };
    return row;
  }) as [ParticipantSettlementInput, ParticipantSettlementInput];

  const settlementInput: BattleSettlementInput = {
    battleId: input.battleId,
    winnerId,
    endTime: input.window.endAt,
    decidedBy: resolution.decidedBy,
    resolutionDetail,
    verificationStatus: SETTLEMENT_VERIFICATION,
    participants: settlementParticipants,
  };

  return {
    winnerId,
    resolution,
    resolutionDetail,
    participants: outcomes,
    settlementInput,
    report: buildReport(input, outcomes, resolution, resolutionDetail),
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function buildReport(
  input: SettleBattleInput,
  outcomes: [ParticipantSettlementOutcome, ParticipantSettlementOutcome],
  resolution: WinnerResolution,
  resolutionDetail: string,
): string[] {
  const lines: string[] = [
    `Battle window ${input.window.startAt} → ${input.window.endAt} ` +
      `(bracket ${input.accountBracket ?? "unspecified"}). Scoring starts at ` +
      "battle start: only trades entered inside the window count.",
  ];

  for (const o of outcomes) {
    lines.push(
      `${o.displayName}: ${o.score.closedTradeCount} counted trade(s), realized ` +
        `${usd(o.score.realizedPnl)}, participation bonus +${o.score.participationBonus}, ` +
        `mark-out ${usd(o.score.markOut.pnl)} → score ${o.score.score} (${o.result}). ` +
        `Max realized drawdown ${usd(o.maximumDrawdown)} (trade-close granularity).`,
    );
    for (const excluded of o.excludedTrades) {
      lines.push(
        `${o.displayName}: excluded ${excluded.trade.side} ${excluded.trade.size}-lot ` +
          `${excluded.instrument} (${usd(excluded.trade.realizedPnl)}) — ` +
          `${EXCLUSION_LABEL[excluded.reason]}.`,
      );
    }
    for (const open of o.openAtBuzzerTrades) {
      lines.push(
        `${o.displayName}: ${open.trade.side} ${open.trade.size}-lot ${open.instrument} ` +
          `exited after the buzzer — treated as open at close (full size at ` +
          `average entry; pre-buzzer partial exits are not visible in round-trip data).`,
      );
    }
    if (o.score.markOut.note) lines.push(`${o.displayName}: ${o.score.markOut.note}`);
    for (const note of o.exposureNotes) lines.push(`${o.displayName}: ${note}`);
    lines.push(
      `${o.displayName}: rating ${o.rating.change >= 0 ? "+" : ""}${o.rating.change} → ` +
        `${o.rating.newRating}.`,
    );
  }

  lines.push(`Decided by ${resolution.decidedBy}: ${resolutionDetail}`);
  return lines;
}
