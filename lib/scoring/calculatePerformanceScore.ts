/**
 * Performance component (default weight: 40%).
 *
 * SERVER-SIDE AUTHORITATIVE — pure function, no I/O. UI must never
 * recompute this; it receives the result via battle snapshots.
 *
 * Measures how much a trader made *relative to what they were allowed to
 * risk* — never raw dollars in isolation:
 *   - returnOnRisk   : net P&L vs permitted risk, capped at ±100% of the
 *                      budget so a monster P&L cannot run the score away.
 *   - profitFactor   : gross profit / gross loss (1.0 → 50, full-credit
 *                      factor → 100).
 *   - gainRetention  : share of peak gains kept to the finish ("you retained
 *                      82% of your peak unrealized gains").
 */

import type { PerformanceConfig } from "./config";
import { DEFAULT_SCORING_CONFIG } from "./config";
import { clamp, clamp01, combineFactors, fmtPct, fmtUsd } from "./helpers";
import type { BattleMetricsInput, ComponentScoreResult } from "./types";

export function calculatePerformanceScore(
  input: BattleMetricsInput,
  config: PerformanceConfig = DEFAULT_SCORING_CONFIG.performance,
): ComponentScoreResult {
  const { netPnl, grossProfit, grossLoss, peakEquity } = input;
  const { permittedRisk } = input.limits;
  const w = config.factorWeights;

  // --- Return on permitted risk -------------------------------------------
  let returnOnRiskScore: number;
  let returnOnRiskDetail: string;
  if (permittedRisk > 0) {
    const ratio = netPnl / permittedRisk;
    // 0 P&L → 50; ±100% of the risk budget → 100 / 0. Linear in between.
    returnOnRiskScore = 50 + 50 * clamp(ratio, -1, 1);
    returnOnRiskDetail = `Net P&L of ${fmtUsd(netPnl)} against ${fmtUsd(permittedRisk)} permitted risk (${fmtPct(ratio)}).`;
  } else {
    returnOnRiskScore = 50;
    returnOnRiskDetail = "No permitted risk defined; neutral score.";
  }

  // --- Profit factor -------------------------------------------------------
  let profitFactorScore: number;
  let profitFactorDetail: string;
  if (grossLoss > 0) {
    const pf = grossProfit / grossLoss;
    profitFactorScore =
      pf <= 1
        ? 50 * pf
        : 50 + 50 * clamp01((pf - 1) / (config.fullCreditProfitFactor - 1));
    profitFactorDetail = `Profit factor ${pf.toFixed(2)} (${fmtUsd(grossProfit)} gross profit vs ${fmtUsd(grossLoss)} gross loss).`;
  } else if (grossProfit > 0) {
    profitFactorScore = 100;
    profitFactorDetail = `No losing trades against ${fmtUsd(grossProfit)} gross profit.`;
  } else {
    profitFactorScore = 50;
    profitFactorDetail = "No realized gains or losses; neutral score.";
  }

  // --- Gain retention ------------------------------------------------------
  let gainRetentionScore: number;
  let gainRetentionDetail: string;
  if (peakEquity > 0) {
    const retention = clamp01(netPnl / peakEquity);
    gainRetentionScore = 100 * retention;
    gainRetentionDetail = `Retained ${fmtPct(retention)} of peak gains (${fmtUsd(netPnl)} of ${fmtUsd(peakEquity)}).`;
  } else if (netPnl >= 0) {
    gainRetentionScore = 50;
    gainRetentionDetail = "Never held meaningful gains; neutral score.";
  } else {
    gainRetentionScore = 0;
    gainRetentionDetail = "Finished negative without ever holding gains.";
  }

  return combineFactors([
    {
      key: "returnOnRisk",
      label: "Return vs permitted risk",
      weight: w.returnOnRisk,
      score: returnOnRiskScore,
      detail: returnOnRiskDetail,
    },
    {
      key: "profitFactor",
      label: "Profit factor",
      weight: w.profitFactor,
      score: profitFactorScore,
      detail: profitFactorDetail,
    },
    {
      key: "gainRetention",
      label: "Gains retained",
      weight: w.gainRetention,
      score: gainRetentionScore,
      detail: gainRetentionDetail,
    },
  ]);
}
