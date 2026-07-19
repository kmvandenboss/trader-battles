/**
 * positionLedger — position tracking, P&L, drawdown, and trade extraction.
 *
 * The account-state stage of the ingestion pipeline. Consumes normalized
 * FILL / PARTIAL_FILL events plus mark-to-market price updates and maintains
 * everything the scoring engine needs: realized + unrealized P&L, the equity
 * curve, peak equity, max drawdown, time in severe drawdown, contract peaks,
 * and completed round-trip trades.
 *
 * `toBattleMetrics()` emits the exact `BattleMetricsInput` contract that
 * `lib/scoring/calculateBattleScore` consumes — the ledger is the ONLY place
 * that shape is produced. It does not know (or care) whether fills came from
 * the mock provider or a future live integration.
 *
 * Pure functions — every mutation returns a new state object; state is fully
 * JSON-serializable so battle snapshots can be persisted/replayed.
 */

import type { Market } from "@/lib/data/schema";
import type { NormalizedExecutionEvent } from "@/lib/integrations/types";
import type {
  BattleMetricsInput,
  BattleRiskLimits,
  BattleTrade,
} from "@/lib/scoring/calculateBattleScore";

// ---------------------------------------------------------------------------
// Market specifications (futures contract economics)
// ---------------------------------------------------------------------------

export interface MarketSpec {
  /** Dollars per full point per contract. */
  pointValue: number;
  /** Minimum price increment. */
  tickSize: number;
}

export const MARKET_SPECS: Record<Market, MarketSpec> = {
  NQ: { pointValue: 20, tickSize: 0.25 },
  MNQ: { pointValue: 2, tickSize: 0.25 },
  ES: { pointValue: 50, tickSize: 0.25 },
  MES: { pointValue: 5, tickSize: 0.25 },
  CL: { pointValue: 1000, tickSize: 0.01 },
  GC: { pointValue: 100, tickSize: 0.1 },
};

// ---------------------------------------------------------------------------
// State shapes (all JSON-serializable)
// ---------------------------------------------------------------------------

/** An in-progress round trip (flat -> open -> ... -> flat). */
export interface OpenPositionState {
  side: "LONG" | "SHORT";
  /** Contracts currently open (> 0). */
  quantity: number;
  /** Volume-weighted average entry price of the open contracts. */
  avgEntryPrice: number;
  /** Largest contracts held at once during this round trip. */
  maxQuantity: number;
  /** Epoch ms of the opening fill. */
  entryTimeMs: number;
  /** Realized P&L accumulated by partial exits within this round trip. */
  realizedPnlSoFar: number;
  /** Entry-side commission still attributable to the open contracts. */
  openCommission: number;
  /** Exit volume so far (for the volume-weighted exit price). */
  exitQuantity: number;
  /** Sum of exitPrice * quantity for exits so far. */
  exitNotional: number;
}

export interface EquityPoint {
  timestampMs: number;
  price: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  /** Current distance below peak equity, >= 0. */
  drawdown: number;
  /** Signed open contracts at this moment. */
  position: number;
}

export interface LedgerState {
  market: Market;
  pointValue: number;
  /** Dollar drawdown beyond which time counts as "severe" (scoring input). */
  severeDrawdownThreshold: number;
  realizedPnl: number;
  unrealizedPnl: number;
  /** realized + unrealized. */
  equity: number;
  /** Running max of equity, floored at 0 (battle starts flat at 0). */
  peakEquity: number;
  /** Running min of equity, capped at 0. */
  lowestEquity: number;
  /** Max peak-to-trough drawdown observed, >= 0. */
  maxDrawdown: number;
  maxOpenContracts: number;
  timeInSevereDrawdownMs: number;
  lastPrice: number | null;
  lastTimestampMs: number | null;
  open: OpenPositionState | null;
  /** Completed round-trip trades, entry-time order (scoring contract shape). */
  trades: BattleTrade[];
  /** Equity curve for charts/snapshots (one point per mark or fill). */
  curve: EquityPoint[];
}

export interface CreateLedgerOptions {
  /** Defaults to Infinity (no severe-drawdown tracking) when omitted. */
  severeDrawdownThreshold?: number;
}

