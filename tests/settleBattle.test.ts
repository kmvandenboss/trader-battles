/**
 * settleBattle — pure v1 settlement: window filtering, buzzer mark-out,
 * scoring via calculatePnlBattleScore/resolveBattleWinner, ratings via
 * calculateRatingChange + PNL_V1_RATING_CONFIG. All expectations are
 * hand-computed.
 */

import { describe, expect, it } from "vitest";

import {
  realizedDrawdown,
  settleBattle,
  type SettlementParticipantInput,
} from "@/lib/battles/settleBattle";
import type { BattleTrade } from "@/lib/scoring/calculateBattleScore";

const START = "2026-07-13T13:30:00.000Z";
const END = "2026-07-13T15:00:00.000Z";
const S = Date.parse(START);
const E = Date.parse(END);
const MIN = 60_000;

function trade(overrides: Partial<BattleTrade> = {}): BattleTrade {
  return {
    side: "LONG",
    size: 1,
    entryPrice: 29500,
    exitPrice: 29510,
    realizedPnl: 200,
    entryTime: S + 5 * MIN,
    exitTime: S + 10 * MIN,
    ...overrides,
  };
}

function participant(
  overrides: Partial<SettlementParticipantInput> = {},
): SettlementParticipantInput {
  return {
    userId: "user-a",
    tradingAccountId: "acct-a",
    rating: 1600,
    imports: [],
    markPrices: {},
    ...overrides,
  };
}

function settle(
  a: Partial<SettlementParticipantInput>,
  b: Partial<SettlementParticipantInput>,
) {
  return settleBattle({
    battleId: "battle-test",
    window: { startAt: START, endAt: END },
    accountBracket: "50K",
    participants: [
      participant({ userId: "user-a", tradingAccountId: "acct-a", ...a }),
      participant({ userId: "user-b", tradingAccountId: "acct-b", ...b }),
    ],
  });
}

