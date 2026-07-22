/**
 * reconstructBattleTelemetry — pure minute-by-minute replay of a settled v1
 * battle. Builds a small synthetic single-instrument (GC) battle with a couple
 * of round trips + one open-at-buzzer position and a hand-made 1-min bar
 * series, then asserts the telemetry is chronological, trade counts grow at
 * exits, the running score at the buzzer equals the authoritative PNL_V1
 * finalScore, and the 4-factor insight components are populated.
 */

import { describe, expect, it } from "vitest";

import type { MarketBar } from "@/lib/data/schema";
import {
  settleBattle,
  type SettlementParticipantInput,
} from "@/lib/battles/settleBattle";
import { reconstructBattleTelemetry } from "@/lib/battles/reconstructBattleTelemetry";
import type { BattleTrade } from "@/lib/scoring/calculateBattleScore";

const START = "2026-07-22T00:00:00.000Z";
const END = "2026-07-22T04:00:00.000Z";
const S = Date.parse(START);
const E = Date.parse(END);
const MIN = 60_000;
const BATTLE_ID = "battle-telemetry-test";

function trade(overrides: Partial<BattleTrade> = {}): BattleTrade {
  return {
    side: "LONG",
    size: 1,
    entryPrice: 2000,
    exitPrice: 2005,
    realizedPnl: 495,
    entryTime: S + 5 * MIN,
    exitTime: S + 10 * MIN,
    ...overrides,
  };
}

/** GC 1-minute OHLCV bars spanning [START, END] inclusive; deterministic
 * ramping close so open positions have an intra-window mark path. */
function buildGcBars(): MarketBar[] {
  const bars: MarketBar[] = [];
  const minutes = (E - S) / MIN;
  for (let i = 0; i <= minutes; i++) {
    const barStartMs = S + i * MIN;
    const close = 2005 + i * 0.1;
    bars.push({
      id: `gc-${i}`,
      instrument: "GC",
      barStart: new Date(barStartMs).toISOString(),
      open: close - 0.1,
      high: close + 0.2,
      low: close - 0.2,
      close,
      volume: 100,
      source: "csv",
      importedAt: START,
    });
  }
  return bars;
}

// KevinV: two counted round trips + one open-at-buzzer LONG.
const kevinCounted: BattleTrade[] = [
  trade({ side: "LONG", size: 1, entryPrice: 2000, exitPrice: 2005, realizedPnl: 495, entryTime: S + 30 * MIN, exitTime: S + 35 * MIN }),
  trade({ side: "SHORT", size: 1, entryPrice: 2010, exitPrice: 2008, realizedPnl: 196, entryTime: S + 60 * MIN, exitTime: S + 65 * MIN }),
];
const kevinOpenAtBuzzer = trade({
  side: "LONG",
  size: 1,
  entryPrice: 2006,
  exitPrice: 2020, // realized after the buzzer — ignored; marked out instead
  realizedPnl: 1400,
  entryTime: S + 120 * MIN,
  exitTime: E + 30 * MIN,
});

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

function settleFixture() {
  return settleBattle({
    battleId: BATTLE_ID,
    window: { startAt: START, endAt: END },
    accountBracket: "50K",
    participants: [
      participant({
        userId: "user-a",
        tradingAccountId: "acct-a",
        displayName: "KevinV",
        imports: [
          {
            instrument: "GC",
            trades: [...kevinCounted, kevinOpenAtBuzzer],
            openPosition: null,
          },
        ],
        markPrices: { GC: 2009 },
      }),
      participant({
        userId: "user-b",
        tradingAccountId: "acct-b",
        displayName: "DeltaHunter",
        imports: [
          {
            instrument: "GC",
            trades: [trade({ realizedPnl: 120, entryTime: S + 40 * MIN, exitTime: S + 45 * MIN })],
            openPosition: null,
          },
        ],
        markPrices: { GC: 2009 },
      }),
    ],
  });
}

function reconstructFixture() {
  const settlement = settleFixture();
  const bars = buildGcBars();
  const telemetry = reconstructBattleTelemetry({
    window: { startAt: START, endAt: END },
    accountBracket: "50K",
    barsByInstrument: { GC: bars },
    participants: [
      {
        userId: "user-a",
        participantId: `bp-${BATTLE_ID}-user-a`,
        tradingAccountId: "acct-a",
        countedTrades: settlement.participants[0].countedTrades,
        openAtBuzzerTrades: settlement.participants[0].openAtBuzzerTrades,
        openPositionAtClose: settlement.participants[0].openPositionAtClose,
        markPrices: { GC: 2009 },
      },
      {
        userId: "user-b",
        participantId: `bp-${BATTLE_ID}-user-b`,
        tradingAccountId: "acct-b",
        countedTrades: settlement.participants[1].countedTrades,
        openAtBuzzerTrades: settlement.participants[1].openAtBuzzerTrades,
        openPositionAtClose: settlement.participants[1].openPositionAtClose,
        markPrices: { GC: 2009 },
      },
    ],
  });
  return { settlement, telemetry };
}

