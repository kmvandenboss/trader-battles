/**
 * importTradesFromCsv — the CSV import runs through the REAL ingestion
 * pipeline (normalize → dedupe → position ledger) and must reproduce each
 * round trip's net_profit exactly, to the cent.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CsvImportError,
  importTradesFromCsv,
} from "@/lib/executions/import/importTrades";

const TRADES_FIXTURE = readFileSync(
  new URL("./fixtures/trades-nq-3shorts.csv", import.meta.url),
  "utf8",
);

const HEADER =
  "trading_account_id,asset,asset_code,short_long,total_contracts," +
  "open_datetime,close_datetime,seconds_held,avg_market_entry," +
  "avg_market_close,market_profit,commission_and_fees,net_profit," +
  "winner_loser,status,stage,broker";

describe("importTradesFromCsv", () => {
  it("reproduces each round trip's net_profit exactly through the pipeline", () => {
    const result = importTradesFromCsv({ csvText: TRADES_FIXTURE });

    expect(result.accountIds).toEqual(["11111111-1111-4111-8111-111111111111"]);
    expect(result.summary).toMatchObject({
      parsedRows: 3,
      rejectedRows: [],
      accepted: 6,
      duplicates: 0,
      rejected: 0,
    });

    expect(result.perInstrument).toHaveLength(1);
    const nq = result.perInstrument[0];
    expect(nq.instrument).toBe("NQ");
    expect(nq.openPosition).toBeNull();
    // The load-bearing assertion: ledger realized PnL per round trip equals
    // the warehouse net_profit to the cent.
    expect(nq.trades.map((t) => t.realizedPnl)).toEqual([345.64, 1200.64, 520.32]);
    expect(nq.realizedPnl).toBeCloseTo(2066.6, 2);
    expect(nq.trades[0]).toMatchObject({
      side: "SHORT",
      size: 2,
      entryPrice: 29689.625,
      exitPrice: 29680.75,
      entryTime: Date.parse("2026-07-13T13:30:07.153Z"),
      exitTime: Date.parse("2026-07-13T13:36:08.071Z"),
    });
  });

  it("normalizes csv events as SELF_REPORTED (never SIMULATED)", () => {
    const result = importTradesFromCsv({ csvText: TRADES_FIXTURE });
    const events = result.perInstrument[0].events;
    expect(events).toHaveLength(6);
    for (const event of events) {
      expect(event.sourceProvider).toBe("csv");
      expect(event.verificationStatus).toBe("SELF_REPORTED");
    }
  });

  it("dedupes byte-identical duplicate rows inside one file", () => {
    const lines = TRADES_FIXTURE.trim().split("\n");
    const withDuplicate = [...lines, lines[1]].join("\n");
    const result = importTradesFromCsv({ csvText: withDuplicate });
    expect(result.summary.parsedRows).toBe(4);
    expect(result.summary.duplicates).toBe(2); // entry + exit of the repeat
    expect(result.perInstrument[0].trades).toHaveLength(3);
    expect(result.perInstrument[0].realizedPnl).toBeCloseTo(2066.6, 2);
  });

  it("handles LONG trades and open positions (entry-only rows)", () => {
    const csv = [
      HEADER,
      // Closed LONG: 10 pts x $20 x 1 - 4.68 = 195.32
      "acct-1,NQU6,NQ,LONG,1,2026-07-13T13:35:00.000000,2026-07-13T13:40:00.000000,300,29500,29510,10,4.68,195.32,WIN,CLOSED,evaluation,DemoBroker",
      // Still open at export: entry only.
      "acct-1,NQU6,NQ,LONG,1,2026-07-13T14:30:00.000000,,,29600,,,,,,OPEN,evaluation,DemoBroker",
    ].join("\n");
    const result = importTradesFromCsv({ csvText: csv });
    expect(result.summary.rejectedRows).toEqual([]);
    const nq = result.perInstrument[0];
    expect(nq.trades).toHaveLength(1);
    expect(nq.trades[0].realizedPnl).toBe(195.32);
    expect(nq.trades[0].side).toBe("LONG");
    expect(nq.openPosition).toEqual({
      side: "LONG",
      quantity: 1,
      avgEntryPrice: 29600,
      entryTimeMs: Date.parse("2026-07-13T14:30:00.000Z"),
    });
  });

  it("splits multi-instrument files into separate pipeline ledgers", () => {
    const csv = [
      HEADER,
      "acct-1,NQU6,NQ,LONG,1,2026-07-13T13:35:00.000000,2026-07-13T13:40:00.000000,300,29500,29510,10,4.68,195.32,WIN,CLOSED,evaluation,DemoBroker",
      // ES: 2 pts x $50 x 1 - 4.10 = 95.90
      "acct-1,ESU6,ES,SHORT,1,2026-07-13T13:45:00.000000,2026-07-13T13:50:00.000000,300,6402,6400,2,4.10,95.90,WIN,CLOSED,evaluation,DemoBroker",
    ].join("\n");
    const result = importTradesFromCsv({ csvText: csv });
    expect(result.perInstrument.map((i) => i.instrument)).toEqual(["ES", "NQ"]);
    expect(result.perInstrument.map((i) => i.realizedPnl)).toEqual([95.9, 195.32]);
  });

  it("rejects files spanning more than one trading account", () => {
    const csv = [
      HEADER,
      "acct-1,NQU6,NQ,LONG,1,2026-07-13T13:35:00.000000,2026-07-13T13:40:00.000000,300,29500,29510,10,4.68,195.32,WIN,CLOSED,evaluation,DemoBroker",
      "acct-2,NQU6,NQ,LONG,1,2026-07-13T14:35:00.000000,2026-07-13T14:40:00.000000,300,29500,29510,10,4.68,195.32,WIN,CLOSED,evaluation,DemoBroker",
    ].join("\n");
    expect(() => importTradesFromCsv({ csvText: csv })).toThrowError(CsvImportError);
    try {
      importTradesFromCsv({ csvText: csv });
    } catch (error) {
      expect((error as CsvImportError).code).toBe("MULTIPLE_ACCOUNTS");
    }
  });

  it("throws INVALID_HEADER when the file is not the warehouse format", () => {
    try {
      importTradesFromCsv({ csvText: "date,symbol,pnl\n2026-07-13,NQ,100" });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CsvImportError);
      expect((error as CsvImportError).code).toBe("INVALID_HEADER");
    }
  });

  it("returns per-row rejections without failing the whole import", () => {
    const csv = [
      HEADER,
      "acct-1,NQU6,NQ,LONG,1,2026-07-13T13:35:00.000000,2026-07-13T13:40:00.000000,300,29500,29510,10,4.68,195.32,WIN,CLOSED,evaluation,DemoBroker",
      "acct-1,NQU6,NQ,LONG,1,2026-07-13T14:35:00.000000,2026-07-13T14:40:00.000000,300,29500,29510,999,4.68,195.32,WIN,CLOSED,evaluation,DemoBroker",
    ].join("\n");
    const result = importTradesFromCsv({ csvText: csv });
    expect(result.summary.parsedRows).toBe(1);
    expect(result.summary.rejectedRows).toHaveLength(1);
    expect(result.summary.rejectedRows[0].line).toBe(3);
    expect(result.perInstrument[0].trades).toHaveLength(1);
  });
});
