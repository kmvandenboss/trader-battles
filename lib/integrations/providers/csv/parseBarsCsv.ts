/**
 * parseBarsCsv — 1-minute OHLCV market-bar CSV parser (v1 buzzer mark-out).
 *
 * Accepted format:
 *
 *   timestamp,open,high,low,close,volume
 *   2026-07-13 12:00:00+00:00,29742.0,29752.0,29726.5,29728.25,365
 *
 * Timestamps carry an explicit offset; the space separator is normalized to
 * "T" and the value is re-serialized as a UTC "Z" ISO string. (A naive
 * timestamp would be treated as UTC — same convention as the trade CSV.)
 *
 * Each bar is sanity-checked (low <= open/close <= high, positive prices,
 * finite non-negative volume) — bad bars are rejected with a line + reason,
 * never silently coerced. Output is `MarketBarInput[]`, the exact shape
 * `MarketDataRepository.saveBars` persists.
 *
 * Pure functions — no I/O, no framework imports, no randomness, no Date.now.
 */

import type { MarketBarInput } from "@/lib/data/repositories/types";
import {
  cellValue,
  parseCsv,
  toFiniteNumber,
  toUtcIso,
  type RowError,
} from "./csvParsing";

export const BARS_CSV_COLUMNS = [
  "timestamp",
  "open",
  "high",
  "low",
  "close",
  "volume",
] as const;

export interface ParseBarsCsvResult {
  bars: MarketBarInput[];
  errors: RowError[];
}

export function parseBarsCsv(csvText: string): ParseBarsCsvResult {
  const outcome = parseCsv(csvText, BARS_CSV_COLUMNS);
  if (!outcome.ok) return { bars: [], errors: [outcome.error] };

  const bars: MarketBarInput[] = [];
  const errors: RowError[] = [];

  for (const row of outcome.csv.rows) {
    const get = (column: string) => cellValue(outcome.csv, row, column);
    const reject = (reason: string) => errors.push({ line: row.line, reason });

    const barStart = toUtcIso(get("timestamp"));
    if (!barStart) {
      reject(`timestamp is not a valid instant ("${get("timestamp")}")`);
      continue;
    }

    const open = toFiniteNumber(get("open"));
    const high = toFiniteNumber(get("high"));
    const low = toFiniteNumber(get("low"));
    const close = toFiniteNumber(get("close"));
    const volume = toFiniteNumber(get("volume"));

    if (open === null || high === null || low === null || close === null) {
      reject("open/high/low/close must all be numbers");
      continue;
    }
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
      reject("prices must be positive");
      continue;
    }
    if (low > Math.min(open, close) || Math.max(open, close) > high || low > high) {
      reject(
        `OHLC sanity check failed (open ${open}, high ${high}, low ${low}, close ${close})`,
      );
      continue;
    }
    if (volume === null || volume < 0) {
      reject(`volume must be a finite non-negative number ("${get("volume")}")`);
      continue;
    }

    bars.push({ barStart, open, high, low, close, volume });
  }

  return { bars, errors };
}
