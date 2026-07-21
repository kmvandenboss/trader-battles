/**
 * csvParsing — minimal shared CSV mechanics for the v1 file-import adapters
 * (trade exports + market bars). Hand-rolled on purpose: no new dependency,
 * and the two accepted formats are simple, well-known headers.
 *
 * Tolerates \r\n line endings, a trailing newline, and double-quoted cells.
 * Header validation is strict: every required column must be present (a
 * clear error lists the missing ones) so silent format drift is impossible —
 * this is a Non-Negotiable-1 honesty guard, not a convenience.
 *
 * Pure functions — no I/O, no framework imports, no randomness, no Date.now.
 */

/** One rejected CSV row (or the header) with a human-readable reason.
 * `line` is the 1-based line number in the file (header = line 1). */
export interface RowError {
  line: number;
  reason: string;
}

export interface CsvRow {
  /** 1-based line number in the source file. */
  line: number;
  cells: string[];
}

export interface ParsedCsv {
  /** Lower-cased column name -> cell index. */
  columnIndex: Record<string, number>;
  /** Data rows in file order (header excluded, blank lines skipped). */
  rows: CsvRow[];
}

export type CsvParseOutcome =
  | { ok: true; csv: ParsedCsv }
  | { ok: false; error: RowError };

/** Split one CSV line into cells, honoring double-quoted fields ("" = quote). */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}

/**
 * Parse CSV text and validate the header against `requiredColumns`.
 * Extra columns are tolerated (and reachable by name); missing required
 * columns fail loudly with the full missing list.
 */
export function parseCsv(
  csvText: string,
  requiredColumns: readonly string[],
): CsvParseOutcome {
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim().length === 0) {
    return {
      ok: false,
      error: { line: 1, reason: "empty file — expected a CSV header row" },
    };
  }

  const headerCells = splitCsvLine(lines[0]).map((c) => c.trim().toLowerCase());
  const columnIndex: Record<string, number> = {};
  headerCells.forEach((name, index) => {
    if (name.length > 0 && !(name in columnIndex)) columnIndex[name] = index;
  });

  const missing = requiredColumns.filter((c) => !(c in columnIndex));
  if (missing.length > 0) {
    return {
      ok: false,
      error: {
        line: 1,
        reason: `header is missing required column(s): ${missing.join(", ")}`,
      },
    };
  }

  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim().length === 0) continue; // trailing/blank lines
    rows.push({ line: i + 1, cells: splitCsvLine(lines[i]) });
  }
  return { ok: true, csv: { columnIndex, rows } };
}

/** Read a named cell from a row (trimmed); "" when the column ran short. */
export function cellValue(
  csv: ParsedCsv,
  row: CsvRow,
  column: string,
): string {
  const index = csv.columnIndex[column];
  return index === undefined ? "" : (row.cells[index] ?? "").trim();
}

/**
 * Normalize a timestamp cell to a UTC ISO-8601 string.
 *
 * The MFFU warehouse exports NAIVE timestamps that are UTC by convention
 * (e.g. "2026-07-13T13:30:07.153000" = 9:30:07 ET) — we append "Z" and
 * document that assumption. Timestamps that already carry an explicit offset
 * ("+00:00", "Z") are passed through as-is. Bars use a space separator,
 * which is normalized to "T" first.
 *
 * Returns null when the value cannot be parsed to a finite instant.
 */
export function toUtcIso(value: string): string | null {
  const trimmed = value.trim().replace(" ", "T");
  if (trimmed.length === 0) return null;
  const hasExplicitOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const candidate = hasExplicitOffset ? trimmed : `${trimmed}Z`;
  const ms = Date.parse(candidate);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** Parse a required finite number cell; null when absent or not a number. */
export function toFiniteNumber(value: string): number | null {
  if (value.trim().length === 0) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