describe("settleBattle window filtering", () => {
  it("counts trades entered at the open and exited at the buzzer (inclusive)", () => {
    const result = settle(
      {
        imports: [
          {
            instrument: "NQ",
            trades: [trade({ entryTime: S, exitTime: E })],
            openPosition: null,
          },
        ],
      },
      {},
    );
    const a = result.participants[0];
    expect(a.countedTrades).toHaveLength(1);
    expect(a.excludedTrades).toEqual([]);
    expect(a.score.score).toBe(205); // 200 + 5 participation bonus
  });

  it("excludes trades entered before the window ENTIRELY, even if they exit inside it", () => {
    const beforeWindow = trade({ entryTime: S - 1, exitTime: S + 20 * MIN, realizedPnl: 5000 });
    const result = settle(
      {
        imports: [
          { instrument: "NQ", trades: [beforeWindow, trade()], openPosition: null },
        ],
      },
      {},
    );
    const a = result.participants[0];
    expect(a.countedTrades).toHaveLength(1);
    expect(a.excludedTrades).toEqual([
      { instrument: "NQ", trade: beforeWindow, reason: "ENTERED_BEFORE_WINDOW" },
    ]);
    // The $5,000 pre-window trade must not touch the score (green-day exploit).
    expect(a.score.realizedPnl).toBe(200);
    expect(result.report.join("\n")).toContain("entered before the window opened");
  });

  it("excludes trades entered at/after the buzzer", () => {
    const afterWindow = trade({ entryTime: E, exitTime: E + 5 * MIN });
    const result = settle(
      { imports: [{ instrument: "NQ", trades: [afterWindow], openPosition: null }] },
      {},
    );
    expect(result.participants[0].excludedTrades[0].reason).toBe("ENTERED_AFTER_WINDOW");
    expect(result.participants[0].score.score).toBe(0);
  });

  it("treats in-window entries that exit after the buzzer as open at close and marks them out", () => {
    // LONG 2 @ 29600, marked at 29650: (29650-29600) x 2 x $20 = +$2,000.
    const openAtBuzzer = trade({
      entryTime: S + 30 * MIN,
      exitTime: E + 30 * MIN,
      size: 2,
      entryPrice: 29600,
      realizedPnl: 999, // realized later, outside the window — must be ignored
    });
    const result = settle(
      {
        imports: [{ instrument: "NQ", trades: [openAtBuzzer], openPosition: null }],
        markPrices: { NQ: 29650 },
      },
      {},
    );
    const a = result.participants[0];
    expect(a.countedTrades).toEqual([]);
    expect(a.openAtBuzzerTrades).toHaveLength(1);
    expect(a.openPositionAtClose).toMatchObject({
      instrument: "NQ",
      side: "LONG",
      size: 2,
      averageEntryPrice: 29600,
      pointValue: 20,
      markPrice: 29650,
    });
    expect(a.score.markOut.status).toBe("MARKED");
    expect(a.score.markOut.pnl).toBe(2000);
    expect(a.score.score).toBe(2000); // no closed trades → no bonus
  });

  it("marks out a still-open import row entered in-window", () => {
    const result = settle(
      {
        imports: [
          {
            instrument: "NQ",
            trades: [],
            openPosition: {
              side: "SHORT",
              quantity: 1,
              avgEntryPrice: 29700,
              entryTimeMs: S + 45 * MIN,
            },
          },
        ],
        markPrices: { NQ: 29650 },
      },
      {},
    );
    // SHORT 1 from 29700 marked at 29650: +50 pts... (29700-29650) x 1 x $20 = +$1,000.
    expect(result.participants[0].score.markOut.pnl).toBe(1000);
  });

  it("excludes an open position entered before the window, with a note", () => {
    const result = settle(
      {
        imports: [
          {
            instrument: "NQ",
            trades: [],
            openPosition: {
              side: "LONG",
              quantity: 3,
              avgEntryPrice: 29000,
              entryTimeMs: S - 60 * MIN,
            },
          },
        ],
        markPrices: { NQ: 29650 },
      },
      {},
    );
    const a = result.participants[0];
    expect(a.openPositionAtClose).toBeNull();
    expect(a.score.markOut.status).toBe("NONE");
    expect(a.exposureNotes[0]).toContain("before the window opened");
  });

  it("emits EXCLUDED_NO_MARK when no mark price is available (the honest path)", () => {
    const result = settle(
      {
        imports: [
          {
            instrument: "NQ",
            trades: [trade()],
            openPosition: {
              side: "LONG",
              quantity: 1,
              avgEntryPrice: 29600,
              entryTimeMs: S + 45 * MIN,
            },
          },
        ],
        markPrices: {}, // no bars imported
      },
      {},
    );
    const a = result.participants[0];
    expect(a.score.markOut.status).toBe("EXCLUDED_NO_MARK");
    expect(a.score.markOut.pnl).toBe(0);
    expect(a.score.score).toBe(205); // realized + bonus only
    expect(result.settlementInput.participants[0].markOutStatus).toBe("EXCLUDED_NO_MARK");
    expect(result.settlementInput.participants[0].markOutNote).toContain("no mark price");
  });

  it("aggregates same-instrument same-side exposure and marks out only the largest bucket otherwise", () => {
    const result = settle(
      {
        imports: [
          {
            instrument: "NQ",
            trades: [
              trade({ entryTime: S + 10 * MIN, exitTime: E + MIN, size: 1, entryPrice: 29600 }),
              trade({ entryTime: S + 20 * MIN, exitTime: E + MIN, size: 1, entryPrice: 29700 }),
            ],
            openPosition: null,
          },
          {
            instrument: "ES",
            trades: [],
            openPosition: {
              side: "SHORT",
              quantity: 1,
              avgEntryPrice: 6400,
              entryTimeMs: S + 30 * MIN,
            },
          },
        ],
        markPrices: { NQ: 29650, ES: 6390 },
      },
      {},
    );
    const a = result.participants[0];
    // NQ LONG bucket (2 lots, weighted entry 29650) wins over ES SHORT (1 lot).
    expect(a.openPositionAtClose).toMatchObject({
      instrument: "NQ",
      side: "LONG",
      size: 2,
      averageEntryPrice: 29650,
    });
    expect(a.score.markOut.pnl).toBe(0); // marked at its own weighted entry
    expect(a.exposureNotes.some((n) => n.includes("ES"))).toBe(true);
    expect(a.exposureNotes.some((n) => n.includes("largest single-instrument"))).toBe(true);
  });
});

