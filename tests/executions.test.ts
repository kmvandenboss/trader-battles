/**
 * Execution pipeline unit tests: normalization/validation, deduplication,
 * position ledger math (round trips, partials, averages, drawdown, unrealized
 * P&L, severe-drawdown time), and the processExecutionEvent entrypoint.
 */

import { describe, expect, it } from "vitest";

import {
  normalizeExecution,
  resolveInstrument,
} from "@/lib/executions/normalizeExecution";
import {
  createDedupeState,
  deduplicateExecution,
} from "@/lib/executions/deduplicateExecution";
import {
  applyFill,
  createLedger,
  markToMarket,
  toBattleMetrics,
  MARKET_SPECS,
  type LedgerState,
} from "@/lib/executions/positionLedger";
import {
  createPipelineState,
  markPipelineToMarket,
  processExecutionEvent,
} from "@/lib/executions/processExecutionEvent";
import type { RawExecutionRecord } from "@/lib/integrations/types";

const T0 = Date.parse("2026-07-17T15:00:00.000Z");

function iso(offsetMinutes: number): string {
  return new Date(T0 + offsetMinutes * 60_000).toISOString();
}

function rawFill(overrides: Partial<RawExecutionRecord> = {}): RawExecutionRecord {
  return {
    providerEventId: overrides.providerEventId ?? "evt-1",
    sourceProvider: "mock",
    accountId: "SIM-50K-84127",
    instrument: "NQU6",
    side: "BUY",
    quantity: 1,
    price: 24600,
    commission: 2.14,
    occurredAt: iso(0),
    eventType: "FILL",
    verificationStatus: "SIMULATED",
    ...overrides,
  };
}

interface FillInput {
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  commission?: number;
  minute: number;
}

function fill(ledger: LedgerState, input: FillInput): LedgerState {
  return applyFill(ledger, {
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    commission: input.commission ?? 0,
    occurredAt: iso(input.minute),
  });
}

// ---------------------------------------------------------------------------
// normalizeExecution
// ---------------------------------------------------------------------------

