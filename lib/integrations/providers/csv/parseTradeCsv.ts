/**
 * parseTradeCsv — the v1 trade-CSV provider adapter (MFFU warehouse export).
 *
 * Accepted format — one row per ROUND-TRIP trade:
 *
 *   trading_account_id,asset,asset_code,short_long,total_contracts,
 *   open_datetime,close_datetime,seconds_held,avg_market_entry,
 *   avg_market_close,market_profit,commission_and_fees,net_profit,
 *   winner_loser,status,stage,broker
 *
 *   - `market_profit` is in POINTS; `net_profit` is in DOLLARS
 *     (= points × pointValue × contracts − commission_and_fees).
 *   - Timestamps are warehouse-naive UTC (no offset). We append "Z"; values
 *     that already carry an offset are passed through (see toUtcIso).
 *   - `status` CLOSED = a completed round trip; OPEN (or a row missing
 *     close_datetime / avg_market_close) = a position still open at export
 *     time — only its entry fill is emitted.
 *
 * Every row is integrity-checked BEFORE any record is emitted (instrument
 * supported, recomputed points match market_profit, recomputed dollars match
 * net_profit). These checks catch wrong multipliers and timezone/format
 * drift loudly — a Non-Negotiable-1 honesty guard: imported data must be
 * what it claims to be, or it is rejected with a reason.
 *
 * Each CLOSED row becomes TWO `RawExecutionRecord` fills (entry + exit) so
 * the EXISTING ingestion pipeline (normalize → dedupe → position ledger)
 * reconstructs the round trip with realized PnL exactly equal to
 * net_profit, to the cent. Provider event ids are deterministic pure
 * functions of the row content, so re-importing the same file dedupes to
 * zero new events.
 *
 * `sourceProvider` is "csv" — the normalizer defaults its verification
 * status to SELF_REPORTED (never SIMULATED, never provider-verified).
 *
 * Pure functions — no I/O, no framework imports, no randomness, no Date.now.
 */

import type { Market } from "@/lib/data/schema";
import { resolveInstrument } from "@/lib/executions/normalizeExecution";
import { MARKET_SPECS } from "@/lib/executions/positionLedger";
import type { RawExecutionRecord } from "@/lib/integrations/types";
import {
  cellValue,
  parseCsv,
  toFiniteNumber,
  toUtcIso,
  type ParsedCsv,
  type CsvRow,
  type RowError,
} from "./csvParsing";

export type { RowError } from "./csvParsing";

/** The full canonical warehouse header. ALL columns are required — a
 * missing column means the format drifted and the file is rejected. */
export const TRADE_CSV_COLUMNS = [
  "trading_account_id",
  "asset",
  "asset_code",
  "short_long",
  "total_contracts",
  "open_datetime",
  "close_datetime",
  "seconds_held",
  "avg_market_entry",
  "avg_market_close",
  "market_profit",
  "commission_and_fees",
  "net_profit",
  "winner_loser",
  "status",
  "stage",
  "broker",
] as const;

/** Recomputed points must match `market_profit` within this tolerance. */
export const POINTS_TOLERANCE = 0.01;
/** Recomputed dollars must match `net_profit` within this tolerance. */
export const DOLLARS_TOLERANCE = 0.05;

/** One validated, integrity-checked trade row. */
export interface ParsedTradeRow {
  /** 1-based source line number. */
  line: number;
  tradingAccountId: string;
  /** Raw symbol as exported (e.g. "NQU6"); the normalizer resolves it too. */
  asset: string;
  /** Resolved market (e.g. "NQ") — guaranteed present in MARKET_SPECS. */
  instrument: Market;
  /** Dollars per point per contract for the resolved market. */
  pointValue: number;
  side: "LONG" | "SHORT";
  contracts: number;
  /** Normalized UTC ISO instants. */
  openAtIso: string;
  closeAtIso: string | null;
  /** Original timestamp cell strings (used for deterministic event ids). */
  openAtRaw: string;
  closeAtRaw: string | null;
  avgEntryPrice: number;
  avgClosePrice: number | null;
  /** Points, straight from the file (null on OPEN rows). */
  marketProfitPoints: number | null;
  commissionAndFees: number;
  /** Dollars, straight from the file (null on OPEN rows). */
  netProfit: number | null;
  status: "CLOSED" | "OPEN";
  /** The full original row keyed by column name (audit trail — broker,
   * stage, winner_loser live here and travel in rawPayload). */
  raw: Record<string, string>;
}

export interface ParseTradeCsvResult {
  rows: ParsedTradeRow[];
  errors: RowError[];
}

