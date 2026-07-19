/**
 * Scoring engine unit tests.
 *
 * Covers: the brief's worked example (honest arithmetic), the core
 * "discipline beats raw profit" property, weight configurability,
 * clamping, and degenerate inputs.
 */

import { describe, expect, it } from "vitest";

import {
  calculateBattleScore,
  combineComponentScores,
  DEFAULT_SCORING_CONFIG,
  normalizeWeights,
} from "@/lib/scoring/calculateBattleScore";
import { calculateDisciplineScore } from "@/lib/scoring/calculateDisciplineScore";
import type {
  BattleMetricsInput,
  BattleTrade,
} from "@/lib/scoring/types";
import { WORKED_EXAMPLE } from "@/lib/scoring/workedExample";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const T0 = Date.parse("2026-07-17T13:30:00.000Z");
const MIN = 60_000;

interface TradeSpec {
  size: number;
  pnl: number;
  /** Entry offset from battle start, minutes. */
  at: number;
  /** Duration in minutes. */
  mins?: number;
  side?: "LONG" | "SHORT";
}

function trade(spec: TradeSpec): BattleTrade {
  return {
    side: spec.side ?? "LONG",
    size: spec.size,
    entryPrice: 23_000,
    exitPrice: 23_000 + spec.pnl / (spec.size * 20 || 1),
    realizedPnl: spec.pnl,
    entryTime: T0 + spec.at * MIN,
    exitTime: T0 + (spec.at + (spec.mins ?? 10)) * MIN,
  };
}

/** Build a consistent BattleMetricsInput from a trade list (equity path
 * derived from cumulative realized P&L). */
