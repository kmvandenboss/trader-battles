/**
 * Battle score — combines the four components into the 0–100 total.
 *
 * SERVER-SIDE AUTHORITATIVE. This is the single entry point the battle
 * engine (Phase 3) calls per participant per tick/snapshot. Pure function:
 * `BattleMetricsInput` in, `BattleScoreResult` out. No I/O, no framework
 * imports, no randomness. UI components receive the result and must NEVER
 * recompute scores themselves.
 *
 * Default weights (configurable per call, never hard-coded in the math):
 *   Performance 40% · Risk efficiency 25% · Discipline 20% · Consistency 15%
 *
 * The design intent, per the product brief: a disciplined trader with less
 * drawdown can and should beat someone who made more gross dollars with
 * reckless risk. Raw P&L only enters through the performance component,
 * where it is normalized against permitted risk and capped.
 */

import { calculateConsistencyScore } from "./calculateConsistencyScore";
import { calculateDisciplineScore } from "./calculateDisciplineScore";
import { calculatePerformanceScore } from "./calculatePerformanceScore";
import { calculateRiskScore } from "./calculateRiskScore";
import type { ScoringConfig, ScoringWeights } from "./config";
import { DEFAULT_SCORING_CONFIG, resolveScoringConfig } from "./config";
import { clamp, round2 } from "./helpers";
import type {
  BattleMetricsInput,
  BattleScoreResult,
  ComponentScores,
} from "./types";

// Re-export the public contract so consumers import everything from here.
export type { ScoringConfig, ScoringWeights } from "./config";
export { DEFAULT_SCORING_CONFIG, resolveScoringConfig } from "./config";
export type {
  BattleMetricsInput,
  BattleRiskLimits,
  BattleScoreResult,
  BattleTrade,
  ComponentScoreResult,
  ComponentScores,
  DisciplineScoreResult,
  DisciplineViolation,
  DisciplineViolationType,
  ScoreFactor,
} from "./types";

/** Normalize weights by their sum so {40,25,20,15} ≡ {0.4,0.25,0.2,0.15}. */
export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const entries = [
    weights.performance,
    weights.riskEfficiency,
    weights.discipline,
    weights.consistency,
  ];
  if (entries.some((v) => v < 0 || Number.isNaN(v))) {
    throw new Error("Scoring config error: weights must be non-negative");
  }
  const sum = entries.reduce((s, v) => s + v, 0);
  if (!(sum > 0)) {
    throw new Error("Scoring config error: weights must sum to > 0");
  }
  return {
    performance: weights.performance / sum,
    riskEfficiency: weights.riskEfficiency / sum,
    discipline: weights.discipline / sum,
    consistency: weights.consistency / sum,
  };
}

/**
 * Weighted total from four already-computed component scores.
 * Exposed separately so docs, tests, and the worked example can verify the
 * combination step in isolation (the brief publishes component scores, not
 * raw trade metrics).
 */
export function combineComponentScores(
  components: ComponentScores,
  weights: ScoringWeights = DEFAULT_SCORING_CONFIG.weights,
): number {
  const w = normalizeWeights(weights);
  const total =
    clamp(components.performance, 0, 100) * w.performance +
    clamp(components.riskEfficiency, 0, 100) * w.riskEfficiency +
    clamp(components.discipline, 0, 100) * w.discipline +
    clamp(components.consistency, 0, 100) * w.consistency;
  return round2(clamp(total, 0, 100));
}

/**
 * Score one participant's battle. `config` may override any section of the
 * defaults per call (weights and/or component tuning).
 */
export function calculateBattleScore(
  input: BattleMetricsInput,
  config?: Partial<ScoringConfig>,
): BattleScoreResult {
  const cfg = resolveScoringConfig(config);

  const performance = calculatePerformanceScore(input, cfg.performance);
  const riskEfficiency = calculateRiskScore(input, cfg.riskEfficiency);
  const discipline = calculateDisciplineScore(input, cfg.discipline);
  const consistency = calculateConsistencyScore(input, cfg.consistency);

  const total = combineComponentScores(
    {
      performance: performance.score,
      riskEfficiency: riskEfficiency.score,
      discipline: discipline.score,
      consistency: consistency.score,
    },
    cfg.weights,
  );

  return {
    total,
    weights: normalizeWeights(cfg.weights),
    components: { performance, riskEfficiency, discipline, consistency },
  };
}