function rawRowRecord(csv: ParsedCsv, row: CsvRow): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [name, index] of Object.entries(csv.columnIndex)) {
    record[name] = (row.cells[index] ?? "").trim();
  }
  return record;
}

function parseRow(
  csv: ParsedCsv,
  row: CsvRow,
): { ok: true; parsed: ParsedTradeRow } | { ok: false; reason: string } {
  const get = (column: string) => cellValue(csv, row, column);

  const tradingAccountId = get("trading_account_id");
  if (!tradingAccountId) return { ok: false, reason: "trading_account_id is empty" };

  const asset = get("asset");
  if (!asset) return { ok: false, reason: "asset is empty" };
  const instrument = resolveInstrument(asset);
  if (!instrument) {
    return { ok: false, reason: `unsupported instrument "${asset}"` };
  }
  const spec = MARKET_SPECS[instrument];
  if (!spec) {
    return { ok: false, reason: `no market spec for instrument "${instrument}"` };
  }

  const sideRaw = get("short_long").toUpperCase();
  if (sideRaw !== "SHORT" && sideRaw !== "LONG") {
    return {
      ok: false,
      reason: `short_long must be SHORT or LONG (got "${get("short_long")}")`,
    };
  }
  const side = sideRaw as "LONG" | "SHORT";

  const contracts = toFiniteNumber(get("total_contracts"));
  if (contracts === null || !Number.isInteger(contracts) || contracts <= 0) {
    return {
      ok: false,
      reason: `total_contracts must be a positive integer (got "${get("total_contracts")}")`,
    };
  }

  const openAtRaw = get("open_datetime");
  const openAtIso = toUtcIso(openAtRaw);
  if (!openAtIso) {
    return { ok: false, reason: `open_datetime is not a valid timestamp ("${openAtRaw}")` };
  }

  const statusRaw = get("status").toUpperCase();
  if (statusRaw !== "CLOSED" && statusRaw !== "OPEN") {
    return { ok: false, reason: `status must be CLOSED or OPEN (got "${get("status")}")` };
  }

  const avgEntryPrice = toFiniteNumber(get("avg_market_entry"));
  if (avgEntryPrice === null || avgEntryPrice <= 0) {
    return {
      ok: false,
      reason: `avg_market_entry must be a positive number (got "${get("avg_market_entry")}")`,
    };
  }

  const closeAtRaw = get("close_datetime");
  const avgCloseRaw = get("avg_market_close");
  // A row is entry-only when the warehouse says OPEN and/or the exit fields
  // are missing (a position still open at export time).
  const isOpen =
    statusRaw === "OPEN" || closeAtRaw.length === 0 || avgCloseRaw.length === 0;

  const commissionAndFees = toFiniteNumber(get("commission_and_fees")) ?? 0;
  if (commissionAndFees < 0) {
    return { ok: false, reason: "commission_and_fees must be >= 0" };
  }

  const base = {
    line: row.line,
    tradingAccountId,
    asset,
    instrument,
    pointValue: spec.pointValue,
    side,
    contracts,
    openAtIso,
    openAtRaw,
    avgEntryPrice,
    commissionAndFees,
    raw: rawRowRecord(csv, row),
  };

  if (isOpen) {
    return {
      ok: true,
      parsed: {
        ...base,
        closeAtIso: null,
        closeAtRaw: null,
        avgClosePrice: null,
        marketProfitPoints: null,
        netProfit: null,
        status: "OPEN",
      },
    };
  }

  const closeAtIso = toUtcIso(closeAtRaw);
  if (!closeAtIso) {
    return { ok: false, reason: `close_datetime is not a valid timestamp ("${closeAtRaw}")` };
  }
  if (Date.parse(closeAtIso) < Date.parse(openAtIso)) {
    return { ok: false, reason: "close_datetime is before open_datetime" };
  }

  const avgClosePrice = toFiniteNumber(avgCloseRaw);
  if (avgClosePrice === null || avgClosePrice <= 0) {
    return {
      ok: false,
      reason: `avg_market_close must be a positive number (got "${avgCloseRaw}")`,
    };
  }

  const marketProfitPoints = toFiniteNumber(get("market_profit"));
  if (marketProfitPoints === null) {
    return { ok: false, reason: "market_profit is missing or not a number" };
  }
  const netProfit = toFiniteNumber(get("net_profit"));
  if (netProfit === null) {
    return { ok: false, reason: "net_profit is missing or not a number" };
  }

  // Integrity check (b): recompute points from the prices.
  const recomputedPoints =
    side === "SHORT"
      ? avgEntryPrice - avgClosePrice
      : avgClosePrice - avgEntryPrice;
  if (Math.abs(recomputedPoints - marketProfitPoints) > POINTS_TOLERANCE) {
    return {
      ok: false,
      reason:
        `market_profit integrity check failed: prices imply ` +
        `${recomputedPoints.toFixed(4)} points but the file says ` +
        `${marketProfitPoints} (side ${side}, entry ${avgEntryPrice}, ` +
        `close ${avgClosePrice})`,
    };
  }

  // Integrity check (c): recompute dollars with the market's point value.
  const recomputedDollars =
    recomputedPoints * spec.pointValue * contracts - commissionAndFees;
  if (Math.abs(recomputedDollars - netProfit) > DOLLARS_TOLERANCE) {
    return {
      ok: false,
      reason:
        `net_profit integrity check failed: ${recomputedPoints.toFixed(4)} pts ` +
        `x $${spec.pointValue}/pt x ${contracts} contracts - $${commissionAndFees} ` +
        `fees = $${recomputedDollars.toFixed(2)} but the file says $${netProfit} ` +
        `(instrument ${instrument})`,
    };
  }

  return {
    ok: true,
    parsed: {
      ...base,
      closeAtIso,
      closeAtRaw,
      avgClosePrice,
      marketProfitPoints,
      netProfit,
      status: "CLOSED",
    },
  };
}