describe("settleBattle scoring, winner, and ratings (hand-computed)", () => {
  const kevinTrades = [
    trade({ entryTime: S + MIN, exitTime: S + 6 * MIN, realizedPnl: 345.64, side: "SHORT", size: 2 }),
    trade({ entryTime: S + 10 * MIN, exitTime: S + 12 * MIN, realizedPnl: 1200.64, side: "SHORT", size: 2 }),
    trade({ entryTime: S + 19 * MIN, exitTime: S + 21 * MIN, realizedPnl: 520.32, side: "SHORT", size: 1 }),
  ];

  it("settles a decisive two-sided battle: scores, winner, ratings", () => {
    const result = settle(
      {
        rating: 1684,
        displayName: "KevinV",
        imports: [{ instrument: "NQ", trades: kevinTrades, openPosition: null }],
      },
      {
        rating: 1712,
        displayName: "DeltaHunter",
        imports: [
          {
            instrument: "NQ",
            trades: [trade({ realizedPnl: 195.32 })],
            openPosition: {
              side: "LONG",
              quantity: 1,
              avgEntryPrice: 29600,
              entryTimeMs: S + 60 * MIN,
            },
          },
        ],
        markPrices: { NQ: 29650 },
      },
    );

    const [a, b] = result.participants;
    // A: 2066.60 realized + 15 bonus = 2081.60.
    expect(a.score.realizedPnl).toBe(2066.6);
    expect(a.score.participationBonus).toBe(15);
    expect(a.score.score).toBe(2081.6);
    // B: 195.32 realized + 5 bonus + 1000 mark-out = 1200.32.
    expect(b.score.score).toBe(1200.32);

    expect(result.winnerId).toBe("user-a");
    expect(result.resolution.decidedBy).toBe("SCORE");
    expect(a.result).toBe("WIN");
    expect(b.result).toBe("LOSS");

    // Ratings, PNL_V1_RATING_CONFIG (K=32, divisor 400, marginRef $500):
    // gap 881.28 >= 500 → margin multiplier saturates at 1.5 (K x 1.5 = 48).
    // E_a = 1/(1+10^((1712-1684)/400)) = 0.45979...
    // A: 48 x (1 - 0.45979) = +25.93 → +26 → 1710.
    // B: 48 x (0 - 0.54021) = -25.93 → -26 → 1686.
    expect(a.rating.change).toBe(26);
    expect(a.rating.newRating).toBe(1710);
    expect(b.rating.change).toBe(-26);
    expect(b.rating.newRating).toBe(1686);

    // Persistence-ready settlement input (gross pair, never a profit factor).
    const rowA = result.settlementInput.participants[0];
    expect(rowA).toMatchObject({
      userId: "user-a",
      tradingAccountId: "acct-a",
      endingRating: 1710,
      finalScore: 2081.6,
      result: "WIN",
      realizedPnl: 2066.6,
      participationBonus: 15,
      closedTradeCount: 3,
      grossProfit: 2066.6,
      grossLoss: 0,
      markOutPnl: 0,
      markOutStatus: "NONE",
      maximumDrawdown: 0,
    });
    expect(result.settlementInput.winnerId).toBe("user-a");
    expect(result.settlementInput.verificationStatus).toBe("SELF_REPORTED");
    expect(result.settlementInput.endTime).toBe(END);
    expect(Object.keys(rowA)).not.toContain("profitFactor");

    // The PERSISTED detail names the traders, winner first — never the
    // scoring engine's positional "A"/"B" labels.
    expect(result.resolutionDetail).toBe(
      "KevinV wins on score: 2081.6 vs 1200.32 points.",
    );
    expect(result.settlementInput.resolutionDetail).toBe(result.resolutionDetail);
    expect(result.settlementInput.resolutionDetail).not.toMatch(/\b[AB] wins/);
    // Report lines carry display names too.
    expect(result.report.join("\n")).toContain("KevinV: rating +26");
  });

  it("names the winner first in the detail even when side B wins", () => {
    const result = settle(
      { displayName: "KevinV" },
      {
        displayName: "DeltaHunter",
        imports: [{ instrument: "NQ", trades: [trade({ realizedPnl: 495 })], openPosition: null }],
      },
    );
    expect(result.winnerId).toBe("user-b");
    expect(result.resolutionDetail).toBe(
      "DeltaHunter wins on score: 500 vs 0 points.",
    );
    expect(result.settlementInput.resolutionDetail).not.toMatch(/\b[AB] wins/);
  });

  it("does not saturate the margin multiplier on a modest gap", () => {
    // 1600 vs 1600, scores 250 vs 0: margin 250/500 = 0.5 → multiplier
    // 0.75 + 0.75 x 0.5 = 1.125. Winner: 32 x 1.125 x (1 - 0.5) = +18.
    const result = settle(
      { imports: [{ instrument: "NQ", trades: [trade({ realizedPnl: 245 })], openPosition: null }] },
      {},
    );
    expect(result.participants[0].score.score).toBe(250);
    expect(result.participants[0].rating.change).toBe(18);
    expect(result.participants[1].rating.change).toBe(-18);
  });

  it("settles a dead tie as a draw with null winner and zero movement at equal ratings", () => {
    const result = settle({}, {});
    expect(result.winnerId).toBeNull();
    expect(result.resolution.outcome).toBe("TIE");
    expect(result.resolution.decidedBy).toBe("DEAD_TIE");
    expect(result.participants[0].result).toBe("DRAW");
    expect(result.participants[1].result).toBe("DRAW");
    expect(result.participants[0].rating.change).toBe(0);
    expect(result.settlementInput.winnerId).toBeNull();
    // The dead-tie sentence carries no positional labels — safe verbatim.
    expect(result.resolutionDetail).toBe(
      "Every tiebreaker tier compared equal — the battle is a draw.",
    );
    expect(result.settlementInput.resolutionDetail).toBe(result.resolutionDetail);
  });

  it("resolves equal scores through the tiebreaker cascade (activity beats a no-show)", () => {
    // A: one -$5 trade + 5 bonus = 0. B: flat 0. Scores tie; A wins the
    // cascade (realized PnL tier: -5 vs 0 → B ahead? No: cascade compares
    // realized+markout: A -5, B 0 → B wins REALIZED_PNL).
    const result = settle(
      { imports: [{ instrument: "NQ", trades: [trade({ realizedPnl: -5 })], openPosition: null }] },
      {},
    );
    expect(result.participants[0].score.score).toBe(0);
    expect(result.participants[1].score.score).toBe(0);
    expect(result.resolution.decidedBy).toBe("REALIZED_PNL");
    expect(result.winnerId).toBe("user-b");
    // No displayName supplied → the detail falls back to userIds (winner
    // first), never positional labels.
    expect(result.resolutionDetail).toBe(
      "Scores tied; user-b wins on realized PnL: $0.00 vs -$5.00.",
    );
    expect(result.settlementInput.resolutionDetail).not.toMatch(/\b[AB] wins/);
  });

  it("computes realized drawdown at trade-close granularity", () => {
    const trades = [
      trade({ exitTime: S + 10 * MIN, realizedPnl: 100 }),
      trade({ exitTime: S + 20 * MIN, realizedPnl: -250 }),
      trade({ exitTime: S + 30 * MIN, realizedPnl: 50 }),
    ];
    // Cumulative: 100, -150, -100. Peak 100 → max drawdown 250.
    expect(realizedDrawdown(trades)).toBe(250);

    const result = settle(
      { imports: [{ instrument: "NQ", trades, openPosition: null }] },
      {},
    );
    expect(result.participants[0].maximumDrawdown).toBe(250);
    expect(result.participants[0].grossProfit).toBe(150);
    expect(result.participants[0].grossLoss).toBe(250);
  });

  it("produces a human-readable report covering the resolution", () => {
    const result = settle(
      { imports: [{ instrument: "NQ", trades: [trade()], openPosition: null }] },
      {},
    );
    const report = result.report.join("\n");
    expect(report).toContain("Battle window");
    expect(report).toContain("Decided by SCORE");
    expect(report).toContain("user-a");
    expect(report).toContain("rating");
  });
});
