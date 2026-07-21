# CSV import — accepted formats (v1)

The authoritative reference for testers importing real trades into a v1 battle. Two CSV formats are
accepted, both parsed by `lib/integrations/providers/csv/`:

1. **Trade export** — your MFFU trade history, one row per round-trip trade. Uploaded per battle on
   `/battles/[id]` ("Import your trades").
2. **1-minute market bars** — optional OHLCV data used **only** to mark positions still open at the
   window close ("Market data for mark-out" on the same page).

Everything imported is labeled **`SELF_REPORTED`** ("Self-reported (CSV import)") — never
`SIMULATED`, never "Demo Verified", and never claimed to be broker-verified. See
[integrity-and-verification.md](integrity-and-verification.md).

## Trade export format

Parser: `parseTradeCsv.ts`. The header (line 1) must contain **all 17 columns** — a missing column
rejects the whole file with the missing names listed. Column names are case-insensitive; extra
columns are tolerated; `\r\n` line endings, blank lines, and double-quoted cells are handled.

```
trading_account_id,asset,asset_code,short_long,total_contracts,open_datetime,close_datetime,seconds_held,avg_market_entry,avg_market_close,market_profit,commission_and_fees,net_profit,winner_loser,status,stage,broker
```

| Column | Meaning / units |
|---|---|
| `trading_account_id` | The MFFU trading account the trades belong to. **One account per file** — a file spanning multiple account ids is rejected whole (`MULTIPLE_ACCOUNTS`). |
| `asset` | Raw contract symbol as exported, e.g. `NQU6` — resolved to a supported market (below). |
| `asset_code` | Not used for resolution; kept in the audit payload. |
| `short_long` | `SHORT` or `LONG` (case-insensitive). |
| `total_contracts` | Positive integer contract count for the round trip. |
| `open_datetime` / `close_datetime` | **Naive-UTC** timestamps (no offset — the warehouse convention; `2026-07-13T13:30:07.153000` means 13:30 UTC = 9:30 ET). A `Z` is appended; values that already carry an offset pass through as-is. `close_datetime` must not precede `open_datetime`. |
| `seconds_held` | Informational; kept in the audit payload. |
| `avg_market_entry` / `avg_market_close` | Average fill prices (positive numbers). |
| `market_profit` | Result in **points** (per contract): `close − entry` for LONG, `entry − close` for SHORT. |
| `commission_and_fees` | **Dollars**, ≥ 0 (empty → 0). |
| `net_profit` | Result in **dollars, net of fees**: `points × pointValue × contracts − commission_and_fees`. |
| `winner_loser` | Informational; kept in the audit payload. |
| `status` | `CLOSED` = completed round trip. `OPEN` (or a row missing `close_datetime` / `avg_market_close`) = still open at export time — only its entry fill is emitted. |
| `stage` / `broker` | Informational (evaluation stage, broker); kept in the audit payload. |

### Supported instruments

Resolution and point values come from the pipeline (`resolveInstrument` in
`lib/executions/normalizeExecution.ts`, `MARKET_SPECS` in `lib/executions/positionLedger.ts`):

| Market | $ per point per contract | Tick |
|---|---|---|
| NQ | $20 | 0.25 |
| MNQ | $2 | 0.25 |
| ES | $50 | 0.25 |
| MES | $5 | 0.25 |
| CL | $1,000 | 0.01 |
| GC | $100 | 0.10 |

Dated contract symbols resolve to their market: `NQU6` → NQ, `MESZ26` → MES. Matching is
longest-symbol-first (so `MNQU6` resolves to MNQ, not NQ) and accepts an optional month code
(`F G H J K M N Q U V X Z`), up to four digits, and a space/`-`/`_` separator. Any other symbol is
rejected: `unsupported instrument "..."`.

### How a row becomes pipeline fills

Each **CLOSED** row is converted into **two fills** (`tradeRowsToRawExecutionRecords`) and pushed
through the **existing** ingestion pipeline — `normalizeExecution → deduplicateExecution →
positionLedger` — exactly like mock-provider data (`lib/executions/import/importTrades.ts`):

- **Entry fill** at `avg_market_entry`, commission **0**.
- **Exit fill** at `avg_market_close`, carrying the **full** `commission_and_fees`.

The ledger reconstructs the round trip, so its realized PnL for the trade equals `net_profit`
**exactly, to the cent**. An **OPEN** row emits the entry fill only, leaving an open position in the
ledger (a mark-out candidate at settlement). At identical timestamps, exit legs replay before entry
legs so back-to-back round trips don't merge.

### Deterministic dedupe — re-imports are safe