export function createLedger(
  market: Market,
  options: CreateLedgerOptions = {},
): LedgerState {
  return {
    market,
    pointValue: MARKET_SPECS[market].pointValue,
    severeDrawdownThreshold:
      options.severeDrawdownThreshold ?? Number.POSITIVE_INFINITY,
    realizedPnl: 0,
    unrealizedPnl: 0,
    equity: 0,
    peakEquity: 0,
    lowestEquity: 0,
    maxDrawdown: 0,
    maxOpenContracts: 0,
    timeInSevereDrawdownMs: 0,
    lastPrice: null,
    lastTimestampMs: null,
    open: null,
    trades: [],
    curve: [],
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const round2 = (value: number): number => Math.round(value * 100) / 100;

function signedPosition(open: OpenPositionState | null): number {
  if (!open) return 0;
  return open.side === "LONG" ? open.quantity : -open.quantity;
}

function unrealizedAt(
  open: OpenPositionState | null,
  price: number,
  pointValue: number,
): number {
  if (!open) return 0;
  const direction = open.side === "LONG" ? 1 : -1;
  return round2(
    direction * (price - open.avgEntryPrice) * open.quantity * pointValue,
  );
}

/**
 * Advance the severe-drawdown clock to `timestampMs`. The interval since the
 * last observation is classified by the drawdown that held at its START —
 * i.e. state as of the previous mark.
 */
function advanceClock(state: LedgerState, timestampMs: number): LedgerState {
  if (state.lastTimestampMs === null || timestampMs <= state.lastTimestampMs) {
    return { ...state, lastTimestampMs: timestampMs };
  }
  const drawdownAtStart = state.peakEquity - state.equity;
  const elapsed = timestampMs - state.lastTimestampMs;
  return {
    ...state,
    lastTimestampMs: timestampMs,
    timeInSevereDrawdownMs:
      drawdownAtStart > state.severeDrawdownThreshold
        ? state.timeInSevereDrawdownMs + elapsed
        : state.timeInSevereDrawdownMs,
  };
}

/** Recompute equity/peaks/drawdown at `price` and append a curve point. */
function revalue(
  state: LedgerState,
  price: number,
  timestampMs: number,
): LedgerState {
  const unrealizedPnl = unrealizedAt(state.open, price, state.pointValue);
  const equity = round2(state.realizedPnl + unrealizedPnl);
  const peakEquity = Math.max(state.peakEquity, equity, 0);
  const lowestEquity = Math.min(state.lowestEquity, equity, 0);
  const drawdown = round2(peakEquity - equity);
  const maxDrawdown = Math.max(state.maxDrawdown, drawdown);
  const point: EquityPoint = {
    timestampMs,
    price,
    equity,
    realizedPnl: state.realizedPnl,
    unrealizedPnl,
    drawdown,
    position: signedPosition(state.open),
  };
  return {
    ...state,
    unrealizedPnl,
    equity,
    peakEquity,
    lowestEquity,
    maxDrawdown,
    lastPrice: price,
    curve: [...state.curve, point],
  };
}

// ---------------------------------------------------------------------------
// Public transitions
// ---------------------------------------------------------------------------

/** Mark the open position to a new market price. */
export function markToMarket(
  state: LedgerState,
  price: number,
  timestampMs: number,
): LedgerState {
  return revalue(advanceClock(state, timestampMs), price, timestampMs);
}

/**
 * Apply one FILL / PARTIAL_FILL to the position. Handles opens, adds,
 * partial reductions, closes, and reversals (a reversal closes the old round
 * trip and opens a new one in the opposite direction with the remainder).
 */
export function applyFill(
  state: LedgerState,
  event: Pick<
    NormalizedExecutionEvent,
    "side" | "quantity" | "price" | "commission" | "occurredAt"
  >,
): LedgerState {
  const timestampMs = Date.parse(event.occurredAt);
  let next = advanceClock(state, timestampMs);
  const fillSide: "LONG" | "SHORT" = event.side === "BUY" ? "LONG" : "SHORT";
  let remaining = event.quantity;
  const commissionPerContract =
    event.quantity > 0 ? event.commission / event.quantity : 0;

  let open = next.open ? { ...next.open } : null;
  let realizedPnl = next.realizedPnl;
  const trades = [...next.trades];
  let maxOpenContracts = next.maxOpenContracts;

  while (remaining > 0) {
    if (open === null) {
      // Fresh round trip.
      open = {
        side: fillSide,
        quantity: remaining,
        avgEntryPrice: event.price,
        maxQuantity: remaining,
        entryTimeMs: timestampMs,
        realizedPnlSoFar: 0,
        openCommission: commissionPerContract * remaining,
        exitQuantity: 0,
        exitNotional: 0,
      };
      remaining = 0;
    } else if (open.side === fillSide) {
      // Add to the position: volume-weighted average entry.
      const newQuantity = open.quantity + remaining;
      open.avgEntryPrice =
        (open.avgEntryPrice * open.quantity + event.price * remaining) /
        newQuantity;
      open.openCommission += commissionPerContract * remaining;
      open.quantity = newQuantity;
      open.maxQuantity = Math.max(open.maxQuantity, newQuantity);
      remaining = 0;
    } else {
      // Reduce / close / reverse.
      const closeQty = Math.min(remaining, open.quantity);
      const direction = open.side === "LONG" ? 1 : -1;
      const grossPart =
        direction *
        (event.price - open.avgEntryPrice) *
        closeQty *
        next.pointValue;
      const entryCommissionShare =
        open.quantity > 0
          ? open.openCommission * (closeQty / open.quantity)
          : 0;
      const exitCommissionShare = commissionPerContract * closeQty;
      const netPart = round2(
        grossPart - entryCommissionShare - exitCommissionShare,
      );

      realizedPnl = round2(realizedPnl + netPart);
      open.realizedPnlSoFar = round2(open.realizedPnlSoFar + netPart);
      open.openCommission -= entryCommissionShare;
      open.quantity -= closeQty;
      open.exitQuantity += closeQty;
      open.exitNotional += event.price * closeQty;
      remaining -= closeQty;

      if (open.quantity === 0) {
        trades.push({
          side: open.side,
          size: open.maxQuantity,
          entryPrice: round2(open.avgEntryPrice * 10000) / 10000,
          exitPrice:
            open.exitQuantity > 0
              ? Math.round((open.exitNotional / open.exitQuantity) * 10000) /
                10000
              : event.price,
          realizedPnl: open.realizedPnlSoFar,
          entryTime: open.entryTimeMs,
          exitTime: timestampMs,
        });
        open = null;
        // Any remainder reverses into a new round trip on the next loop pass.
      }
    }
  }

  if (open) {
    maxOpenContracts = Math.max(maxOpenContracts, open.quantity);
  }

  next = {
    ...next,
    open,
    realizedPnl,
    trades,
    maxOpenContracts,
  };
  return revalue(next, event.price, timestampMs);
}

// ---------------------------------------------------------------------------
// Scoring contract
// ---------------------------------------------------------------------------

/**
 * Derive the scoring engine's `BattleMetricsInput` from ledger state.
 * Callable at ANY timestamp — mid-battle snapshots use the elapsed duration,
 * the final score uses the full battle duration.
 */
export function toBattleMetrics(
  state: LedgerState,
  limits: BattleRiskLimits,
  battleDurationMs: number,
): BattleMetricsInput {
  let grossProfit = 0;
  let grossLoss = 0;
  for (const trade of state.trades) {
    if (trade.realizedPnl >= 0) grossProfit += trade.realizedPnl;
    else grossLoss += Math.abs(trade.realizedPnl);
  }
  return {
    netPnl: state.equity,
    grossProfit: round2(grossProfit),
    grossLoss: round2(grossLoss),
    peakEquity: state.peakEquity,
    lowestEquity: state.lowestEquity,
    maxDrawdown: state.maxDrawdown,
    maxOpenContracts: state.maxOpenContracts,
    trades: state.trades,
    battleDurationMs,
    timeInSevereDrawdownMs: state.timeInSevereDrawdownMs,
    limits,
  };
}
