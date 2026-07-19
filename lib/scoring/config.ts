/**
 * Scoring configuration — every weight, threshold, and penalty in one place.
 *
 * SERVER-SIDE AUTHORITATIVE. Nothing in the component math hard-codes a
 * weight or threshold; it all flows from a `ScoringConfig`, so operators can
 * retune the model (or run alternate configs per battle type, e.g.
 * DISCIPLINE_BATTLE) without touching the math. `DEFAULT_SCORING_CONFIG`
 * mirrors the product brief: Performance 40% · Risk efficiency 25% ·
 * Discipline 20% · Consistency 15%.
 */

/** Top-level component weights. They are normalized by their sum, so
 * `{40, 25, 20, 15}` and `{0.4, 0.25, 0.2, 0.15}` behave identically. */
export interface ScoringWeights {
  performance: number;
  riskEfficiency: number;
  discipline: number;
  consistency: number;
}

export interface PerformanceConfig {
  /** Relative weights of the performance sub-factors (normalized by sum). */
  factorWeights: {
    returnOnRisk: number;
    profitFactor: number;
    gainRetention: number;
  };
  /** Profit factor at (or above) which the profit-factor sub-score is 100. */
  fullCreditProfitFactor: number;
}

export interface RiskConfig {
  factorWeights: {
    drawdownUsage: number;
    returnOverDrawdown: number;
    avgTradeRisk: number;
    contractUtilization: number;
  };
  /** netPnl / maxDrawdown ratio at which that sub-score reaches 100. */
  fullCreditReturnOverDrawdown: number;
  /** Average |trade P&L| equal to this fraction of permitted risk scores 0. */
  avgTradeRiskFraction: number;
  /** Contract utilization at or below this fraction of the limit scores 100. */
  comfortableContractUtilization: number;
  /** Points lost between comfortable utilization and 100% of the limit. */
  contractUtilizationPenaltyRange: number;
}

export interface DisciplineConfig {
  /** Flat penalty for opening more contracts than the battle rules allow. */
  contractLimitPenalty: number;
  /** Trades sized above this fraction of maxContracts count as oversized. */
  excessiveSizeThreshold: number;
  excessiveSizePenaltyPerTrade: number;
  excessiveSizePenaltyCap: number;
  /** A size-up of at least this factor right after a loss is revenge sizing. */
  revengeSizeUpFactor: number;
  /** ...if the new trade opens within this window after the losing exit. */
  revengeWindowMs: number;
  revengeSizingPenaltyPerOccurrence: number;
  revengeSizingPenaltyCap: number;
  /** Trade budget: max(minAllowedTrades, hours * maxTradesPerHour). */
  maxTradesPerHour: number;
  minAllowedTrades: number;
  overtradingPenaltyPerExcessTrade: number;
  overtradingPenaltyCap: number;
  /** Penalty for breaching the daily loss limit during the battle. */
  dailyLossPenalty: number;
}

export interface ConsistencyConfig {
  factorWeights: {
    gainDistribution: number;
    multiTradeGains: number;
    stability: number;
    drawdownTime: number;
  };
  /** Largest-win share of gross profit at/below which distribution is 100. */
  acceptableWinConcentration: number;
  /** Winning-trade count at which the multi-trade sub-score reaches 100. */
  fullCreditWinCount: number;
  /** Trade-P&L stdev equal to this fraction of permitted risk scores 0. */
  stabilityRiskFraction: number;
  /** Battle-time fraction in severe drawdown at which that sub-score is 0. */
  maxSevereDrawdownFraction: number;
}

export interface ScoringConfig {
  weights: ScoringWeights;
  performance: PerformanceConfig;
  riskEfficiency: RiskConfig;
  discipline: DisciplineConfig;
  consistency: ConsistencyConfig;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    performance: 0.4,
    riskEfficiency: 0.25,
    discipline: 0.2,
    consistency: 0.15,
  },
  performance: {
    factorWeights: { returnOnRisk: 0.5, profitFactor: 0.3, gainRetention: 0.2 },
    fullCreditProfitFactor: 3,
  },
  riskEfficiency: {
    factorWeights: {
      drawdownUsage: 0.35,
      returnOverDrawdown: 0.3,
      avgTradeRisk: 0.2,
      contractUtilization: 0.15,
    },
    fullCreditReturnOverDrawdown: 2,
    avgTradeRiskFraction: 0.5,
    comfortableContractUtilization: 0.5,
    contractUtilizationPenaltyRange: 60,
  },
  discipline: {
    contractLimitPenalty: 30,
    excessiveSizeThreshold: 0.8,
    excessiveSizePenaltyPerTrade: 5,
    excessiveSizePenaltyCap: 15,
    revengeSizeUpFactor: 1.5,
    revengeWindowMs: 5 * 60_000,
    revengeSizingPenaltyPerOccurrence: 12,
    revengeSizingPenaltyCap: 24,
    maxTradesPerHour: 6,
    minAllowedTrades: 6,
    overtradingPenaltyPerExcessTrade: 3,
    overtradingPenaltyCap: 25,
    dailyLossPenalty: 40,
  },
  consistency: {
    factorWeights: {
      gainDistribution: 0.3,
      multiTradeGains: 0.25,
      stability: 0.2,
      drawdownTime: 0.25,
    },
    acceptableWinConcentration: 0.4,
    fullCreditWinCount: 3,
    stabilityRiskFraction: 0.35,
    maxSevereDrawdownFraction: 0.5,
  },
};

/**
 * Merge a per-call override onto the defaults. Overrides are section-level:
 * a provided section (e.g. `weights`) must be complete, which keeps merging
 * predictable and type-safe.
 */
export function resolveScoringConfig(
  overrides?: Partial<ScoringConfig>,
): ScoringConfig {
  if (!overrides) return DEFAULT_SCORING_CONFIG;
  return {
    weights: overrides.weights ?? DEFAULT_SCORING_CONFIG.weights,
    performance: overrides.performance ?? DEFAULT_SCORING_CONFIG.performance,
    riskEfficiency:
      overrides.riskEfficiency ?? DEFAULT_SCORING_CONFIG.riskEfficiency,
    discipline: overrides.discipline ?? DEFAULT_SCORING_CONFIG.discipline,
    consistency: overrides.consistency ?? DEFAULT_SCORING_CONFIG.consistency,
  };
}
