/**
 * reconstructBattleTelemetry — pure minute-by-minute replay of a settled v1
 * battle, for the RICH REPORT + REPLAY (see the telemetry contract).
 *
 * v1 battles settle on PNL_V1 (straight realized PnL + capped bonus). That
 * OUTCOME is decided by `settleBattle` and is NOT touched here. This module
 * only RECONSTRUCTS the intra-window telemetry the demo review already renders
 * — an account/equity timeline, a running score progression, and the retained
 * 4-factor component scores — for INSIGHT ONLY (clearly labeled as not
 * affecting the result). It replays the same window activity settlement
 * classified through `lib/executions/positionLedger` and calls
 * `lib/scoring/calculateBattleScore` for the 4-factor numbers. It never
 * reinvents scoring.
 *
 * Pure: no I/O, no Date.now, no Math.random. Bars + classified activity are
 * handed in by the caller (settlementService).
 *
 * --- Invariants this module guarantees -----------------------------------
 * 1. LEDGER-REALIZED == SETTLEMENT-REALIZED. Each counted round trip is
 *    replayed as an entry fill (commission 0) + an exit fill carrying an
 *    IMPLIED commission = gross − realizedPnl, so the ledger's net for that
 *    round trip reproduces the trade's realizedPnl EXACTLY (commission is not
 *    separately known on a `BattleTrade`; this reconciliation keeps the sum
 *    identical to settlement rather than guessing a per-contract rate).
 * 2. BUZZER EQUALITY. The running PNL_V1 score at the buzzer equals the
 *    persisted finalScore: finalRunningScore = (Σ ledger realized) +
 *    markOut(openPositionAtClose at its buzzer mark) + participationBonus,
 *    which is exactly realized + markOut.pnl + bonus from
 *    `calculatePnlBattleScore`. Realized matches by invariant 1; the mark-out
 *    is computed with the SAME formula and the SAME mark price settlement
 *    used; the bonus uses the same closed-trade count and config.
 *
 * Per-instrument positions are sequential (flat → open → flat) because that
 * is how round-trip reconstruction defines a trade: one net position per
 * instrument at a time. So counted round trips never overlap the open-at-close
 * exposure on the same instrument, and feeding them into one ledger cannot
 * cross-contaminate realized P&L.
 */

import type { Market, MarketBar } from "@/lib/data/schema";
import type {
  AccountSnapshotInput,
  MetricSnapshotInput,
} from "@/lib/data/repositories/types";
import {
  applyFill,
  createLedger,
  markToMarket,
  toBattleMetrics,
  MARKET_SPECS,
  type LedgerState,
} from "@/lib/executions/positionLedger";
import {
  calculateBattleScore,
  type BattleMetricsInput,
  type BattleRiskLimits,
  type BattleTrade,
} from "@/lib/scoring/calculateBattleScore";
import {
  resolvePnlScoringConfig,
  type PnlScoringConfig,
} from "@/lib/scoring/config";
import type { OpenPositionAtClose } from "@/lib/scoring/calculatePnlBattleScore";
import { riskLimitsForBracket, severeDrawdownThresholdFor } from "./battleRules";

// ---------------------------------------------------------------------------
// Input / output shapes
// ---------------------------------------------------------------------------

export interface ReconstructParticipantInput {
  userId: string;
  /** Deterministic battle_participants id: `bp-<battleId>-<userId>`. */
  participantId: string;
  tradingAccountId: string;
  /** Round trips that entered AND exited inside the window (settlement's
   * countedTrades). Instrument tag is not carried on a `BattleTrade`; on a
   * single-instrument battle (the v1 norm) they all belong to that one
   * instrument — see `countedInstrument` resolution below. */
  countedTrades: BattleTrade[];
  /** Entered in-window, exited after the buzzer — open exposure at close. */
  openAtBuzzerTrades: { instrument: Market; trade: BattleTrade }[];
  /** The single aggregated position settlement marks out at the buzzer, or
   * null when flat. Its mark price is REUSED for the final point so the
   * running score equals the persisted finalScore. */
  openPositionAtClose: (OpenPositionAtClose & { instrument: Market }) | null;
  /** Buzzer marks settlement used, per instrument (for the final point). */
  markPrices: Partial<Record<Market, number>>;
}

