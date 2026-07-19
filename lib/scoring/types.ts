/**
 * Scoring engine — input & output shapes.
 *
 * SERVER-SIDE AUTHORITATIVE. These types define the contract between the
 * execution pipeline (Phase 3: lib/executions/positionLedger.ts produces a
 * `BattleMetricsInput` per participant) and the pure scoring functions in
 * this folder. UI components receive already-computed `BattleScoreResult`s
 * and must NEVER recompute scores themselves.
 *
 * Everything here is provider-agnostic: it does not matter whether the
 * underlying executions came from the mock provider or a future live
 * integration (NinjaTrader, Tradovate, Rithmic, ...).
 */

import type { ScoringWeights } from "./config";

/** A completed round-trip trade, as reconstructed by the position ledger. */
export interface BattleTrade {
  side: "LONG" | "SHORT";
  /** Contracts held at the trade's maximum size. */
  size: number;
  entryPrice: number;
  exitPrice: number;
  /** Realized P&L in dollars, net of commission. */
  realizedPnl: number;
  /** Entry timestamp, epoch milliseconds. */
  entryTime: number;
  /** Exit timestamp, epoch milliseconds. */
  exitTime: number;
}

/** The battle's risk rules for one participant (from account + battleRules). */
export interface BattleRiskLimits {
  /**
   * Dollar risk budget for the battle (e.g. remaining daily drawdown
   * allowance). Return and drawdown are normalized against this — it is what
   * keeps a $150k account from out-scoring a $50k account on raw dollars.
   */
  permittedRisk: number;
  /** Daily loss limit in dollars. Breaching it is a discipline violation. */
  dailyLossLimit: number;
  /** Maximum contracts allowed open at once under the battle rules. */
  maxContracts: number;
}

/**
 * Aggregated battle metrics for ONE participant. Every field is computable
 * from the position ledger's equity path + trade list — no provider or
 * database types leak in here.
 */
export interface BattleMetricsInput {
  /** Net P&L in dollars over the battle. */
  netPnl: number;
  /** Sum of winning trades' P&L, >= 0. */
  grossProfit: number;
  /** Absolute sum of losing trades' P&L, >= 0. */
  grossLoss: number;
  /** Highest cumulative P&L reached during the battle (>= 0; start is 0). */
  peakEquity: number;
  /** Lowest cumulative P&L reached during the battle (<= 0; start is 0). */
  lowestEquity: number;
  /** Maximum peak-to-trough equity drawdown in dollars, >= 0. */
  maxDrawdown: number;
  /** Largest number of contracts held open at any moment. */
  maxOpenContracts: number;
  /** Completed round-trip trades, in entry-time order. */
  trades: BattleTrade[];
  /** Total battle duration in milliseconds. */
  battleDurationMs: number;
  /**
   * Milliseconds spent in "severe" drawdown, as measured by the ledger
   * (drawdown beyond its severe threshold, e.g. 50% of permitted risk).
   */
  timeInSevereDrawdownMs: number;
  limits: BattleRiskLimits;
}

/** One explainable sub-factor of a component score (feeds UI breakdowns). */
export interface ScoreFactor {
  key: string;
  label: string;
  /** 0–100. */
  score: number;
  /** Normalized weight of this factor within its component (sums to 1). */
  weight: number;
  /** Human-readable explanation with the numbers that produced the score. */
  detail: string;
}

/** Result shape shared by performance / risk / consistency components. */
export interface ComponentScoreResult {
  /** 0–100, rounded to 2 decimals. */
  score: number;
  factors: ScoreFactor[];
}

export const DISCIPLINE_VIOLATION_TYPES = [
  "CONTRACT_LIMIT_EXCEEDED",
  "EXCESSIVE_CONTRACT_SIZE",
  "REVENGE_SIZING",
  "OVERTRADING",
  "DAILY_LOSS_VIOLATION",
] as const;
export type DisciplineViolationType =
  (typeof DISCIPLINE_VIOLATION_TYPES)[number];

/** A single rule violation with its penalty — powers UI penalty events and "why you won/lost" bullets. */
export interface DisciplineViolation {
  type: DisciplineViolationType;
  label: string;
  /** Points deducted from the discipline score for this violation. */
  penalty: number;
  detail: string;
}

/** Discipline starts at 100 and loses points per violation. */
export interface DisciplineScoreResult {
  /** 0–100. */
  score: number;
  violations: DisciplineViolation[];
  totalPenalty: number;
}

/** The four component scores as plain numbers (0–100). */
export interface ComponentScores {
  performance: number;
  riskEfficiency: number;
  discipline: number;
  consistency: number;
}

/** Full scored battle result for one participant. */
export interface BattleScoreResult {
  /** 0–100, rounded to 2 decimals. */
  total: number;
  /** Normalized weights actually applied (sum to 1). */
  weights: ScoringWeights;
  components: {
    performance: ComponentScoreResult;
    riskEfficiency: ComponentScoreResult;
    discipline: DisciplineScoreResult;
    consistency: ComponentScoreResult;
  };
}
