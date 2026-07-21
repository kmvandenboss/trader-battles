/**
 * CSV provider adapter tests — trade-CSV parsing + integrity checks and the
 * bars-CSV parser. Fixtures are anonymized (fake account UUID, DemoBroker);
 * the trade numbers mirror a real MFFU warehouse export so the pipeline
 * arithmetic is pinned against reality.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  parseTradeCsv,
  tradeRowsToRawExecutionRecords,
  tradeLegEventId,
} from "@/lib/integrations/providers/csv/parseTradeCsv";
import { parseBarsCsv } from "@/lib/integrations/providers/csv/parseBarsCsv";

const TRADES_FIXTURE = readFileSync(
  new URL("./fixtures/trades-nq-3shorts.csv", import.meta.url),
  "utf8",
);
const BARS_FIXTURE = readFileSync(
  new URL("./fixtures/bars-nq-buzzer.csv", import.meta.url),
  "utf8",
);

const HEADER =
  "trading_account_id,asset,asset_code,short_long,total_contracts," +
  "open_datetime,close_datetime,seconds_held,avg_market_entry," +
  "avg_market_close,market_profit,commission_and_fees,net_profit," +
  "winner_loser,status,stage,broker";

const ACCOUNT = "22222222-2222-4222-8222-222222222222";

/** Build a trade row from named overrides (defaults form a valid LONG NQ). */
function row(overrides: Partial<Record<string, string>> = {}): string {
  const cells: Record<string, string> = {
    trading_account_id: ACCOUNT,
    asset: "NQU6",
    asset_code: "NQ",
    short_long: "LONG",
    total_contracts: "1",
    open_datetime: "2026-07-13T13:35:00.000000",
    close_datetime: "2026-07-13T13:40:00.000000",
    seconds_held: "300",
    avg_market_entry: "29500",
    avg_market_close: "29510",
    market_profit: "10",
    commission_and_fees: "4.68",
    net_profit: "195.32",
    winner_loser: "WIN",
    status: "CLOSED",
    stage: "evaluation",
    broker: "DemoBroker",
    ...overrides,
  };
  return HEADER.split(",")
    .map((column) => cells[column] ?? "")
    .join(",");
}

const csvOf = (...rows: string[]) => [HEADER, ...rows].join("\n");

describe("parseTradeCsv", () => {
  it("parses the anonymized warehouse fixture with zero errors", () => {
    const { rows, errors } = parseTradeCsv(TRADES_FIXTURE);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      tradingAccountId: "11111111-1111-4111-8111-111111111111",
      asset: "NQU6",
      instrument: "NQ",
      pointValue: 20,
      side: "SHORT",
      contracts: 2,
      status: "CLOSED",
      marketProfitPoints: 8.875,
      netProfit: 345.64,
    });
    // Naive warehouse timestamps are treated as UTC (documented assumption).
    expect(rows[0].openAtIso).toBe("2026-07-13T13:30:07.153Z");
    expect(rows[0].closeAtIso).toBe("2026-07-13T13:36:08.071Z");
  });

  it("rejects a file whose header is missing columns, listing them", () => {
    const { rows, errors } = parseTradeCsv("trading_account_id,asset\nx,NQU6");
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(1);
    expect(errors[0].reason).toContain("short_long");
    expect(errors[0].reason).toContain("net_profit");
  });

  it("tolerates \\r\\n line endings and a trailing newline", () => {
    const { rows, errors } = parseTradeCsv(csvOf(row()).replace(/\n/g, "\r\n") + "\r\n");
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it("rejects an unsupported instrument", () => {
    const { rows, errors } = parseTradeCsv(csvOf(row({ asset: "ZB" })));
    expect(rows).toEqual([]);
    expect(errors[0].reason).toContain('unsupported instrument "ZB"');
  });

  it("rejects a row whose prices contradict market_profit (points check)", () => {
    const { rows, errors } = parseTradeCsv(csvOf(row({ market_profit: "9" })));
    expect(rows).toEqual([]);
    expect(errors[0].reason).toContain("market_profit integrity check failed");
  });

  it("rejects a row whose dollars contradict net_profit (multiplier check)", () => {
    // Correct points (10) but a net_profit implying the wrong point value.
    const { rows, errors } = parseTradeCsv(csvOf(row({ net_profit: "95.32" })));
    expect(rows).toEqual([]);
    expect(errors[0].reason).toContain("net_profit integrity check failed");
  });

  it("rejects invalid side / contracts / timestamps / inverted times", () => {
    const cases: Array<[Partial<Record<string, string>>, string]> = [
      [{ short_long: "SHRT" }, "short_long"],
      [{ total_contracts: "0" }, "total_contracts"],
      [{ total_contracts: "1.5" }, "total_contracts"],
      [{ open_datetime: "not-a-time" }, "open_datetime"],
      [{ close_datetime: "2026-07-13T13:30:00.000000" }, "before open_datetime"],
      [{ avg_market_entry: "-5" }, "avg_market_entry"],
    ];
    for (const [overrides, fragment] of cases) {
      const { rows, errors } = parseTradeCsv(csvOf(row(overrides)));
      expect(rows).toEqual([]);
      expect(errors).toHaveLength(1);
      expect(errors[0].reason).toContain(fragment);
    }
  });

  it("keeps per-row failures isolated (good rows still parse)", () => {
    const { rows, errors } = parseTradeCsv(
      csvOf(row(), row({ market_profit: "999" }), row({ open_datetime: "2026-07-13T14:00:00.000000", close_datetime: "2026-07-13T14:05:00.000000" })),
    );
    expect(rows).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(3);
  });

  it("treats OPEN rows (and CLOSED rows missing exit fields) as entry-only", () => {
    const openRow = row({
      status: "OPEN",
      close_datetime: "",
      avg_market_close: "",
      market_profit: "",
      net_profit: "",
      winner_loser: "",
      seconds_held: "",
      commission_and_fees: "",
    });
    const closedMissingExit = row({
      close_datetime: "",
      avg_market_close: "",
      open_datetime: "2026-07-13T14:10:00.000000",
    });
    const { rows, errors } = parseTradeCsv(csvOf(openRow, closedMissingExit));
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.status)).toEqual(["OPEN", "OPEN"]);
    expect(rows[0].closeAtIso).toBeNull();
    expect(rows[0].commissionAndFees).toBe(0);
  });

  it("passes explicit-offset timestamps through instead of assuming UTC", () => {
    const { rows } = parseTradeCsv(
      csvOf(
        row({
          open_datetime: "2026-07-13T09:35:00.000000-04:00",
          close_datetime: "2026-07-13T09:40:00.000000-04:00",
        }),
      ),
    );
    expect(rows[0].openAtIso).toBe("2026-07-13T13:35:00.000Z");
  });
});