describe("normalizeExecution", () => {
  it("normalizes a valid mock fill (contract symbol -> market)", () => {
    const result = normalizeExecution(rawFill());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.instrument).toBe("NQ");
    expect(result.event.side).toBe("BUY");
    expect(result.event.sourceProvider).toBe("mock");
    expect(result.event.verificationStatus).toBe("SIMULATED");
    expect(result.event.receivedAt).toBe(result.event.occurredAt);
  });

  it("defaults mock events to SIMULATED verification", () => {
    const result = normalizeExecution(
      rawFill({ verificationStatus: undefined }),
    );
    expect(result.ok && result.event.verificationStatus === "SIMULATED").toBe(
      true,
    );
  });

  it("resolves dated contract symbols to the right market", () => {
    expect(resolveInstrument("NQU6")).toBe("NQ");
    expect(resolveInstrument("MNQU6")).toBe("MNQ");
    expect(resolveInstrument("MESZ26")).toBe("MES");
    expect(resolveInstrument("ES")).toBe("ES");
    expect(resolveInstrument("GCQ6")).toBe("GC");
    expect(resolveInstrument("BTC")).toBeNull();
  });

  it.each([
    ["not an object", "nope" as unknown],
    ["missing providerEventId", rawFill({ providerEventId: "" })],
    ["unknown provider", rawFill({ sourceProvider: "etrade" })],
    ["unsupported instrument", rawFill({ instrument: "YM" })],
    ["invalid side", rawFill({ side: "HOLD" })],
    ["zero quantity", rawFill({ quantity: 0 })],
    ["fractional quantity", rawFill({ quantity: 1.5 })],
    ["negative price", rawFill({ price: -5 })],
    ["negative commission", rawFill({ commission: -1 })],
    ["bad timestamp", rawFill({ occurredAt: "yesterday" })],
    ["unknown event type", rawFill({ eventType: "TELEPORT" })],
    ["bad verification status", rawFill({ verificationStatus: "TRUST_ME" })],
  ])("rejects malformed events: %s", (_label, raw) => {
    const result = normalizeExecution(raw);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// deduplicateExecution
// ---------------------------------------------------------------------------

describe("deduplicateExecution", () => {
  it("applies an event once and flags re-deliveries", () => {
    const normalized = normalizeExecution(rawFill());
    if (!normalized.ok) throw new Error("fixture should normalize");
    let state = createDedupeState();
    const first = deduplicateExecution(state, normalized.event);
    expect(first.duplicate).toBe(false);
    state = first.state;
    const second = deduplicateExecution(state, normalized.event);
    expect(second.duplicate).toBe(true);
  });

  it("treats the same event id from different providers as distinct", () => {
    const a = normalizeExecution(rawFill({ providerEventId: "shared" }));
    const b = normalizeExecution(
      rawFill({ providerEventId: "shared", sourceProvider: "tradovate" }),
    );
    if (!a.ok || !b.ok) throw new Error("fixtures should normalize");
    const first = deduplicateExecution(createDedupeState(), a.event);
    const second = deduplicateExecution(first.state, b.event);
    expect(second.duplicate).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// positionLedger
// ---------------------------------------------------------------------------

describe("positionLedger", () => {
  it("has correct futures contract specs", () => {
    expect(MARKET_SPECS.NQ).toEqual({ pointValue: 20, tickSize: 0.25 });
    expect(MARKET_SPECS.ES.pointValue).toBe(50);
    expect(MARKET_SPECS.MNQ.pointValue).toBe(2);
  });

  it("books a long round trip net of commissions", () => {
    let ledger = createLedger("NQ");
    ledger = fill(ledger, { side: "BUY", quantity: 2, price: 24600, commission: 4.28, minute: 0 });
    ledger = fill(ledger, { side: "SELL", quantity: 2, price: 24610, commission: 4.28, minute: 10 });
    // 10 points * 2 contracts * $20 = $400 gross, minus $8.56 commissions.
    expect(ledger.realizedPnl).toBeCloseTo(391.44, 2);
    expect(ledger.open).toBeNull();
    expect(ledger.trades).toHaveLength(1);
    const trade = ledger.trades[0];
    expect(trade.side).toBe("LONG");
    expect(trade.size).toBe(2);
    expect(trade.entryPrice).toBe(24600);
    expect(trade.exitPrice).toBe(24610);
    expect(trade.realizedPnl).toBeCloseTo(391.44, 2);
    expect(trade.entryTime).toBe(T0);
    expect(trade.exitTime).toBe(T0 + 10 * 60_000);
  });

  it("books a short round trip", () => {
    let ledger = createLedger("NQ");
    ledger = fill(ledger, { side: "SELL", quantity: 1, price: 24610, commission: 2.14, minute: 0 });
    ledger = fill(ledger, { side: "BUY", quantity: 1, price: 24600, commission: 2.14, minute: 5 });
    expect(ledger.realizedPnl).toBeCloseTo(195.72, 2); // 200 - 4.28
    expect(ledger.trades[0].side).toBe("SHORT");
  });

  it("volume-weights the average entry when scaling in", () => {
    let ledger = createLedger("NQ");
    ledger = fill(ledger, { side: "BUY", quantity: 1, price: 24600, minute: 0 });
    ledger = fill(ledger, { side: "BUY", quantity: 1, price: 24610, minute: 2 });
    expect(ledger.open?.avgEntryPrice).toBeCloseTo(24605, 4);
    expect(ledger.maxOpenContracts).toBe(2);
  });

  it("handles partial exits and reports one merged round trip", () => {
    let ledger = createLedger("NQ");
    ledger = fill(ledger, { side: "BUY", quantity: 2, price: 24600, commission: 4.28, minute: 0 });
    ledger = fill(ledger, { side: "SELL", quantity: 1, price: 24620, commission: 2.14, minute: 5 });
    // Partial: 20 pts * $20 = $400 gross - $2.14 entry share - $2.14 exit.
    expect(ledger.realizedPnl).toBeCloseTo(395.72, 2);
    expect(ledger.open?.quantity).toBe(1);
    expect(ledger.trades).toHaveLength(0); // round trip not finished yet
    ledger = fill(ledger, { side: "SELL", quantity: 1, price: 24630, commission: 2.14, minute: 9 });
    expect(ledger.open).toBeNull();
    expect(ledger.trades).toHaveLength(1);
    const trade = ledger.trades[0];
    expect(trade.size).toBe(2);
    expect(trade.exitPrice).toBeCloseTo(24625, 4); // volume-weighted exit
    // Total: (20 + 30 pts) * $20 - $8.56 commissions.
    expect(trade.realizedPnl).toBeCloseTo(991.44, 2);
  });

  it("splits a reversal into a closed trade plus a new opposite position", () => {
    let ledger = createLedger("NQ");
    ledger = fill(ledger, { side: "BUY", quantity: 1, price: 24600, minute: 0 });
    ledger = fill(ledger, { side: "SELL", quantity: 2, price: 24610, minute: 5 });
    expect(ledger.trades).toHaveLength(1);
    expect(ledger.trades[0].realizedPnl).toBeCloseTo(200, 2);
    expect(ledger.open?.side).toBe("SHORT");
    expect(ledger.open?.quantity).toBe(1);
    expect(ledger.open?.avgEntryPrice).toBe(24610);
  });

  it("tracks unrealized P&L, equity, peak and max drawdown along a price path", () => {
    let ledger = createLedger("NQ");
    ledger = fill(ledger, { side: "BUY", quantity: 1, price: 24600, minute: 0 });
    ledger = markToMarket(ledger, 24610, T0 + 60_000);
    expect(ledger.unrealizedPnl).toBeCloseTo(200, 2);
    expect(ledger.equity).toBeCloseTo(200, 2);
    expect(ledger.peakEquity).toBeCloseTo(200, 2);
    ledger = markToMarket(ledger, 24590, T0 + 120_000);
    expect(ledger.unrealizedPnl).toBeCloseTo(-200, 2);
    expect(ledger.lowestEquity).toBeCloseTo(-200, 2);
    expect(ledger.maxDrawdown).toBeCloseTo(400, 2); // peak +200 -> -200
    ledger = markToMarket(ledger, 24605, T0 + 180_000);
    expect(ledger.maxDrawdown).toBeCloseTo(400, 2); // high-water mark holds
    expect(ledger.curve).toHaveLength(4); // fill + 3 marks
  });

  it("accumulates time in severe drawdown by interval start state", () => {
    let ledger = createLedger("NQ", { severeDrawdownThreshold: 500 });
    ledger = fill(ledger, { side: "BUY", quantity: 1, price: 24600, minute: 0 });
    ledger = markToMarket(ledger, 24600, T0 + 60_000); // dd 0
    ledger = markToMarket(ledger, 24560, T0 + 120_000); // dd 800 from here
    expect(ledger.timeInSevereDrawdownMs).toBe(0); // interval started at dd 0
    ledger = markToMarket(ledger, 24560, T0 + 180_000);
    expect(ledger.timeInSevereDrawdownMs).toBe(60_000);
    ledger = markToMarket(ledger, 24600, T0 + 240_000); // recovers
    expect(ledger.timeInSevereDrawdownMs).toBe(120_000);
    ledger = markToMarket(ledger, 24600, T0 + 300_000);
    expect(ledger.timeInSevereDrawdownMs).toBe(120_000);
  });

  it("derives the scoring engine's BattleMetricsInput shape", () => {
    let ledger = createLedger("NQ", { severeDrawdownThreshold: 625 });
    ledger = fill(ledger, { side: "BUY", quantity: 1, price: 24600, minute: 0 });
    ledger = fill(ledger, { side: "SELL", quantity: 1, price: 24610, minute: 5 });
    ledger = fill(ledger, { side: "SELL", quantity: 1, price: 24620, minute: 10 });
    ledger = fill(ledger, { side: "BUY", quantity: 1, price: 24630, minute: 15 });
    const limits = { permittedRisk: 1250, dailyLossLimit: 1250, maxContracts: 5 };
    const metrics = toBattleMetrics(ledger, limits, 60 * 60_000);
    expect(metrics.grossProfit).toBeCloseTo(200, 2);
    expect(metrics.grossLoss).toBeCloseTo(200, 2);
    expect(metrics.netPnl).toBeCloseTo(0, 2);
    expect(metrics.trades).toHaveLength(2);
    expect(metrics.maxOpenContracts).toBe(1);
    expect(metrics.battleDurationMs).toBe(3_600_000);
    expect(metrics.limits).toEqual(limits);
  });
});

// ---------------------------------------------------------------------------
// processExecutionEvent (pipeline entrypoint)
// ---------------------------------------------------------------------------

describe("processExecutionEvent", () => {
  it("applies a valid fill through normalize -> dedupe -> ledger", () => {
    const state = createPipelineState("NQ");
    const result = processExecutionEvent(state, rawFill());
    expect(result.outcome).toBe("APPLIED");
    expect(result.state.acceptedCount).toBe(1);
    expect(result.state.ledger.open?.quantity).toBe(1);
    expect(result.state.events).toHaveLength(1);
  });

  it("rejects malformed events without touching the ledger", () => {
    const state = createPipelineState("NQ");
    const result = processExecutionEvent(state, { garbage: true });
    expect(result.outcome).toBe("REJECTED");
    expect(result.errors?.length).toBeGreaterThan(0);
    expect(result.state.rejectedCount).toBe(1);
    expect(result.state.ledger.curve).toHaveLength(0);
    expect(result.state.events).toHaveLength(0);
  });

  it("rejects fills for a different market than the battle's", () => {
    const state = createPipelineState("NQ");
    const result = processExecutionEvent(state, rawFill({ instrument: "ESU6" }));
    expect(result.outcome).toBe("REJECTED");
    expect(result.errors?.[0]).toContain("does not match");
  });

  it("drops duplicate deliveries after applying the first", () => {
    let state = createPipelineState("NQ");
    const first = processExecutionEvent(state, rawFill());
    state = first.state;
    const second = processExecutionEvent(state, rawFill());
    expect(second.outcome).toBe("DUPLICATE");
    expect(second.state.duplicateCount).toBe(1);
    expect(second.state.ledger.open?.quantity).toBe(1); // applied exactly once
  });

  it("records non-fill events without changing the position", () => {
    const state = createPipelineState("NQ");
    const result = processExecutionEvent(
      state,
      rawFill({ eventType: "ORDER_SUBMITTED", commission: 0 }),
    );
    expect(result.outcome).toBe("RECORDED");
    expect(result.state.ledger.open).toBeNull();
    expect(result.state.acceptedCount).toBe(1);
  });

  it("marks the pipeline ledger to market", () => {
    let state = createPipelineState("NQ");
    state = processExecutionEvent(state, rawFill()).state;
    state = markPipelineToMarket(state, 24610, T0 + 60_000);
    // Unrealized +$200; entry commission is booked when the trade closes.
    expect(state.ledger.equity).toBeCloseTo(200, 2);
  });
});
