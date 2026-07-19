/**
 * Risk-efficiency component (default weight: 25%).
 *
 * SERVER-SIDE AUTHORITATIVE — pure function, no I/O. UI must never
 * recompute this; it receives the result via battle snapshots.
 *
 * Rewards producing return with *little* risk. This is the component that
 * lets a disciplined trader beat a bigger gross P&L earned recklessly:
 *   - drawdownUsage        : how much of the permitted risk budget the max
 *                            drawdown consumed (less is better).
 *   - returnOverDrawdown   : net return per dollar of drawdown taken.
 *   - avgTradeRisk         : average |trade P&L| swing vs the risk budget —
 *                            proxy for per-trade risk until live stop data
 *                            exists.
 *   - contractUtilization  : how close position sizing ran to the contract
 *                            limit (headroom is rewarded).
 */

import type { RiskConfig } from "./config";
import { DEFAULT_SCORING_CONFIG } from "./config";
import { clamp, clamp01, combineFactors, fmtPct, fmtUsd } from "./helpers";
import type { BattleMetricsInput, ComponentScoreResult } from "./types";

export function calculateRiskScore(
  input: BattleMetricsInput,
  config: RiskConfig = DEFAULT_SCORING_CONFIG.riskEfficiency,
): ComponentScoreResult {
  const { netPnl, maxDrawdown, maxOpenContracts, trades } = input;
  const { permittedRisk, maxContracts } = input.limits;
  const w = config.factorWeights;

  // --- Drawdown usage ------------------------------------------------------
  let drawdownUsageScore: number;
  let drawdownUsageDetail: string;
  if (permittedRisk > 0) {
    const usage = clamp01(maxDrawdown / permittedRisk);
    drawdownUsageScore = 100 * (1 - usage);
    drawdownUsageDetail = `Max drawdown ${fmtUsd(maxDrawdown)} used ${fmtPct(usage)} of the ${fmtUsd(permittedRisk)} risk budget.`;
  } else {
    drawdownUsageScore = 50;
    drawdownUsageDetail = "No permitted risk defined; neutral score.";
  }

  // --- Return over drawdown ------------------------------------------------
  let returnOverDrawdownScore: number;
  let returnOverDrawdownDetail: string;
  if (maxDrawdown > 0) {
    const ratio = netPnl / maxDrawdown;
    // ratio 0 → 50; full-credit ratio (default 2x) → 100; -2x → 0.
    returnOverDrawdownScore =
      50 + 50 * clamp(ratio / config.fullCreditReturnOverDrawdown, -1, 1);
    returnOverDrawdownDetail = `Net return ${fmtUsd(netPnl)} per ${fmtUsd(maxDrawdown)} max drawdown (${ratio.toFixed(2)}x).`;
  } else if (netPnl > 0) {
    returnOverDrawdownScore = 100;
    returnOverDrawdownDetail = `Positive return of ${fmtUsd(netPnl)} with zero drawdown.`;
  } else {
    returnOverDrawdownScore = 50;
    returnOverDrawdownDetail = "No drawdown and no positive return; neutral score.";
  }

  // --- Average risk per trade ----------------------------------------------
  let avgTradeRiskScore: number;
  let avgTradeRiskDetail: string;
  if (trades.length > 0 && permittedRisk > 0) {
    const avgAbsPnl =
      trades.reduce((sum, t) => sum + Math.abs(t.realizedPnl), 0) /
      trades.length;
    const perTradeBudget = permittedRisk * config.avgTradeRiskFraction;
    const usage = clamp01(avgAbsPnl / perTradeBudget);
    avgTradeRiskScore = 100 * (1 - usage);
    avgTradeRiskDetail = `Average trade swing ${fmtUsd(avgAbsPnl)} vs a ${fmtUsd(perTradeBudget)} per-trade guideline.`;
  } else {
    avgTradeRiskScore = 50;
    avgTradeRiskDetail = "No completed trades to assess; neutral score.";
  }

  // --- Contract utilization -------------------------------------------------
  let contractUtilizationScore: number;
  let contractUtilizationDetail: string;
  if (maxContracts > 0) {
    const utilization = maxOpenContracts / maxContracts;
    const over = Math.max(
      0,
      (utilization - config.comfortableContractUtilization) /
        (1 - config.comfortableContractUtilization),
    );
    contractUtilizationScore = clamp(
      100 - config.contractUtilizationPenaltyRange * over,
      0,
      100,
    );
    contractUtilizationDetail = `Peaked at ${maxOpenContracts} of ${maxContracts} allowed contracts (${fmtPct(utilization)} utilization).`;
  } else {
    contractUtilizationScore = 50;
    contractUtilizationDetail = "No contract limit defined; neutral score.";
  }

  return combineFactors([
    {
      key: "drawdownUsage",
      label: "Drawdown vs risk budget",
      weight: w.drawdownUsage,
      score: drawdownUsageScore,
      detail: drawdownUsageDetail,
    },
    {
      key: "returnOverDrawdown",
      label: "Return over drawdown",
      weight: w.returnOverDrawdown,
      score: returnOverDrawdownScore,
      detail: returnOverDrawdownDetail,
    },
    {
      key: "avgTradeRisk",
      label: "Average risk per trade",
      weight: w.avgTradeRisk,
      score: avgTradeRiskScore,
      detail: avgTradeRiskDetail,
    },
    {
      key: "contractUtilization",
      label: "Contract usage vs limit",
      weight: w.contractUtilization,
      score: contractUtilizationScore,
      detail: contractUtilizationDetail,
    },
  ]);
}