describe("tradeRowsToRawExecutionRecords", () => {
  it("emits entry + exit fills that reconstruct the round trip", () => {
    const { rows } = parseTradeCsv(TRADES_FIXTURE);
    const records = tradeRowsToRawExecutionRecords(rows);
    expect(records).toHaveLength(6);

    const [entry, exit] = records;
    expect(entry).toMatchObject({
      sourceProvider: "csv",
      accountId: "11111111-1111-4111-8111-111111111111",
      instrument: "NQU6",
      side: "SELL", // SHORT entry
      quantity: 2,
      price: 29689.625,
      commission: 0,
      occurredAt: "2026-07-13T13:30:07.153Z",
      eventType: "FILL",
    });
    expect(exit).toMatchObject({
      side: "BUY",
      price: 29680.75,
      commission: 9.36, // full fees on the exit leg → net_profit to the cent
      occurredAt: "2026-07-13T13:36:08.071Z",
    });
    // verificationStatus omitted → the normalizer defaults csv to SELF_REPORTED.
    expect(entry.verificationStatus).toBeUndefined();
    // Audit trail: the full original row travels in rawPayload.
    expect(entry.rawPayload).toMatchObject({ broker: "DemoBroker", stage: "evaluation", leg: "entry" });
  });

  it("emits only the entry fill for an OPEN row", () => {
    const { rows } = parseTradeCsv(
      csvOf(row({ status: "OPEN", close_datetime: "", avg_market_close: "", market_profit: "", net_profit: "" })),
    );
    const records = tradeRowsToRawExecutionRecords(rows);
    expect(records).toHaveLength(1);
    expect(records[0].side).toBe("BUY");
    expect(records[0].providerEventId.endsWith(":entry")).toBe(true);
  });

  it("produces deterministic provider event ids (same file → same ids)", () => {
    const first = tradeRowsToRawExecutionRecords(parseTradeCsv(TRADES_FIXTURE).rows);
    const second = tradeRowsToRawExecutionRecords(parseTradeCsv(TRADES_FIXTURE).rows);
    expect(first.map((r) => r.providerEventId)).toEqual(
      second.map((r) => r.providerEventId),
    );
    const { rows } = parseTradeCsv(TRADES_FIXTURE);
    expect(first[0].providerEventId).toBe(tradeLegEventId(rows[0], "entry"));
    expect(first[0].providerEventId).toContain("csv:");
    expect(first[1].providerEventId.endsWith(":exit")).toBe(true);
  });
});

describe("parseBarsCsv", () => {
  it("parses the bars fixture and normalizes timestamps to UTC Z", () => {
    const { bars, errors } = parseBarsCsv(BARS_FIXTURE);
    expect(errors).toEqual([]);
    expect(bars).toHaveLength(6);
    expect(bars[0]).toEqual({
      barStart: "2026-07-13T14:54:00.000Z",
      open: 29638.0,
      high: 29645.5,
      low: 29635.25,
      close: 29641.0,
      volume: 298,
    });
  });

  it("rejects a header missing required columns", () => {
    const { bars, errors } = parseBarsCsv("timestamp,open,close\nx,1,2");
    expect(bars).toEqual([]);
    expect(errors[0].line).toBe(1);
    expect(errors[0].reason).toContain("high");
    expect(errors[0].reason).toContain("volume");
  });

  it("rejects bars that fail OHLC sanity or volume checks", () => {
    const bad = [
      "timestamp,open,high,low,close,volume",
      "2026-07-13 14:00:00+00:00,100,99,98,100,10", // high < open
      "2026-07-13 14:01:00+00:00,100,101,100.5,100,10", // low > open
      "2026-07-13 14:02:00+00:00,100,101,99,100,-3", // negative volume
      "2026-07-13 14:03:00+00:00,-100,101,99,100,10", // negative price
      "not a time,100,101,99,100,10",
      "2026-07-13 14:05:00+00:00,100,101,99,100.5,10", // good
    ].join("\n");
    const { bars, errors } = parseBarsCsv(bad);
    expect(bars).toHaveLength(1);
    expect(errors).toHaveLength(5);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5, 6]);
  });
});
