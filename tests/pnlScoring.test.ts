/**
 * PNL_V1 scoring unit tests (MFFU v1, Phase A).
 *
 * Covers: participation-bonus capping, the "trading near breakeven beats a
 * flat no-show" property, "PnL dominates the bonus in a decisive battle",
 * buzzer mark-out handling (marked vs excluded+noted), and every tier of the
 * tiebreaker cascade including the explicit dead tie.
 */

import { describe, expect, it } from "vitest";

import {
  calculatePnlBattleScore,
  resolveBattleWinner,
  type PnlBattleInput,
  type PnlBattleScoreResult,
} from "@/lib/scoring/calculatePnlBattleScore";
import {
  DEFAULT_PNL_SCORING_CONFIG,
  DEFAULT_SCORING_MODE,
  resolvePnlScoringConfig,
  SCORING_MODES,
} from "@/lib/scoring/config";
import type { BattleTrade } from "@/lib/scoring/types";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const T0 = Date.parse("2026-07-21T13:30:00.000Z");
const MIN = 60_000;

interface TradeSpec {
  pnl: number;
  /** Exit offset from window start, minutes (drives first-green ordering). */
  exitAt: number;
  size?: number;
  side?: "LONG" | "SHORT";
}

function trade(spec: TradeSpec): BattleTrade {
  const size = spec.size ?? 1;
  return {
    side: spec.side ?? "LONG",
    size,
    entryPrice: 23_000,
    exitPrice: 23_000 + spec.pnl / (size * 20),
    realizedPnl: spec.pnl,
    entryTime: T0 + (spec.exitAt - 5) * MIN,
    exitTime: T0 + spec.exitAt * MIN,
  };
}

function input(
  specs: TradeSpec[],
  overrides: Partial<PnlBattleInput> = {},
): PnlBattleInput {
  return {
    trades: specs.map(trade),
    accountBracket: "50K",
    ...overrides,
  };
}

function score(
  specs: TradeSpec[],
  overrides: Partial<PnlBattleInput> = {},
): PnlBattleScoreResult {
  return calculatePnlBattleScore(input(specs, overrides));
}

// ---------------------------------------------------------------------------
// Score = PnL + capped participation bonus
// ---------------------------------------------------------------------------