/**
 * Parse + validate a warehouse trade CSV. Invalid rows are rejected with a
 * line number and reason; valid rows come back fully typed and
 * integrity-checked. A bad header rejects the whole file via `errors[0]`
 * (line 1) with the missing columns listed.
 */
export function parseTradeCsv(csvText: string): ParseTradeCsvResult {
  const outcome = parseCsv(csvText, TRADE_CSV_COLUMNS);
  if (!outcome.ok) return { rows: [], errors: [outcome.error] };

  const rows: ParsedTradeRow[] = [];
  const errors: RowError[] = [];
  for (const row of outcome.csv.rows) {
    const result = parseRow(outcome.csv, row);
    if (result.ok) rows.push(result.parsed);
    else errors.push({ line: row.line, reason: result.reason });
  }
  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Row -> RawExecutionRecord (the pipeline's input shape)
// ---------------------------------------------------------------------------

/**
 * Deterministic provider event id for one leg of a round trip. A pure
 * function of the row's own content, so re-importing the same file always
 * produces the same ids and the pipeline dedupe drops every repeat.
 * (Two byte-identical rows in ONE file would collide and dedupe to one
 * trade — with microsecond open timestamps that means a genuinely duplicated
 * export row, which is exactly what dedupe is for.)
 */
export function tradeLegEventId(
  row: ParsedTradeRow,
  leg: "entry" | "exit",
): string {
  return [
    "csv",
    row.tradingAccountId,
    row.openAtRaw,
    row.closeAtRaw ?? "open",
    row.side,
    String(row.contracts),
    String(row.avgEntryPrice),
    row.avgClosePrice === null ? "na" : String(row.avgClosePrice),
    leg,
  ].join(":");
}

/**
 * Convert validated rows into raw pipeline records:
 *   - CLOSED row → entry fill (commission 0) + exit fill (full
 *     commission_and_fees), so the ledger's realized PnL for the round trip
 *     equals net_profit exactly (to the cent).
 *   - OPEN row → the entry fill only.
 *
 * `verificationStatus` is deliberately omitted — the normalizer defaults
 * sourceProvider "csv" to SELF_REPORTED.
 */
export function tradeRowsToRawExecutionRecords(
  rows: ParsedTradeRow[],
): RawExecutionRecord[] {
  const records: RawExecutionRecord[] = [];
  for (const row of rows) {
    const entrySide = row.side === "LONG" ? "BUY" : "SELL";
    records.push({
      providerEventId: tradeLegEventId(row, "entry"),
      sourceProvider: "csv",
      accountId: row.tradingAccountId,
      instrument: row.asset,
      side: entrySide,
      quantity: row.contracts,
      price: row.avgEntryPrice,
      commission: 0,
      occurredAt: row.openAtIso,
      eventType: "FILL",
      rawPayload: { ...row.raw, csv_line: String(row.line), leg: "entry" },
    });

    if (row.status === "CLOSED" && row.closeAtIso && row.avgClosePrice !== null) {
      records.push({
        providerEventId: tradeLegEventId(row, "exit"),
        sourceProvider: "csv",
        accountId: row.tradingAccountId,
        instrument: row.asset,
        side: entrySide === "BUY" ? "SELL" : "BUY",
        quantity: row.contracts,
        price: row.avgClosePrice,
        commission: row.commissionAndFees,
        occurredAt: row.closeAtIso,
        eventType: "FILL",
        rawPayload: { ...row.raw, csv_line: String(row.line), leg: "exit" },
      });
    }
  }
  return records;
}
