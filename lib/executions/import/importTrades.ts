/**
 * importTrades — v1 CSV import through the EXISTING ingestion pipeline.
 *
 * `importTradesFromCsv` is a pure pipeline run (no persistence, no I/O):
 *
 *   trade CSV text -> parseTradeCsv (validate + integrity checks)
 *     -> tradeRowsToRawExecutionRecords (entry/exit fills)
 *     -> group by resolved instrument
 *     -> one createPipelineState(instrument) per instrument
 *     -> processExecutionEvent per record, chronological
 *     -> ledger trades / open position / realized PnL per instrument
 *
 * Nothing here reimplements pipeline logic — the same
 * normalize → dedupe → position-ledger path the mock provider feeds is what
 * scores a CSV import (architecture invariant: the engine cannot tell mock
 * from real). `replayExecutionRecords` is also reused by settlement to
 * rebuild state from PERSISTED execution events.
 *
 * V1 limitation: one file = one trading account. Files spanning multiple
 * trading_account_id values are rejected loudly (MULTIPLE_ACCOUNTS).
 *
 * NOTE (STATE.md gotcha): this path never calls `derivePipelineMetrics` or
 * the 4-factor scoring engine — PNL_V1 settlement consumes ledger trades
 * directly, which also sidesteps the Turbopack prod server-chunk minifier
 * bug affecting that function.
 *
 * Pure functions — no framework imports, no randomness, no Date.now
 * (`receivedAt` is a parameter; it defaults to each event's occurredAt so
 * replays stay deterministic).
 */

import type { Market } from "@/lib/data/schema";
import {
  parseTradeCsv,
  tradeRowsToRawExecutionRecords,
} from "@/lib/integrations/providers/csv/parseTradeCsv";
import type { RowError } from "@/lib/integrations/providers/csv/csvParsing";
import type {
  NormalizedExecutionEvent,
  RawExecutionRecord,
} from "@/lib/integrations/types";
import { resolveInstrument } from "@/lib/executions/normalizeExecution";
import {
  createPipelineState,
  processExecutionEvent,
} from "@/lib/executions/processExecutionEvent";
import type { BattleTrade } from "@/lib/scoring/calculateBattleScore";

// ---------------------------------------------------------------------------
// Errors (typed — services catch by `code`)
// ---------------------------------------------------------------------------

export type CsvImportErrorCode = "INVALID_HEADER" | "MULTIPLE_ACCOUNTS";

/** Thrown when the file as a WHOLE cannot be imported. Per-row problems are
 * returned in `summary.rejectedRows` instead, never thrown. */
export class CsvImportError extends Error {
  constructor(
    public readonly code: CsvImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CsvImportError";
  }
}

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

/** A position still open at the end of the imported record stream. */
export interface OpenPositionSummary {
  side: "LONG" | "SHORT";
  quantity: number;
  avgEntryPrice: number;
  /** Epoch ms of the opening fill (used for window classification). */
  entryTimeMs: number;
}

export interface InstrumentImportResult {
  instrument: Market;
  /** Completed round-trip trades (ledger/scoring `BattleTrade` shape). */
  trades: BattleTrade[];
  openPosition: OpenPositionSummary | null;
  /** Total realized PnL over the reconstructed trades, dollars. */
  realizedPnl: number;
  /** Accepted normalized events, pipeline arrival order (for persistence). */
  events: NormalizedExecutionEvent[];
  accepted: number;
  duplicates: number;
  rejected: number;
  /** Pipeline rejection reasons (should be empty — rows were pre-validated). */
  rejectionReasons: string[];
}

export interface ImportTradesSummary {
  /** Valid parsed rows (before pipeline). */
  parsedRows: number;
  /** Rows rejected by parsing / integrity validation, with reasons. */
  rejectedRows: RowError[];
  /** Pipeline event counts across all instruments. */
  accepted: number;
  duplicates: number;
  rejected: number;
}

export interface ImportTradesResult {
  /** Distinct trading_account_id values seen (v1 enforces exactly <= 1). */
  accountIds: string[];
  perInstrument: InstrumentImportResult[];
  summary: ImportTradesSummary;
}

export interface ImportTradesOptions {
  /** Pipeline receipt time stamped on events (ISO UTC). Defaults to each
   * event's own occurredAt, keeping replays deterministic. */
  receivedAt?: string;
}

export interface ImportTradesInput {
  csvText: string;
  options?: ImportTradesOptions;
}

// ---------------------------------------------------------------------------
// Replay (shared with settlement)
// ---------------------------------------------------------------------------

const legRank = (providerEventId: string): number =>
  providerEventId.endsWith(":exit") ? 0 : 1;