export interface ReconstructBattleTelemetryInput {
  window: { startAt: string; endAt: string };
  accountBracket: string | null;
  scoringConfig?: Partial<PnlScoringConfig>;
  /** Full OHLCV series per instrument within [startAt, endAt], chronological. */
  barsByInstrument: Partial<Record<Market, MarketBar[]>>;
  participants: [ReconstructParticipantInput, ReconstructParticipantInput];
}

export interface ReconstructedFinalComponents {
  performanceScore: number;
  riskEfficiencyScore: number;
  disciplineScore: number;
  consistencyScore: number;
}

export interface ReconstructedParticipant {
  accountSnapshots: AccountSnapshotInput[];
  /** NON-final only (t0 + intermediate ticks); the final snapshot is derived
   * by saveSettlement from the ParticipantSettlementInput components. */
  metricSnapshots: MetricSnapshotInput[];
  finalComponents: ReconstructedFinalComponents;
  /** Running PNL_V1 score at the buzzer — MUST equal the persisted
   * finalScore (verified by settlementService). */
  finalRunningScore: number;
}

export interface ReconstructBattleTelemetryResult {
  participants: [ReconstructedParticipant, ReconstructedParticipant];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const round2 = (value: number): number => Math.round(value * 100) / 100;
const iso = (ms: number): string => new Date(ms).toISOString();

const EMPTY_COMPONENTS: ReconstructedFinalComponents = {
  performanceScore: 0,
  riskEfficiencyScore: 0,
  disciplineScore: 0,
  consistencyScore: 0,
};

/** One replayed fill. `timeMs` decides which bar boundary applies it; the
 * ledger is stamped with the bar-boundary time when actually applied. */
interface SynthFill {
  timeMs: number;
  kind: "ENTRY" | "EXIT";
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  commission: number;
}

interface InstrumentPlan {
  instrument: Market;
  ledger: LedgerState;
  fills: SynthFill[];
  cursor: number;
  /** barStartMs → bar CLOSE (for mark-to-market during the walk). */
  closeAt: Map<number, number>;
  /** Latest bar CLOSE at/before a time (for the final flat mark). */
  bars: MarketBar[];
}

/** Buzzer mark-out of the single open-at-close position — identical formula
 * and inputs to `calculatePnlBattleScore.resolveMarkOut`. */
function markOutOf(
  opc: (OpenPositionAtClose & { instrument: Market }) | null,
): number {
  if (!opc || opc.markPrice === undefined) return 0;
  const direction = opc.side === "LONG" ? 1 : -1;
  return round2(
    (opc.markPrice - opc.averageEntryPrice) *
      direction *
      opc.size *
      opc.pointValue,
  );
}

function signedOpen(ledger: LedgerState): number {
  if (!ledger.open) return 0;
  return ledger.open.side === "LONG" ? ledger.open.quantity : -ledger.open.quantity;
}

/**
 * Combine one-or-more ledgers into a single `BattleMetricsInput` for the
 * 4-factor engine. One instrument (the v1 norm) is exact: it is just
 * `toBattleMetrics`. Multiple instruments are a documented summed
 * approximation (INSIGHT ONLY): net/gross/drawdown add, contract peaks take
 * the max, trades concatenate.
 */
function combineLedgerMetrics(
  ledgers: LedgerState[],
  limits: BattleRiskLimits,
  elapsedMs: number,
): BattleMetricsInput {
  if (ledgers.length === 1) {
    return toBattleMetrics(ledgers[0], limits, elapsedMs);
  }
  let netPnl = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let peakEquity = 0;
  let lowestEquity = 0;
  let maxDrawdown = 0;
  let maxOpenContracts = 0;
  let timeInSevereDrawdownMs = 0;
  const trades: BattleTrade[] = [];
  for (const ledger of ledgers) {
    const m = toBattleMetrics(ledger, limits, elapsedMs);
    netPnl += m.netPnl;
    grossProfit += m.grossProfit;
    grossLoss += m.grossLoss;
    peakEquity += m.peakEquity;
    lowestEquity += m.lowestEquity;
    maxDrawdown += m.maxDrawdown;
    maxOpenContracts = Math.max(maxOpenContracts, m.maxOpenContracts);
    timeInSevereDrawdownMs = Math.max(timeInSevereDrawdownMs, m.timeInSevereDrawdownMs);
    trades.push(...m.trades);
  }
  return {
    netPnl: round2(netPnl),
    grossProfit: round2(grossProfit),
    grossLoss: round2(grossLoss),
    peakEquity: round2(peakEquity),
    lowestEquity: round2(lowestEquity),
    maxDrawdown: round2(maxDrawdown),
    maxOpenContracts,
    trades,
    battleDurationMs: elapsedMs,
    timeInSevereDrawdownMs,
    limits,
  };
}

function riskUtilizationOf(
  maxDrawdown: number,
  limits: BattleRiskLimits,
): number {
  if (!(limits.permittedRisk > 0)) return 0;
  return Math.min(1, Math.round((maxDrawdown / limits.permittedRisk) * 100) / 100);
}

// ---------------------------------------------------------------------------
// Per-participant reconstruction
// ---------------------------------------------------------------------------

function reconstructParticipant(
  p: ReconstructParticipantInput,
  startMs: number,
  endMs: number,
  limits: BattleRiskLimits,
  barsByInstrument: Partial<Record<Market, MarketBar[]>>,
  cfg: PnlScoringConfig,
): ReconstructedParticipant {
  const bonus = round2(
    cfg.pointsPerTrade * Math.min(p.countedTrades.length, cfg.maxTrades),
  );
  const realizedFromCounted = round2(
    p.countedTrades.reduce((sum, t) => sum + t.realizedPnl, 0),
  );
  const markOut = markOutOf(p.openPositionAtClose);
  // Authoritative buzzer values — equal to calculatePnlBattleScore by design.
  const finalEquityAuthoritative = round2(realizedFromCounted + markOut);
  const finalRunningScore = round2(finalEquityAuthoritative + bonus);

  // Which instrument do the (instrument-less) counted trades belong to?
  const openInstruments = new Set<Market>();
  for (const o of p.openAtBuzzerTrades) openInstruments.add(o.instrument);
  if (p.openPositionAtClose) openInstruments.add(p.openPositionAtClose.instrument);
  const barInstruments = (Object.keys(barsByInstrument) as Market[]).filter(
    (m) => (barsByInstrument[m]?.length ?? 0) > 0,
  );
  let countedInstrument: Market | null = null;
  if (openInstruments.size === 1) {
    countedInstrument = [...openInstruments][0];
  } else if (barInstruments.length === 1) {
    countedInstrument = barInstruments[0];
  } else if (barInstruments.length > 0) {
    // Ambiguous multi-instrument (unsupported by the instrument-less counted
    // input) — attribute all counted trades to the lexicographically first
    // instrument with bars. Documented approximation; realized still sums
    // correctly regardless of the chosen ledger.
    countedInstrument = [...barInstruments].sort()[0];
  }

  const walked = new Set<Market>();
  if (p.countedTrades.length > 0 && countedInstrument) walked.add(countedInstrument);
  for (const m of openInstruments) walked.add(m);

  // Guard rail: an instrument was traded but no bars exist to replay it →
  // skip reconstruction (report degrades to the aggregate view). The buzzer
  // score is still returned so the equality invariant can be checked.
  const walkedInstruments = [...walked];
  const hasAnyBars = walkedInstruments.some(
    (m) => (barsByInstrument[m]?.length ?? 0) > 0,
  );
  if (walkedInstruments.length > 0 && !hasAnyBars) {
    return {
      accountSnapshots: [],
      metricSnapshots: [],
      finalComponents: EMPTY_COMPONENTS,
      finalRunningScore,
    };
  }

  const severeThreshold = severeDrawdownThresholdFor(limits);

  // Build a ledger + a sorted fill queue per walked instrument.
  const plans = new Map<Market, InstrumentPlan>();
  const planFor = (instrument: Market): InstrumentPlan => {
    let plan = plans.get(instrument);
    if (!plan) {
      const bars = barsByInstrument[instrument] ?? [];
      const closeAt = new Map<number, number>();
      for (const bar of bars) closeAt.set(Date.parse(bar.barStart), bar.close);
      plan = {
        instrument,
        ledger: createLedger(instrument, { severeDrawdownThreshold: severeThreshold }),
        fills: [],
        cursor: 0,
        closeAt,
        bars,
      };
      plans.set(instrument, plan);
    }
    return plan;
  };
  for (const instrument of walkedInstruments) planFor(instrument);

  // Counted round trips → entry (commission 0) + exit (implied commission).
  if (countedInstrument) {
    const pv = MARKET_SPECS[countedInstrument].pointValue;
    const plan = planFor(countedInstrument);
    for (const trade of p.countedTrades) {
      const direction = trade.side === "LONG" ? 1 : -1;
      const gross = direction * (trade.exitPrice - trade.entryPrice) * trade.size * pv;
      const impliedCommission = round2(gross - trade.realizedPnl);
      const entrySide = trade.side === "LONG" ? "BUY" : "SELL";
      const exitSide = trade.side === "LONG" ? "SELL" : "BUY";
      plan.fills.push({
        timeMs: trade.entryTime,
        kind: "ENTRY",
        side: entrySide,
        quantity: trade.size,
        price: trade.entryPrice,
        commission: 0,
      });
      plan.fills.push({
        timeMs: trade.exitTime,
        kind: "EXIT",
        side: exitSide,
        quantity: trade.size,
        price: trade.exitPrice,
        commission: impliedCommission,
      });
    }
  }

  // Open-at-buzzer exposure. Only the bucket settlement actually marks out
  // (openPositionAtClose's instrument + side) contributes; others were
  // excluded by settlement and are omitted here too.
  const opc = p.openPositionAtClose;
  if (opc) {
    const plan = planFor(opc.instrument);
    let winSize = 0;
    let winNotional = 0;
    for (const { instrument, trade } of p.openAtBuzzerTrades) {
      if (instrument !== opc.instrument || trade.side !== opc.side) continue;
      winSize += trade.size;
      winNotional += trade.size * trade.entryPrice;
      plan.fills.push({
        timeMs: trade.entryTime,
        kind: "ENTRY",
        side: opc.side === "LONG" ? "BUY" : "SELL",
        quantity: trade.size,
        price: trade.entryPrice,
        commission: 0,
      });
    }
    // Remainder = still-open import rows folded into openPositionAtClose that
    // are not covered by open-at-buzzer trades. Their entry time is unknown,
    // so the remainder opens AT the buzzer (only shows in the final point).
    const remainderSize = round2(opc.size - winSize);
    if (remainderSize > 1e-9) {
      const remainderNotional = opc.size * opc.averageEntryPrice - winNotional;
      plan.fills.push({
        timeMs: endMs,
        kind: "ENTRY",
        side: opc.side === "LONG" ? "BUY" : "SELL",
        quantity: remainderSize,
        price: remainderNotional / remainderSize,
        commission: 0,
      });
    }
  }

  // Sort each queue: chronological, exits before entries at equal timestamps.
  for (const plan of plans.values()) {
    plan.fills.sort(
      (a, b) => a.timeMs - b.timeMs || (a.kind === b.kind ? 0 : a.kind === "EXIT" ? -1 : 1),
    );
  }

  // Grid = union of bar boundaries strictly inside (startMs, endMs).
  const gridSet = new Set<number>();
  for (const plan of plans.values()) {
    for (const t of plan.closeAt.keys()) {
      if (t > startMs && t < endMs) gridSet.add(t);
    }
  }
  const grid = [...gridSet].sort((a, b) => a - b);

  const accountSnapshots: AccountSnapshotInput[] = [];
  const metricSnapshots: MetricSnapshotInput[] = [];

  // Apply every queued fill with timeMs <= t (stamped at bar-boundary t).
  const applyDueFills = (plan: InstrumentPlan, t: number): void => {
    while (plan.cursor < plan.fills.length && plan.fills[plan.cursor].timeMs <= t) {
      const f = plan.fills[plan.cursor++];
      plan.ledger = applyFill(plan.ledger, {
        side: f.side,
        quantity: f.quantity,
        price: f.price,
        commission: f.commission,
        occurredAt: iso(t),
      });
    }
  };

  let aggregatePeak = 0; // running peak of aggregate equity (floored at 0)

  const emit = (t: number, isFinal: boolean): void => {
    const ledgers = walkedInstruments.map((m) => planFor(m).ledger);
    const realized = round2(ledgers.reduce((s, l) => s + l.realizedPnl, 0));
    const unrealized = isFinal
      ? markOut
      : round2(ledgers.reduce((s, l) => s + l.unrealizedPnl, 0));
    const equity = isFinal ? finalEquityAuthoritative : round2(realized + unrealized);
    aggregatePeak = Math.max(aggregatePeak, equity, 0);
    const drawdown = round2(Math.max(0, aggregatePeak - equity));
    const openPosition = isFinal
      ? opc
        ? opc.side === "LONG"
          ? opc.size
          : -opc.size
        : 0
      : ledgers.reduce((s, l) => s + signedOpen(l), 0);
    const closedSoFar = ledgers.reduce((s, l) => s + l.trades.length, 0);

    accountSnapshots.push({
      tradingAccountId: p.tradingAccountId,
      timestamp: iso(t),
      balance: equity,
      equity,
      realizedPnl: realized,
      unrealizedPnl: unrealized,
      openPosition,
      drawdown,
    });

    if (isFinal) return; // the final metric snapshot is derived by saveSettlement

    const elapsedMs = Math.max(0, t - startMs);
    const metrics = combineLedgerMetrics(ledgers, limits, elapsedMs);
    const { components } = calculateBattleScore(metrics);
    const runningBonus = round2(
      cfg.pointsPerTrade * Math.min(closedSoFar, cfg.maxTrades),
    );
    metricSnapshots.push({
      participantId: p.participantId,
      timestamp: iso(t),
      netPnl: equity,
      maximumDrawdown: metrics.maxDrawdown,
      tradeCount: closedSoFar,
      riskUtilization: riskUtilizationOf(metrics.maxDrawdown, limits),
      performanceScore: components.performance.score,
      riskEfficiencyScore: components.riskEfficiency.score,
      disciplineScore: components.discipline.score,
      consistencyScore: components.consistency.score,
      totalBattleScore: round2(equity + runningBonus),
    });
  };

  // t0 (flat) → intermediate bar boundaries → buzzer final.
  emit(startMs, false);
  for (const t of grid) {
    for (const plan of plans.values()) {
      applyDueFills(plan, t);
      const close = plan.closeAt.get(t);
      if (close !== undefined) plan.ledger = markToMarket(plan.ledger, close, t);
    }
    emit(t, false);
  }

  // Final: drain remaining fills at the buzzer, then mark the open-at-close
  // instrument to the SAME buzzer mark settlement used (or to its average
  // entry when there is no mark, matching EXCLUDED_NO_MARK → unrealized 0).
  for (const plan of plans.values()) {
    applyDueFills(plan, endMs);
    if (opc && plan.instrument === opc.instrument) {
      const markPrice = opc.markPrice ?? opc.averageEntryPrice;
      plan.ledger = markToMarket(plan.ledger, markPrice, endMs);
    } else {
      const lastClose = plan.bars.length > 0 ? plan.bars[plan.bars.length - 1].close : plan.ledger.lastPrice;
      if (lastClose !== null && lastClose !== undefined) {
        plan.ledger = markToMarket(plan.ledger, lastClose, endMs);
      }
    }
  }

  // Full-window 4-factor components (INSIGHT ONLY) for the final snapshot.
  const finalLedgers = walkedInstruments.map((m) => planFor(m).ledger);
  const finalMetrics = combineLedgerMetrics(finalLedgers, limits, endMs - startMs);
  const { components: finalComponentResults } = calculateBattleScore(finalMetrics);
  const finalComponents: ReconstructedFinalComponents = {
    performanceScore: finalComponentResults.performance.score,
    riskEfficiencyScore: finalComponentResults.riskEfficiency.score,
    disciplineScore: finalComponentResults.discipline.score,
    consistencyScore: finalComponentResults.consistency.score,
  };

  emit(endMs, true);

  return { accountSnapshots, metricSnapshots, finalComponents, finalRunningScore };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function reconstructBattleTelemetry(
  input: ReconstructBattleTelemetryInput,
): ReconstructBattleTelemetryResult {
  const startMs = Date.parse(input.window.startAt);
  const endMs = Date.parse(input.window.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error(
      `reconstructBattleTelemetry: invalid window [${input.window.startAt}, ${input.window.endAt}]`,
    );
  }
  const limits = riskLimitsForBracket(input.accountBracket);
  const cfg = resolvePnlScoringConfig(input.scoringConfig);

  const participants = input.participants.map((p) =>
    reconstructParticipant(p, startMs, endMs, limits, input.barsByInstrument, cfg),
  ) as [ReconstructedParticipant, ReconstructedParticipant];

  return { participants };
}
