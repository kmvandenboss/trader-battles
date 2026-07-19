/**
 * Consistency component (default weight: 15%).
 *
 * SERVER-SIDE AUTHORITATIVE — pure function, no I/O. UI must never
 * recompute this; it receives the result via battle snapshots.
 *
 * Rewards steady, repeatable results over one lucky oversized winner:
 *   - gainDistribution : share of gross profit from the single largest win
 *                        (a result that "depended heavily on one oversized
 *                        trade" scores low here).
 *   - multiTradeGains  : gains built across multiple winning trades.
 *   - stability        : dispersion of trade P&L relative to the risk budget.
 *   - drawdownTime     : share of the battle spent in severe drawdown.
 */

import type { ConsistencyConfig } from "./config";
import { DEFAULT_SCORING_CONFIG } from "./config";
import { clamp01, combineFactors, fmtPct, fmtUsd, stdev } from "./helpers";
import type { BattleMetricsInput, ComponentScoreResult } from "./types";

export function calculateConsistencyScore(
  input: BattleMetricsInput,
  config: ConsistencyConfig = DEFAULT_SCORING_CONFIG.consistency,
): ComponentScoreResult {
  const { trades, grossProfit, battleDurationMs, timeInSevereDrawdownMs } =
    input;
  const { permittedRisk } = input.limits;
  const w = config.factorWeights;
  const wins = trades.filter((t) => t.realizedPnl > 0);

  // --- Gain distribution (dependence on one oversized winner) ---------------
  let gainDistributionScore: number;
  let gainDistributionDetail: string;
  if (grossProfit > 0 && wins.length > 0) {
    const largestWin = Math.max(...wins.map((t) => t.realizedPnl));
    const concentration = clamp01(largestWin / grossProfit);
    const over = clamp01(
      (concentration - config.acceptableWinConcentration) /
        (1 - config.acceptableWinConcentration),
    );
    gainDistributionScore = 100 * (1 - over);
    gainDistributionDetail = `Largest win ${fmtUsd(largestWin)} was ${fmtPct(concentration)} of gross profit.`;
  } else {
    gainDistributionScore = 50;
    gainDistributionDetail = "No winning trades to distribute; neutral score.";
  }

  // --- Multi-trade gains -----------------------------------------------------
  const multiTradeScore =
    100 * clamp01(wins.length / config.fullCreditWinCount);
  const multiTradeDetail = `${wins.length} winning trade${wins.length === 1 ? "" : "s"} (full credit at ${config.fullCreditWinCount}).`;

  // --- Stability of trade results ---------------------------------------------
  let stabilityScore: number;
  let stabilityDetail: string;
  if (trades.length >= 2 && permittedRisk > 0) {
    const sd = stdev(trades.map((t) => t.realizedPnl));
    const budget = permittedRisk * config.stabilityRiskFraction;
    stabilityScore = 100 * (1 - clamp01(sd / budget));
    stabilityDetail = `Trade P&L volatility ${fmtUsd(sd)} vs a ${fmtUsd(budget)} stability guideline.`;
  } else {
    stabilityScore = 50;
    stabilityDetail = "Fewer than two trades; neutral score.";
  }

  // --- Time in severe drawdown --------------------------------------------------
  let drawdownTimeScore: number;
  let drawdownTimeDetail: string;
  if (battleDurationMs > 0) {
    const fraction = clamp01(timeInSevereDrawdownMs / battleDurationMs);
    drawdownTimeScore =
      100 * (1 - clamp01(fraction / config.maxSevereDrawdownFraction));
    drawdownTimeDetail = `Spent ${fmtPct(fraction)} of the battle in severe drawdown.`;
  } else {
    drawdownTimeScore = 100;
    drawdownTimeDetail = "No battle duration recorded; no drawdown time.";
  }

  return combineFactors([
    {
      key: "gainDistribution",
      label: "Gain distribution",
      weight: w.gainDistribution,
      score: gainDistributionScore,
      detail: gainDistributionDetail,
    },
    {
      key: "multiTradeGains",
      label: "Gains from multiple trades",
      weight: w.multiTradeGains,
      score: multiTradeScore,
      detail: multiTradeDetail,
    },
    {
      key: "stability",
      label: "Result stability",
      weight: w.stability,
      score: stabilityScore,
      detail: stabilityDetail,
    },
    {
      key: "drawdownTime",
      label: "Time in severe drawdown",
      weight: w.drawdownTime,
      score: drawdownTimeScore,
      detail: drawdownTimeDetail,
    },
  ]);
}