/**
 * Deterministic chronological order: occurredAt, then EXIT legs before ENTRY
 * legs at the same instant (a trade closed at time T settles before the next
 * trade opened at T — otherwise back-to-back round trips at the same
 * timestamp would merge in the ledger), then providerEventId.
 */
export function sortRecordsChronologically(
  records: RawExecutionRecord[],
): RawExecutionRecord[] {
  return [...records].sort((a, b) => {
    const timeDiff = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
    if (timeDiff !== 0) return timeDiff;
    const legDiff = legRank(a.providerEventId) - legRank(b.providerEventId);
    if (legDiff !== 0) return legDiff;
    return a.providerEventId.localeCompare(b.providerEventId);
  });
}

export interface ReplayResult {
  perInstrument: InstrumentImportResult[];
  accepted: number;
  duplicates: number;
  rejected: number;
}

/**
 * Push raw records through per-instrument pipeline instances and summarize
 * the resulting ledgers. Used for fresh CSV imports AND for settlement-time
 * replay of persisted execution events (mapped back to raw-record shape).
 */
export function replayExecutionRecords(
  records: RawExecutionRecord[],
  receivedAt?: string,
): ReplayResult {
  // Group by resolved instrument (raw symbols like "NQU6" resolve to "NQ").
  const byInstrument = new Map<Market, RawExecutionRecord[]>();
  for (const record of records) {
    const instrument = resolveInstrument(record.instrument);
    if (!instrument) continue; // unresolvable symbols were rejected upstream
    const group = byInstrument.get(instrument);
    if (group) group.push(record);
    else byInstrument.set(instrument, [record]);
  }

  const perInstrument: InstrumentImportResult[] = [];
  let accepted = 0;
  let duplicates = 0;
  let rejected = 0;

  const instruments = [...byInstrument.keys()].sort();
  for (const instrument of instruments) {
    const group = sortRecordsChronologically(byInstrument.get(instrument)!);
    let state = createPipelineState(instrument);
    const rejectionReasons: string[] = [];
    for (const record of group) {
      const result = processExecutionEvent(state, record, receivedAt);
      state = result.state;
      if (result.outcome === "REJECTED" && result.errors) {
        rejectionReasons.push(...result.errors);
      }
    }
    accepted += state.acceptedCount;
    duplicates += state.duplicateCount;
    rejected += state.rejectedCount;
    perInstrument.push({
      instrument,
      trades: state.ledger.trades,
      openPosition: state.ledger.open
        ? {
            side: state.ledger.open.side,
            quantity: state.ledger.open.quantity,
            avgEntryPrice: state.ledger.open.avgEntryPrice,
            entryTimeMs: state.ledger.open.entryTimeMs,
          }
        : null,
      realizedPnl: state.ledger.realizedPnl,
      events: state.events,
      accepted: state.acceptedCount,
      duplicates: state.duplicateCount,
      rejected: state.rejectedCount,
      rejectionReasons,
    });
  }

  return { perInstrument, accepted, duplicates, rejected };
}

// ---------------------------------------------------------------------------
// The import entrypoint
// ---------------------------------------------------------------------------

/**
 * Parse a trade CSV and run it through the ingestion pipeline. Throws
 * `CsvImportError` when the file as a whole is unusable (bad header,
 * multiple accounts); per-row failures come back in `summary.rejectedRows`.
 * An import with zero valid rows is returned (not thrown) — the caller
 * decides whether "no trades" is an error in its context.
 */
export function importTradesFromCsv(
  input: ImportTradesInput,
): ImportTradesResult {
  const { rows, errors } = parseTradeCsv(input.csvText);

  // A header error means nothing could be read at all — fail loudly.
  if (rows.length === 0 && errors.length === 1 && errors[0].line === 1) {
    throw new CsvImportError("INVALID_HEADER", errors[0].reason);
  }

  const accountIds = [...new Set(rows.map((r) => r.tradingAccountId))].sort();
  if (accountIds.length > 1) {
    throw new CsvImportError(
      "MULTIPLE_ACCOUNTS",
      `the file spans ${accountIds.length} trading accounts ` +
        `(${accountIds.join(", ")}) — v1 imports accept one account per file`,
    );
  }

  const records = tradeRowsToRawExecutionRecords(rows);
  const replay = replayExecutionRecords(records, input.options?.receivedAt);

  return {
    accountIds,
    perInstrument: replay.perInstrument,
    summary: {
      parsedRows: rows.length,
      rejectedRows: errors,
      accepted: replay.accepted,
      duplicates: replay.duplicates,
      rejected: replay.rejected,
    },
  };
}
