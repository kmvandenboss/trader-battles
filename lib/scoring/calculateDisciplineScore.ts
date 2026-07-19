/**
 * Discipline component (default weight: 20%).
 *
 * SERVER-SIDE AUTHORITATIVE — pure function, no I/O. UI must never
 * recompute this; it receives the result (including the violation list)
 * via battle snapshots.
 *
 * Starts at 100 and deducts explicit, explainable penalties. Each violation
 * is returned as a structured record so the UI can render penalty events
 * ("DeltaHunter received an overtrading penalty") and "why you won/lost"
 * bullets without re-deriving anything.
 *
 * Violations detected:
 *   - CONTRACT_LIMIT_EXCEEDED : opened more contracts than the battle allows.
 *   - EXCESSIVE_CONTRACT_SIZE : trades sized near/at the contract limit.
 *   - REVENGE_SIZING          : rapid size-up shortly after a losing trade.
 *   - OVERTRADING             : trade count beyond the battle's trade budget.
 *   - DAILY_LOSS_VIOLATION    : equity breached the daily loss limit.
 */

import type { DisciplineConfig } from "./config";
import { DEFAULT_SCORING_CONFIG } from "./config";
import { clamp, fmtUsd, round2 } from "./helpers";
import type {
  BattleMetricsInput,
  DisciplineScoreResult,
  DisciplineViolation,
} from "./types";

export function calculateDisciplineScore(
  input: BattleMetricsInput,
  config: DisciplineConfig = DEFAULT_SCORING_CONFIG.discipline,
): DisciplineScoreResult {
  const violations: DisciplineViolation[] = [];
  const { trades, maxOpenContracts, lowestEquity, battleDurationMs } = input;
  const { maxContracts, dailyLossLimit } = input.limits;

  // --- Contract limit breach ------------------------------------------------
  if (maxContracts > 0) {
    const worst = Math.max(
      maxOpenContracts,
      ...trades.map((t) => t.size),
      0,
    );
    if (worst > maxContracts) {
      violations.push({
        type: "CONTRACT_LIMIT_EXCEEDED",
        label: "Contract limit exceeded",
        penalty: config.contractLimitPenalty,
        detail: `Held ${worst} contracts against a limit of ${maxContracts}.`,
      });
    }
  }

  // --- Excessive contract size (within the limit, but oversized) ------------
  if (maxContracts > 0) {
    const threshold = config.excessiveSizeThreshold * maxContracts;
    const oversized = trades.filter(
      (t) => t.size > threshold && t.size <= maxContracts,
    );
    if (oversized.length > 0) {
      const penalty = Math.min(
        oversized.length * config.excessiveSizePenaltyPerTrade,
        config.excessiveSizePenaltyCap,
      );
      violations.push({
        type: "EXCESSIVE_CONTRACT_SIZE",
        label: "Excessive contract size",
        penalty,
        detail: `${oversized.length} trade${oversized.length === 1 ? "" : "s"} sized above ${Math.round(config.excessiveSizeThreshold * 100)}% of the ${maxContracts}-contract limit.`,
      });
    }
  }

  // --- Revenge sizing (rapid size-up after a loss) ---------------------------
  const ordered = [...trades].sort((a, b) => a.entryTime - b.entryTime);
  let revengeCount = 0;
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    if (
      prev.realizedPnl < 0 &&
      prev.size > 0 &&
      curr.size >= config.revengeSizeUpFactor * prev.size &&
      curr.entryTime - prev.exitTime <= config.revengeWindowMs
    ) {
      revengeCount += 1;
    }
  }
  if (revengeCount > 0) {
    const penalty = Math.min(
      revengeCount * config.revengeSizingPenaltyPerOccurrence,
      config.revengeSizingPenaltyCap,
    );
    violations.push({
      type: "REVENGE_SIZING",
      label: "Rapid size-up after a loss",
      penalty,
      detail: `Increased size ${config.revengeSizeUpFactor}x+ within ${Math.round(config.revengeWindowMs / 60_000)} minutes of a losing trade (${revengeCount}x).`,
    });
  }

  // --- Overtrading ------------------------------------------------------------
  const hours = battleDurationMs > 0 ? battleDurationMs / 3_600_000 : 0;
  const allowedTrades = Math.max(
    config.minAllowedTrades,
    Math.ceil(hours * config.maxTradesPerHour),
  );
  if (trades.length > allowedTrades) {
    const excess = trades.length - allowedTrades;
    const penalty = Math.min(
      excess * config.overtradingPenaltyPerExcessTrade,
      config.overtradingPenaltyCap,
    );
    violations.push({
      type: "OVERTRADING",
      label: "Overtrading",
      penalty,
      detail: `${trades.length} trades against a budget of ${allowedTrades} for this battle window.`,
    });
  }

  // --- Daily loss violation -----------------------------------------------------
  if (dailyLossLimit > 0 && lowestEquity <= -dailyLossLimit) {
    violations.push({
      type: "DAILY_LOSS_VIOLATION",
      label: "Daily loss limit breached",
      penalty: config.dailyLossPenalty,
      detail: `Equity fell to ${fmtUsd(lowestEquity)}, beyond the ${fmtUsd(dailyLossLimit)} daily loss limit.`,
    });
  }

  const totalPenalty = round2(
    violations.reduce((sum, v) => sum + v.penalty, 0),
  );
  return {
    score: round2(clamp(100 - totalPenalty, 0, 100)),
    violations,
    totalPenalty,
  };
}