describe("reconstructBattleTelemetry", () => {
  it("classifies the fixture as expected before reconstruction", () => {
    const settlement = settleFixture();
    const a = settlement.participants[0];
    expect(a.countedTrades).toHaveLength(2);
    expect(a.openAtBuzzerTrades).toHaveLength(1);
    expect(a.openPositionAtClose).toMatchObject({
      instrument: "GC",
      side: "LONG",
      size: 1,
      averageEntryPrice: 2006,
      markPrice: 2009,
    });
    // 691 realized + 300 mark-out + 10 bonus (2 counted trades) = 1001.
    expect(a.score.realizedPnl).toBe(691);
    expect(a.score.markOut.pnl).toBe(300);
    expect(a.score.participationBonus).toBe(10);
    expect(a.score.score).toBe(1001);
  });

  it("emits chronological account + metric snapshots (t0 → buzzer)", () => {
    const { telemetry } = reconstructFixture();
    const a = telemetry.participants[0];

    expect(a.accountSnapshots.length).toBeGreaterThan(2);
    // t0 is flat at the window open; the last account snapshot is the buzzer.
    expect(a.accountSnapshots[0].timestamp).toBe(START);
    expect(a.accountSnapshots[0].equity).toBe(0);
    expect(a.accountSnapshots.at(-1)?.timestamp).toBe(END);

    const acctTimes = a.accountSnapshots.map((s) => Date.parse(s.timestamp));
    for (let i = 1; i < acctTimes.length; i++) {
      expect(acctTimes[i]).toBeGreaterThan(acctTimes[i - 1]);
    }
    // Metric snapshots are NON-final only (the final is derived downstream).
    const metricTimes = a.metricSnapshots.map((m) => Date.parse(m.timestamp));
    for (let i = 1; i < metricTimes.length; i++) {
      expect(metricTimes[i]).toBeGreaterThan(metricTimes[i - 1]);
    }
    expect(metricTimes.at(-1)).toBeLessThan(E);
  });

  it("increments closed-trade count at each exit (0 → 1 → 2)", () => {
    const { telemetry } = reconstructFixture();
    const counts = telemetry.participants[0].metricSnapshots.map((m) => m.tradeCount);
    expect(counts[0]).toBe(0); // t0, nothing closed yet
    // Monotonically non-decreasing, reaching the two counted round trips.
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
    expect(Math.max(...counts)).toBe(2);
    // The open-at-buzzer position never closes in-window → still 2, not 3.
  });

  it("marks the open-at-buzzer position to its buzzer mark at the final point", () => {
    const { telemetry } = reconstructFixture();
    const buzzer = telemetry.participants[0].accountSnapshots.at(-1)!;
    expect(buzzer.openPosition).toBe(1); // LONG 1 GC still open
    expect(buzzer.unrealizedPnl).toBe(300); // (2009-2006) x 1 x $100
    expect(buzzer.realizedPnl).toBe(691);
    expect(buzzer.equity).toBe(991);
  });

  it("running score at the buzzer equals the authoritative PNL_V1 finalScore", () => {
    const { settlement, telemetry } = reconstructFixture();
    for (let i = 0; i < 2; i++) {
      expect(telemetry.participants[i].finalRunningScore).toBeCloseTo(
        settlement.participants[i].score.score,
        2,
      );
    }
    expect(telemetry.participants[0].finalRunningScore).toBe(1001);
  });

  it("running PNL_V1 progression tracks equity + capped bonus over time", () => {
    const { telemetry } = reconstructFixture();
    const snaps = telemetry.participants[0].metricSnapshots;
    // At t0 nothing has happened: score 0.
    expect(snaps[0].totalBattleScore).toBe(0);
    // After both round trips close, the running score carries realized + bonus.
    const last = snaps.at(-1)!;
    expect(last.tradeCount).toBe(2);
    // realized 691 + open marked to a bar close (>0 near the buzzer) + bonus 10.
    expect(last.totalBattleScore).toBeGreaterThan(691);
  });

  it("populates the 4-factor insight components for an active trader", () => {
    const { telemetry } = reconstructFixture();
    const c = telemetry.participants[0].finalComponents;
    expect(c.performanceScore).toBeGreaterThan(0);
    expect(c.disciplineScore).toBeGreaterThan(0);
    expect(c.riskEfficiencyScore).toBeGreaterThan(0);
    expect(c.consistencyScore).toBeGreaterThanOrEqual(0);
    // A profitable, in-limits trader keeps most of the discipline score.
    expect(c.disciplineScore).toBeGreaterThan(50);
    // Non-final metric snapshots also carry component scores.
    expect(
      telemetry.participants[0].metricSnapshots.some((m) => m.performanceScore > 0),
    ).toBe(true);
  });

  it("skips reconstruction (empty snapshots, zero components) when bars are missing", () => {
    const settlement = settleFixture();
    const telemetry = reconstructBattleTelemetry({
      window: { startAt: START, endAt: END },
      accountBracket: "50K",
      barsByInstrument: {}, // no bars imported for GC
      participants: [
        {
          userId: "user-a",
          participantId: `bp-${BATTLE_ID}-user-a`,
          tradingAccountId: "acct-a",
          countedTrades: settlement.participants[0].countedTrades,
          openAtBuzzerTrades: settlement.participants[0].openAtBuzzerTrades,
          openPositionAtClose: settlement.participants[0].openPositionAtClose,
          markPrices: { GC: 2009 },
        },
        {
          userId: "user-b",
          participantId: `bp-${BATTLE_ID}-user-b`,
          tradingAccountId: "acct-b",
          countedTrades: settlement.participants[1].countedTrades,
          openAtBuzzerTrades: settlement.participants[1].openAtBuzzerTrades,
          openPositionAtClose: settlement.participants[1].openPositionAtClose,
          markPrices: { GC: 2009 },
        },
      ],
    });
    const a = telemetry.participants[0];
    expect(a.accountSnapshots).toEqual([]);
    expect(a.metricSnapshots).toEqual([]);
    expect(a.finalComponents).toEqual({
      performanceScore: 0,
      riskEfficiencyScore: 0,
      disciplineScore: 0,
      consistencyScore: 0,
    });
    // The buzzer score is still computed so the equality invariant holds even
    // in the degraded (no-bars) path.
    expect(a.finalRunningScore).toBe(1001);
  });
});