function inputFromTrades(
  specs: TradeSpec[],
  overrides: Partial<BattleMetricsInput> = {},
): BattleMetricsInput {
  const trades = specs.map(trade);
  let equity = 0;
  let peak = 0;
  let low = 0;
  let maxDrawdown = 0;
  for (const t of trades) {
    equity += t.realizedPnl;
    peak = Math.max(peak, equity);
    low = Math.min(low, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const grossProfit = trades
    .filter((t) => t.realizedPnl > 0)
    .reduce((s, t) => s + t.realizedPnl, 0);
  const grossLoss = trades
    .filter((t) => t.realizedPnl < 0)
    .reduce((s, t) => s - t.realizedPnl, 0);
  return {
    netPnl: equity,
    grossProfit,
    grossLoss,
    peakEquity: peak,
    lowestEquity: low,
    maxDrawdown,
    maxOpenContracts: Math.max(0, ...trades.map((t) => t.size)),
    trades,
    battleDurationMs: 90 * MIN,
    timeInSevereDrawdownMs: 0,
    limits: { permittedRisk: 2_500, dailyLossLimit: 2_500, maxContracts: 5 },
    ...overrides,
  };
}

/** Disciplined trader: steady size, modest drawdown, clean rules. */
const disciplinedInput = inputFromTrades([
  { size: 2, pnl: 320, at: 0 },
  { size: 2, pnl: 180, at: 15 },
  { size: 2, pnl: -120, at: 30 },
  { size: 2, pnl: 240, at: 50 },
]);

/** Reckless trader: HIGHER net P&L, but one oversized winner, deep drawdown,
 * a revenge size-up, and near-limit sizing throughout. */
const recklessInput = inputFromTrades(
  [
    { size: 2, pnl: -350, at: 0 },
    { size: 4, pnl: -420, at: 12 }, // 2x size-up 2 min after a losing exit
    { size: 5, pnl: 2_200, at: 27 },
    { size: 5, pnl: -300, at: 45 },
    { size: 5, pnl: -150, at: 60 },
    { size: 5, pnl: -80, at: 75 },
  ],
  { timeInSevereDrawdownMs: 30 * MIN },
);

// ---------------------------------------------------------------------------
// Worked example from docs/PRODUCT_BRIEF.md
// ---------------------------------------------------------------------------

describe("worked example (KevinV vs DeltaHunter)", () => {
  it("computes the honest weighted totals (83.55 and 74.0)", () => {
    const kevin = combineComponentScores(WORKED_EXAMPLE.kevinV.components);
    const delta = combineComponentScores(
      WORKED_EXAMPLE.deltaHunter.components,
    );
    expect(kevin).toBeCloseTo(83.55, 2);
    expect(delta).toBeCloseTo(74.0, 2);
    expect(kevin).toBeCloseTo(WORKED_EXAMPLE.kevinV.expectedFinal, 2);
    expect(delta).toBeCloseTo(WORKED_EXAMPLE.deltaHunter.expectedFinal, 2);
  });

  it("stays within ±1.0 of the brief's published (approximated) finals", () => {
    expect(
      Math.abs(
        WORKED_EXAMPLE.kevinV.expectedFinal -
          WORKED_EXAMPLE.kevinV.publishedFinal,
      ),
    ).toBeLessThanOrEqual(1.0);
    expect(
      Math.abs(
        WORKED_EXAMPLE.deltaHunter.expectedFinal -
          WORKED_EXAMPLE.deltaHunter.publishedFinal,
      ),
    ).toBeLessThanOrEqual(1.0);
  });

  it("KevinV wins by a clear margin despite the lower performance component", () => {
    const kevin = combineComponentScores(WORKED_EXAMPLE.kevinV.components);
    const delta = combineComponentScores(
      WORKED_EXAMPLE.deltaHunter.components,
    );
    expect(WORKED_EXAMPLE.kevinV.components.performance).toBeLessThan(
      WORKED_EXAMPLE.deltaHunter.components.performance,
    );
    expect(kevin).toBeGreaterThan(delta);
    expect(kevin - delta).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// The core product property
// ---------------------------------------------------------------------------

describe("discipline beats raw profit", () => {
  const disciplined = calculateBattleScore(disciplinedInput);
  const reckless = calculateBattleScore(recklessInput);

  it("the reckless trader really did make more money", () => {
    expect(recklessInput.netPnl).toBeGreaterThan(disciplinedInput.netPnl);
  });

  it("...but loses the battle on normalized score, decisively", () => {
    expect(disciplined.total).toBeGreaterThan(reckless.total);
    expect(disciplined.total - reckless.total).toBeGreaterThan(10);
  });

  it("the gap comes from risk, discipline, and consistency", () => {
    expect(disciplined.components.riskEfficiency.score).toBeGreaterThan(
      reckless.components.riskEfficiency.score,
    );
    expect(disciplined.components.discipline.score).toBeGreaterThan(
      reckless.components.discipline.score,
    );
    expect(disciplined.components.consistency.score).toBeGreaterThan(
      reckless.components.consistency.score,
    );
  });

  it("exposes the reckless trader's violations for the UI", () => {
    const types = reckless.components.discipline.violations.map(
      (v) => v.type,
    );
    expect(types).toContain("REVENGE_SIZING");
    expect(types).toContain("EXCESSIVE_CONTRACT_SIZE");
    for (const v of reckless.components.discipline.violations) {
      expect(v.penalty).toBeGreaterThan(0);
      expect(v.detail.length).toBeGreaterThan(0);
    }
    expect(disciplined.components.discipline.violations).toHaveLength(0);
    expect(disciplined.components.discipline.score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Configurable weights
// ---------------------------------------------------------------------------

describe("configurable weights", () => {
  it("performance-only weights flip the worked-example winner", () => {
    const weights = {
      performance: 1,
      riskEfficiency: 0,
      discipline: 0,
      consistency: 0,
    };
    const kevin = combineComponentScores(
      WORKED_EXAMPLE.kevinV.components,
      weights,
    );
    const delta = combineComponentScores(
      WORKED_EXAMPLE.deltaHunter.components,
      weights,
    );
    expect(kevin).toBe(78);
    expect(delta).toBe(86);
    expect(delta).toBeGreaterThan(kevin);
  });

  it("normalizes weights: {40,25,20,15} behaves like {0.4,0.25,0.2,0.15}", () => {
    const points = combineComponentScores(WORKED_EXAMPLE.kevinV.components, {
      performance: 40,
      riskEfficiency: 25,
      discipline: 20,
      consistency: 15,
    });
    expect(points).toBeCloseTo(83.55, 2);
    const normalized = normalizeWeights({
      performance: 40,
      riskEfficiency: 25,
      discipline: 20,
      consistency: 15,
    });
    expect(normalized.performance).toBeCloseTo(0.4, 10);
    expect(normalized.consistency).toBeCloseTo(0.15, 10);
  });

  it("per-call weight overrides shift calculateBattleScore predictably", () => {
    const base = calculateBattleScore(disciplinedInput);
    const disciplineHeavy = calculateBattleScore(disciplinedInput, {
      weights: {
        performance: 0.1,
        riskEfficiency: 0.2,
        discipline: 0.6,
        consistency: 0.1,
      },
    });
    // Discipline (100) is this trader's best component, so up-weighting it
    // must raise the total.
    expect(disciplineHeavy.total).toBeGreaterThan(base.total);
    // Component scores themselves are weight-independent.
    expect(disciplineHeavy.components.performance.score).toBe(
      base.components.performance.score,
    );
  });

  it("rejects degenerate weight configs", () => {
    expect(() =>
      combineComponentScores(WORKED_EXAMPLE.kevinV.components, {
        performance: 0,
        riskEfficiency: 0,
        discipline: 0,
        consistency: 0,
      }),
    ).toThrow();
    expect(() =>
      combineComponentScores(WORKED_EXAMPLE.kevinV.components, {
        performance: -1,
        riskEfficiency: 1,
        discipline: 1,
        consistency: 1,
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Clamping, degenerate inputs, and internal consistency
// ---------------------------------------------------------------------------

function expectValidResult(input: BattleMetricsInput): void {
  const result = calculateBattleScore(input);
  const scores = [
    result.total,
    result.components.performance.score,
    result.components.riskEfficiency.score,
    result.components.discipline.score,
    result.components.consistency.score,
  ];
  for (const s of scores) {
    expect(Number.isFinite(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  }
}

describe("robustness", () => {
  it("handles zero trades without NaN or throw", () => {
    expectValidResult(inputFromTrades([]));
  });

  it("handles an all-loss battle", () => {
    expectValidResult(
      inputFromTrades([
        { size: 2, pnl: -300, at: 0 },
        { size: 2, pnl: -250, at: 20 },
        { size: 1, pnl: -100, at: 40 },
      ]),
    );
  });

  it("handles profit with zero drawdown", () => {
    expectValidResult(
      inputFromTrades([
        { size: 1, pnl: 150, at: 0 },
        { size: 1, pnl: 200, at: 20 },
      ]),
    );
  });

  it("caps the total at 100 even for an absurdly good battle", () => {
    const result = calculateBattleScore(
      inputFromTrades([
        { size: 1, pnl: 50_000, at: 0 },
        { size: 1, pnl: 50_000, at: 20 },
        { size: 1, pnl: 50_000, at: 40 },
      ]),
    );
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("floors at 0 for a catastrophic battle", () => {
    expectValidResult(
      inputFromTrades(
        Array.from({ length: 30 }, (_, i) => ({
          size: 6, // over the 5-contract limit
          pnl: -400,
          at: i * 3,
          mins: 2,
        })),
        { timeInSevereDrawdownMs: 90 * MIN },
      ),
    );
  });

  it("total always equals the weighted combination of its own components", () => {
    for (const input of [disciplinedInput, recklessInput]) {
      const r = calculateBattleScore(input);
      const recombined =
        r.components.performance.score * r.weights.performance +
        r.components.riskEfficiency.score * r.weights.riskEfficiency +
        r.components.discipline.score * r.weights.discipline +
        r.components.consistency.score * r.weights.consistency;
      expect(r.total).toBeCloseTo(recombined, 2);
    }
  });

  it("factor breakdowns expose normalized weights and details", () => {
    const r = calculateBattleScore(disciplinedInput);
    for (const component of [
      r.components.performance,
      r.components.riskEfficiency,
      r.components.consistency,
    ]) {
      const weightSum = component.factors.reduce((s, f) => s + f.weight, 0);
      expect(weightSum).toBeCloseTo(1, 10);
      for (const f of component.factors) {
        expect(f.detail.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Discipline violation detection
// ---------------------------------------------------------------------------

describe("discipline violations", () => {
  it("flags overtrading against the battle's trade budget", () => {
    // 12 trades in a 60-minute battle; budget = max(6, ceil(1h * 6)) = 6.
    const input = inputFromTrades(
      Array.from({ length: 12 }, (_, i) => ({
        size: 1,
        pnl: i % 2 === 0 ? 60 : -40,
        at: i * 4,
        mins: 3,
      })),
      { battleDurationMs: 60 * MIN },
    );
    const result = calculateDisciplineScore(input);
    const overtrading = result.violations.find(
      (v) => v.type === "OVERTRADING",
    );
    expect(overtrading).toBeDefined();
    // 6 excess trades * 3 points, capped at 25.
    expect(overtrading?.penalty).toBe(18);
    expect(result.score).toBe(100 - result.totalPenalty);
  });

  it("flags a daily-loss violation from the equity low", () => {
    const input = inputFromTrades(
      [
        { size: 3, pnl: -1_500, at: 0 },
        { size: 3, pnl: -1_200, at: 20 },
      ],
      { limits: { permittedRisk: 2_500, dailyLossLimit: 2_500, maxContracts: 5 } },
    );
    const result = calculateDisciplineScore(input);
    expect(
      result.violations.some((v) => v.type === "DAILY_LOSS_VIOLATION"),
    ).toBe(true);
  });

  it("flags exceeding the contract limit", () => {
    const input = inputFromTrades([
      { size: 7, pnl: 500, at: 0 }, // limit is 5
    ]);
    const result = calculateDisciplineScore(input);
    expect(
      result.violations.some((v) => v.type === "CONTRACT_LIMIT_EXCEEDED"),
    ).toBe(true);
  });

  it("gives a clean battle a perfect 100 with no violations", () => {
    const result = calculateDisciplineScore(disciplinedInput);
    expect(result.score).toBe(100);
    expect(result.totalPenalty).toBe(0);
    expect(result.violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Default config sanity
// ---------------------------------------------------------------------------

describe("default config", () => {
  it("uses the brief's 40/25/20/15 weights", () => {
    expect(DEFAULT_SCORING_CONFIG.weights).toEqual({
      performance: 0.4,
      riskEfficiency: 0.25,
      discipline: 0.2,
      consistency: 0.15,
    });
  });
});
