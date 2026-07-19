/**
 * processExecutionEvent — the ingestion-pipeline entrypoint.
 *
 * One call per raw provider event:
 *
 *   raw provider event -> normalize (validate) -> deduplicate
 *     -> position ledger update -> derived metrics on demand
 *
 * This is the ONLY door into account state. The battle engine feeds it mock
 * events today; a live transport will feed it NinjaTrader/Tradovate/Rithmic
 * events later with zero changes here. Events that are not fills (orders,
 * cancels, snapshots) are recorded for the audit trail but do not move the
 * position.
 *
 * Pure functions — a new state is returned per call; state is fully
 * JSON-serializable for battle snapshots.
 */

import type { Market } from "@/lib/data/schema";
import type { NormalizedExecutionEvent } from "@/lib/integrations/types";
import type {
  BattleMetricsInput,
  BattleRiskLimits,
} from "@/lib/scoring/calculateBattleScore";
import {
  createDedupeState,
  deduplicateExecution,
  type DedupeState,
} from "./deduplicateExecution";
import { normalizeExecution } from "./normalizeExecution";
import {
  applyFill,
  createLedger,
  markToMarket,
  toBattleMetrics,
  type LedgerState,
} from "./positionLedger";

export interface ExecutionPipelineState {
  /** The market this pipeline instance accepts (one per battle account). */
  market: Market;
  dedupe: DedupeState;
  ledger: LedgerState;
  /** Accepted normalized events, in arrival order (audit trail / chart). */
  events: NormalizedExecutionEvent[];
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
}

export type ProcessOutcome =
  /** Valid fill — position state changed. */
  | "APPLIED"
  /** Valid non-fill event — recorded, no position change. */
  | "RECORDED"
  /** Seen before (same provider + providerEventId) — ignored. */
  | "DUPLICATE"
  /** Failed validation — never reaches the ledger. */
  | "REJECTED";

export interface ProcessResult {
  state: ExecutionPipelineState;
  outcome: ProcessOutcome;
  event?: NormalizedExecutionEvent;
  errors?: string[];
}

export interface CreatePipelineOptions {
  /** Dollar drawdown beyond which time counts as severe (0.5 x permitted risk). */
  severeDrawdownThreshold?: number;
}

export function createPipelineState(
  market: Market,
  options: CreatePipelineOptions = {},
): ExecutionPipelineState {
  return {
    market,
    dedupe: createDedupeState(),
    ledger: createLedger(market, options),
    events: [],
    acceptedCount: 0,
    duplicateCount: 0,
    rejectedCount: 0,
  };
}

const FILL_EVENT_TYPES: ReadonlySet<string> = new Set(["FILL", "PARTIAL_FILL"]);

/**
 * Push one raw provider event through the full pipeline.
 */
export function processExecutionEvent(
  state: ExecutionPipelineState,
  rawEvent: unknown,
  receivedAt?: string,
): ProcessResult {
  const normalized = normalizeExecution(rawEvent, receivedAt);
  if (!normalized.ok) {
    return {
      state: { ...state, rejectedCount: state.rejectedCount + 1 },
      outcome: "REJECTED",
      errors: normalized.errors,
    };
  }
  const { event } = normalized;

  if (event.instrument !== state.market) {
    return {
      state: { ...state, rejectedCount: state.rejectedCount + 1 },
      outcome: "REJECTED",
      errors: [
        `instrument ${event.instrument} does not match this battle's market ${state.market}`,
      ],
    };
  }

  const dedupe = deduplicateExecution(state.dedupe, event);
  if (dedupe.duplicate) {
    return {
      state: { ...state, duplicateCount: state.duplicateCount + 1 },
      outcome: "DUPLICATE",
      event,
    };
  }

  const isFill = FILL_EVENT_TYPES.has(event.eventType);
  const ledger = isFill ? applyFill(state.ledger, event) : state.ledger;

  return {
    state: {
      ...state,
      dedupe: dedupe.state,
      ledger,
      events: [...state.events, event],
      acceptedCount: state.acceptedCount + 1,
    },
    outcome: isFill ? "APPLIED" : "RECORDED",
    event,
  };
}

/** Mark the pipeline's ledger to a new market price (market data, not an execution). */
export function markPipelineToMarket(
  state: ExecutionPipelineState,
  price: number,
  timestampMs: number,
): ExecutionPipelineState {
  return { ...state, ledger: markToMarket(state.ledger, price, timestampMs) };
}

/** Derive the scoring engine's input from current pipeline state. */
export function derivePipelineMetrics(
  state: ExecutionPipelineState,
  limits: BattleRiskLimits,
  battleDurationMs: number,
): BattleMetricsInput {
  return toBattleMetrics(state.ledger, limits, battleDurationMs);
}