describe("PNL_V1 score and participation bonus", () => {
  it("scores $1 = 1 point plus +5 per closed trade", () => {
    const r = score([
      { pnl: 250, exitAt: 10 },
      { pnl: -100, exitAt: 25 },
    ]);
    expect(r.realizedPnl).toBe(150);
    expect(r.closedTradeCount).toBe(2);
    expect(r.participationBonus).toBe(10);
    expect(r.score).toBe(160);
  });

  it("caps the bonus at 3 closed trades (+15)", () => {
    const r = score([
      { pnl: 50, exitAt: 5 },
      { pnl: 50, exitAt: 10 },
      { pnl: 50, exitAt: 15 },
      { pnl: 50, exitAt: 20 },
      { pnl: 50, exitAt: 25 },
    ]);
    expect(r.closedTradeCount).toBe(5);
    expect(r.participationBonus).toBe(15);
    expect(r.score).toBe(250 + 15);
  });

  it("pulls bonus values from config, not hard-coded numbers", () => {
    const r = calculatePnlBattleScore(
      input([
        { pnl: 0, exitAt: 5 },
        { pnl: 0, exitAt: 10 },
        { pnl: 0, exitAt: 15 },
        { pnl: 0, exitAt: 20 },
      ]),
      { pointsPerTrade: 2, maxTrades: 5 },
    );
    expect(r.participationBonus).toBe(8); // 2 × min(4, 5)
    expect(r.score).toBe(8);
  });

  it("default config is +5/trade capped at 3, and PNL_V1 is the default mode", () => {
    expect(DEFAULT_PNL_SCORING_CONFIG).toEqual({
      pointsPerTrade: 5,
      maxTrades: 3,
    });
    expect(DEFAULT_SCORING_MODE).toBe("PNL_V1");
    expect(SCORING_MODES).toContain("NORMALIZED_4F");
  });

  it("rejects negative or non-integer bonus config", () => {
    expect(() => resolvePnlScoringConfig({ pointsPerTrade: -1 })).toThrow();
    expect(() => resolvePnlScoringConfig({ maxTrades: -2 })).toThrow();
    expect(() => resolvePnlScoringConfig({ maxTrades: 2.5 })).toThrow();
    // Fractional pointsPerTrade remains a valid tuning knob.
    expect(resolvePnlScoringConfig({ pointsPerTrade: 2.5 })).toEqual({
      pointsPerTrade: 2.5,
      maxTrades: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// The core v1 properties
// ---------------------------------------------------------------------------

describe("participation properties", () => {
  it("a trader who traded to -$3 beats a flat $0 no-show", () => {
    const traded = score([{ pnl: -3, exitAt: 10 }]);
    const noShow = score([]);
    expect(traded.score).toBe(2); // -3 + 5
    expect(noShow.score).toBe(0);
    const result = resolveBattleWinner(traded, noShow);
    expect(result.outcome).toBe("A");
    expect(result.decidedBy).toBe("SCORE");
  });

  it("the PnL gap dominates the bonus in a decisive battle", () => {
    // One patient trade worth $500 vs three scalps totaling $120: the
    // scalper maxes the bonus (+15 vs +5) but the bonus never flips it.
    const patient = score([{ pnl: 500, exitAt: 40 }]);
    const scalper = score([
      { pnl: 40, exitAt: 5 },
      { pnl: 40, exitAt: 10 },
      { pnl: 40, exitAt: 15 },
    ]);
    expect(patient.participationBonus).toBeLessThan(
      scalper.participationBonus,
    );
    expect(patient.score).toBe(505);
    expect(scalper.score).toBe(135);
    const result = resolveBattleWinner(patient, scalper);
    expect(result.outcome).toBe("A");
    expect(result.decidedBy).toBe("SCORE");
  });
});

// ---------------------------------------------------------------------------
// Buzzer mark-out of an open position
// ---------------------------------------------------------------------------

describe("mark-out of an open position at window close", () => {
  it("counts the position at the provided mark price (long)", () => {
    const r = score([{ pnl: 100, exitAt: 10 }], {
      openPosition: {
        side: "LONG",
        size: 2,
        averageEntryPrice: 23_000,
        pointValue: 20,
        markPrice: 23_010,
      },
    });
    expect(r.markOut.status).toBe("MARKED");
    expect(r.markOut.pnl).toBe(400); // 10 pts × 2 × $20
    expect(r.score).toBe(100 + 400 + 5);
    expect(r.markOut.note).toBeTruthy();
  });

  it("marks a short correctly (profit when price falls)", () => {
    const r = score([], {
      openPosition: {
        side: "SHORT",
        size: 1,
        averageEntryPrice: 23_000,
        pointValue: 20,
        markPrice: 22_990,
      },
    });
    expect(r.markOut.pnl).toBe(200);
    expect(r.score).toBe(200); // no closed trades → no bonus
  });

  it("excludes the position and notes it when no mark price is provided", () => {
    const r = score([{ pnl: 100, exitAt: 10 }], {
      openPosition: {
        side: "LONG",
        size: 2,
        averageEntryPrice: 23_000,
        pointValue: 20,
      },
    });
    expect(r.markOut.status).toBe("EXCLUDED_NO_MARK");
    expect(r.markOut.pnl).toBe(0);
    expect(r.markOut.note).toBeTruthy();
    expect(r.markOut.note).toMatch(/excluded/i);
    expect(r.score).toBe(105); // mark-out contributes nothing
  });

  it("a mark-out is not a closed trade: no bonus, no tiebreaker credit", () => {
    const r = score([], {
      openPosition: {
        side: "LONG",
        size: 1,
        averageEntryPrice: 23_000,
        pointValue: 20,
        markPrice: 23_050,
      },
    });
    expect(r.closedTradeCount).toBe(0);
    expect(r.participationBonus).toBe(0);
    expect(r.tiebreakers.tookTrade).toBe(false);
    expect(r.tiebreakers.winningTradeCount).toBe(0);
  });

  it("reports NONE when there is no open position", () => {
    expect(score([]).markOut).toEqual({ status: "NONE", pnl: 0 });
  });
});

// ---------------------------------------------------------------------------
// Tiebreaker fields
// ---------------------------------------------------------------------------

describe("tiebreaker fields", () => {
  it("computes profit factor, winning trades, and first-green", () => {
    const r = score([
      { pnl: -50, exitAt: 5 },
      { pnl: 100, exitAt: 15 }, // cumulative +50 → first green here
      { pnl: 20, exitAt: 30 },
    ]);
    expect(r.tiebreakers.profitFactor).toBeCloseTo(120 / 50, 10);
    expect(r.tiebreakers.winningTradeCount).toBe(2);
    expect(r.tiebreakers.tookTrade).toBe(true);
    expect(r.tiebreakers.firstGreenAtMs).toBe(T0 + 15 * MIN);
  });

  it("profit factor is Infinity with wins and no losses, 0 with no wins", () => {
    expect(score([{ pnl: 80, exitAt: 5 }]).tiebreakers.profitFactor).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(score([{ pnl: -80, exitAt: 5 }]).tiebreakers.profitFactor).toBe(0);
    expect(score([]).tiebreakers.profitFactor).toBe(0);
  });

  it("firstGreenAtMs is null when the trader never went green", () => {
    const r = score([
      { pnl: -100, exitAt: 5 },
      { pnl: 60, exitAt: 20 }, // cumulative -40, never green
    ]);
    expect(r.tiebreakers.firstGreenAtMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Winner resolution — every cascade tier
// ---------------------------------------------------------------------------

describe("resolveBattleWinner cascade", () => {
  it("equal score but different realized PnL → REALIZED_PNL decides", () => {
    // A: $10 PnL over 1 trade (score 15) · B: $0 PnL over 3 trades (score 15).
    const a = score([{ pnl: 10, exitAt: 10 }]);
    const b = score([
      { pnl: 0, exitAt: 5 },
      { pnl: 0, exitAt: 10 },
      { pnl: 0, exitAt: 15 },
    ]);
    expect(a.score).toBe(b.score);
    const result = resolveBattleWinner(a, b);
    expect(result.outcome).toBe("A");
    expect(result.decidedBy).toBe("REALIZED_PNL");
  });

  it("equal score and PnL → higher profit factor decides", () => {
    // Both: 2 trades, net +$50, score 60. A's PF = 100/50 = 2; B's = 200/150.
    const a = score([
      { pnl: 100, exitAt: 5 },
      { pnl: -50, exitAt: 15 },
    ]);
    const b = score([
      { pnl: 200, exitAt: 5 },
      { pnl: -150, exitAt: 15 },
    ]);
    expect(a.score).toBe(b.score);
    expect(a.realizedPnl).toBe(b.realizedPnl);
    const result = resolveBattleWinner(a, b);
    expect(result.outcome).toBe("A");
    expect(result.decidedBy).toBe("PROFIT_FACTOR");
  });

  it("tied through profit factor → more winning trades decides", () => {
    // Both: 3 trades, net +$60, PF = 120/60 = 2. A has 2 wins, B has 1.
    const a = score([
      { pnl: 60, exitAt: 5 },
      { pnl: 60, exitAt: 15 },
      { pnl: -60, exitAt: 25 },
    ]);
    const b = score([
      { pnl: 120, exitAt: 5 },
      { pnl: -30, exitAt: 15 },
      { pnl: -30, exitAt: 25 },
    ]);
    expect(a.score).toBe(b.score);
    expect(a.tiebreakers.profitFactor).toBe(b.tiebreakers.profitFactor);
    const result = resolveBattleWinner(a, b);
    expect(result.outcome).toBe("A");
    expect(result.decidedBy).toBe("WINNING_TRADES");
  });

  it("tied through winning trades → having taken a trade decides", () => {
    // Zero the bonus so a lone scratch trade scores level with a no-show.
    const cfg = { pointsPerTrade: 0 };
    const a = calculatePnlBattleScore(input([{ pnl: 0, exitAt: 10 }]), cfg);
    const b = calculatePnlBattleScore(input([]), cfg);
    expect(a.score).toBe(b.score);
    const result = resolveBattleWinner(a, b);
    expect(result.outcome).toBe("A");
    expect(result.decidedBy).toBe("TOOK_TRADE");
  });

  it("tied through activity → earliest first-green decides", () => {
    // Mirror-image trades: same PnL, PF, wins, count — only the order differs.
    const a = score([
      { pnl: 100, exitAt: 5 }, // green at minute 5
      { pnl: -50, exitAt: 20 },
    ]);
    const b = score([
      { pnl: -50, exitAt: 5 },
      { pnl: 100, exitAt: 25 }, // green at minute 25
    ]);
    expect(a.score).toBe(b.score);
    expect(a.tiebreakers.winningTradeCount).toBe(
      b.tiebreakers.winningTradeCount,
    );
    const result = resolveBattleWinner(a, b);
    expect(result.outcome).toBe("A");
    expect(result.decidedBy).toBe("FIRST_GREEN");
  });

  it("green beats never-green when everything above ties", () => {
    const a = score([
      { pnl: 50, exitAt: 5 }, // green at 5, then back to flat
      { pnl: -50, exitAt: 20 },
    ]);
    const b = score([
      { pnl: -50, exitAt: 5 }, // never green
      { pnl: 50, exitAt: 20 },
    ]);
    const result = resolveBattleWinner(a, b);
    expect(result.outcome).toBe("A");
    expect(result.decidedBy).toBe("FIRST_GREEN");
  });

  it("both flat with zero trades is an explicit dead tie", () => {
    const result = resolveBattleWinner(score([]), score([]));
    expect(result.outcome).toBe("TIE");
    expect(result.decidedBy).toBe("DEAD_TIE");
    expect(result.detail.length).toBeGreaterThan(0);
  });

  it("identical trading is a dead tie, not an arbitrary winner", () => {
    const specs: TradeSpec[] = [
      { pnl: 75, exitAt: 5 },
      { pnl: -25, exitAt: 20 },
    ];
    const result = resolveBattleWinner(score(specs), score(specs));
    expect(result.outcome).toBe("TIE");
    expect(result.decidedBy).toBe("DEAD_TIE");
  });

  it("resolution is symmetric: swapping sides flips the outcome", () => {
    const a = score([{ pnl: -3, exitAt: 10 }]);
    const b = score([]);
    expect(resolveBattleWinner(a, b).outcome).toBe("A");
    expect(resolveBattleWinner(b, a).outcome).toBe("B");
  });

  it("every resolution carries a human-readable detail", () => {
    const pairs: Array<[PnlBattleScoreResult, PnlBattleScoreResult]> = [
      [score([{ pnl: 100, exitAt: 5 }]), score([])],
      [score([]), score([])],
    ];
    for (const [a, b] of pairs) {
      expect(resolveBattleWinner(a, b).detail.length).toBeGreaterThan(0);
    }
  });
});
