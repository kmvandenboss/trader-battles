/**
 * CSV provider adapter — the first REAL (self-reported) v1 ingestion source.
 *
 * Maps the MFFU warehouse trade export and 1-minute OHLCV bar files into the
 * same `RawExecutionRecord` / `MarketBarInput` shapes every other provider
 * uses. Everything downstream (normalize → dedupe → position ledger →
 * settlement) is identical to the mock path — the pipeline cannot tell a CSV
 * import from any other source, per the architecture invariant.
 */

export {
  parseTradeCsv,
  tradeRowsToRawExecutionRecords,
  tradeLegEventId,
  TRADE_CSV_COLUMNS,
  POINTS_TOLERANCE,
  DOLLARS_TOLERANCE,
  type ParsedTradeRow,
  type ParseTradeCsvResult,
} from "./parseTradeCsv";
export { parseBarsCsv, BARS_CSV_COLUMNS, type ParseBarsCsvResult } from "./parseBarsCsv";
export type { RowError } from "./csvParsing";