Each fill's `providerEventId` is a pure function of the row's own content:

```
csv:<account>:<open_datetime>:<close_datetime|open>:<side>:<contracts>:<entry>:<close|na>:<entry|exit>
```

The pipeline dedupes on `sourceProvider:providerEventId`, and persistence
(`saveImportedExecutions`) skips any event whose `(sourceProvider, providerEventId,
tradingAccountId)` is already stored. Re-importing the same file — or an overlapping later export —
adds **zero** new events and never double-counts. (Two byte-identical rows in one file collide to
one trade; with microsecond timestamps that means a genuinely duplicated export row.)

### Per-row integrity checks and rejections

Before any record is emitted, every row must pass three integrity checks (plus the field
validations above):

1. **Instrument supported** — the symbol resolves to a market with a known point value.
2. **Points recompute** — the prices must imply `market_profit`: `|recomputed − market_profit| ≤
   0.01` points. Catches wrong side/price/format drift.
3. **Dollars recompute** — `points × pointValue × contracts − fees` must match `net_profit` within
   **$0.05**. Catches wrong multipliers (e.g. an MNQ trade labeled NQ).

A failing row is **rejected with its line number and a reason carrying the actual numbers**, e.g.:

```
line 7: net_profit integrity check failed: 12.5000 pts x $2/pt x 3 contracts - $2.10 fees = $72.90 but the file says $729 (instrument MNQ)
```

Per-row rejections don't abort the import — valid rows still load, and the rejected rows are listed
in the result. Only two problems reject the **whole file**: a bad header (`INVALID_HEADER`) and
multiple account ids (`MULTIPLE_ACCOUNTS`). A file with zero valid rows imports nothing and says so
(`EMPTY_IMPORT`).

## Market-bars format

Parser: `parseBarsCsv.ts`. 1-minute OHLCV bars, header required:

```
timestamp,open,high,low,close,volume
2026-07-13 12:00:00+00:00,29742.0,29752.0,29726.5,29728.25,365
```

- `timestamp` is the bar's **start**; a space separator is normalized to `T`, an explicit offset is
  honored, and a naive timestamp is treated as UTC (same convention as trades).
- Each bar is sanity-checked (`low ≤ open/close ≤ high`, positive prices, finite non-negative
  volume); bad bars are rejected with line + reason, never silently coerced.
- Bars upsert per `(instrument, barStart)` — re-imports replace, never duplicate.

### What bars are used for

**Only** marking out positions still open at the window close. Settlement asks for the **close of
the latest bar at or before the window end, no older than 5 minutes**
(`MarketDataRepository.getMarkPrice`; `MARK_PRICE_MAX_AGE_MS` in `lib/data/repositories/derive.ts`).

- Fresh bar available → the open position is "closed at the buzzer" at that price and the mark-out
  PnL is added to the score (`markOutStatus: MARKED`).
- No fresh bar → the position is **excluded from the score and noted**
  (`markOutStatus: EXCLUDED_NO_MARK`) — the honest path, never a guess.

**Battle P&L may differ from account P&L.** The buzzer close-out is hypothetical — your real account
kept (or later closed) the position at different prices. The UI labels this wherever mark-out PnL
appears.

## Window rules — what counts

Settlement (`lib/battles/settleBattle.ts`) classifies every reconstructed trade against the battle
window `[startAt, endAt]`:

| Trade | Treatment |
|---|---|
| Entered **and** exited in-window | **Counted** — realized PnL enters the score. |
| Entered **before** the window opened | **Excluded entirely**, even if it exited in-window (kills the green-day selection exploit — scoring starts at battle start). |
| Entered **at/after** the buzzer | Excluded. |
| Entered in-window, exited **after** the buzzer | Open at the buzzer — reconstructed as open exposure (full size at average entry; pre-buzzer partial exits aren't visible in round-trip data) and marked out via bars. |
| Still `OPEN` in the export, entered in-window | Open at the buzzer — marked out via bars. |

Every exclusion is itemized with a reason in the settlement report. If open exposure spans multiple
instruments or sides, v1 marks out only the largest single-instrument, same-side position; the rest
is excluded with explicit notes.

## Verification labeling

`sourceProvider` is `csv`, and the normalizer defaults its verification status to **`SELF_REPORTED`**
(`PROVIDER_DEFAULT_VERIFICATION` in `normalizeExecution.ts`). Settled v1 battles persist
`SELF_REPORTED` too. Imported trades are never labeled `SIMULATED`, "Demo Verified", or
provider-verified — those labels belong to seeded demo data and future verified integrations
respectively.
