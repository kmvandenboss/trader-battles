# Architecture

Trader Battles is architected around one strictly one-directional data flow. Everything in this
document describes what the code does **today**. Two paths ride the same pipeline:

- the original **demo** (100% simulated data, in-memory, the live `/battle` showcase), and
- the **v1 loop** (real, self-reported trades imported by CSV and settled after the fact — see
  "The v1 async loop" below).

Every boundary below is also the seam where a future real integration plugs in — see
[integration-roadmap.md](integration-roadmap.md).

```
mock provider ─┐
               ├→  provider adapter  →  normalized execution event
CSV import  ───┘
   →  validate & dedupe  →  position ledger / account state
   →  battle metrics  →  battle score  →  snapshot  →  UI update
```

Nothing downstream of the provider adapter knows — or can know — whether an event came from the mock
provider, the CSV importer, or a future NinjaTrader/Tradovate/Rithmic adapter. UI components receive
already-computed scores and never compute authoritative scores themselves.

## The v1 async loop (settle after the fact)

The v1 product decision (see [v1-divergences.md](v1-divergences.md)) is a **single-firm (MFFU),
settle-after-the-fact** competition — no live tick loop in the real path:

```
challenge (/challenges)  →  accept  →  SCHEDULED battle window (UTC bounds from an ET session)
  →  both traders trade their real accounts OFF-PLATFORM during the window
  →  after the buzzer, each imports their trade CSV (/battles/[id])
       └→ parseTradeCsv → the EXISTING normalize → dedupe → ledger pipeline → persisted events
  →  settlement: replay persisted events → window-filter → PNL_V1 score → winner → rating
  →  battle COMPLETED; /battles/[id] renders the persisted result
```

Where it plugs into the diagram above: the CSV importer
(`lib/integrations/providers/csv/parseTradeCsv.ts` + `lib/executions/import/importTrades.ts`) is
just another provider adapter emitting `RawExecutionRecord`s — everything from "normalized execution
event" onward is the same code the mock provider feeds. Formats, integrity checks, dedupe, window
rules, and mark-out are documented in [csv-import.md](csv-import.md).

The moving parts, all in `lib/battles/`:

- `battleWindows.ts` — pure ET→UTC window computation (`OPENING_BELL` 9:30–11:00, `MIDDAY`
  11:00–13:00, `AFTERNOON` 13:00–15:30, `FULL_SESSION` 9:30–16:00 ET, with US DST handled
  explicitly).
- `challengeService.ts` — create/accept/decline/cancel a direct challenge; accepting captures both
  traders' current ratings and materializes the `SCHEDULED` battle.
- `settlementService.ts` — `importForBattle` (CSV → pipeline → persisted execution events + an
  honest what-will-count preview), `importMarketBars`, and `settleScheduledBattle` (replay persisted
  events, fetch buzzer marks, run `settleBattle`, persist via `saveSettlement`). Status flow:
  `SCHEDULED → SETTLING → COMPLETED` (`COMPLETED` is the terminal settled state — no separate
  "SETTLED").
- `settleBattle.ts` — the **pure** settlement core: window classification (counted / excluded /
  open-at-buzzer), mark-out reconstruction, `calculatePnlBattleScore` + `resolveBattleWinner`,
  `calculateRatingChange` with `PNL_V1_RATING_CONFIG`, and a human-readable settlement report.
- `serviceErrors.ts` — typed `ServiceError`s with user-facing messages (`WINDOW_NOT_CLOSED`,
  `WAITING_ON_IMPORT`, `CSV_INVALID`, …) that server actions surface verbatim.

### Service layer conventions

The services are **dependency-injected**: every function takes a `Repositories` instance and
explicit timestamps (`createdAt`, `importedAt`, `settledAt`, `today`) — no `Date.now()`, no
randomness, no framework imports, and they never construct repositories themselves. The pure logic
lives elsewhere and is only *called* here, so the services are as testable as the pure modules they
wire together. Server actions (`app/challenges/actions.ts`, `app/battles/[id]/actions.ts`) are the
only place `getRepositories()` and the real clock meet the services.

### Scoring-mode selection

A battle carries a `scoringMode` (`lib/scoring/config.ts` + the `scoring_mode` DB enum, kept in
lockstep by hand):

- **`PNL_V1`** — the active mode for real settled battles: realized PnL ($1 = 1 pt) + capped
  participation bonus + mark-out, ties broken by a cascade. Set by `BattleRepository.create()` on
  every v1 battle.
- **`NORMALIZED_4F`** — the retained demo model (Performance/Risk/Discipline/Consistency, 0–100),
  untouched and still powering the live `/battle` showcase and all seeded history.

Both are documented in [scoring.md](scoring.md). Settlement calls the PNL_V1 engine directly;
nothing dispatches on the stored mode yet — it records how a battle was (or will be) scored.

## Domain model — `lib/data/schema/`

The schema is defined with **Drizzle ORM** (`pg-core`) so the domain types and table shapes are
Postgres-portable. The demo runs fully in-memory; with `DATABASE_URL` set, the same schema backs a
real Neon Postgres (see [database.md](database.md)).

- `enums.ts` — every categorical value as a `const` tuple, deriving both a strict TS union and a
  `pgEnum`: leagues (Bronze→Elite) and divisions, markets (NQ/MNQ/ES/MES/CL/GC), battle
  types/windows, battle statuses (`SCHEDULED → SETTLING → COMPLETED` is the v1 lifecycle;
  `COMPLETED` is the terminal settled state), challenge statuses, scoring modes (`PNL_V1`,
  `NORMALIZED_4F`), execution event types (`FILL`, `PARTIAL_FILL`, order lifecycle events,
  `ACCOUNT_SNAPSHOT`, …), verification statuses (`SIMULATED`, `SELF_REPORTED`, `CLIENT_VERIFIED`,
  `PROVIDER_VERIFIED`, `MANUALLY_REVIEWED`, `DISPUTED`), and integration providers
  (`mock`, `ninjatrader`, `tradovate`, `rithmic`, `csv`).
- `tables.ts` — 16 domain tables: users, trader profiles, firms, trading accounts, integration
  connections, battles, battle participants, challenges, market bars, **execution events** (the key
  future-facing model, including `providerEventId`, `sourceProvider`, `occurredAt`/`receivedAt`,
  `verificationStatus`, and `rawPayload` for audit), account snapshots, battle metric snapshots,
  rating history, achievements, user achievements, notifications. The four Auth.js adapter tables
  live in `authTables.ts`.
- `types.ts` — the app imports `$inferSelect` domain types from here, never ORM objects.

All seeded demo rows carry `verificationStatus: "SIMULATED"`; CSV-imported v1 data carries
`SELF_REPORTED` — see [integrity-and-verification.md](integrity-and-verification.md).

### Seed data — `lib/data/seed/`

The dataset is authored TypeScript built deterministically from master seed `0x7b17c0de`, fanned into
mulberry32 PRNG streams (`rng.ts`). `getSeedDataset()` returns a cached, process-wide singleton; the
build is pure, so every process (dev server, Vercel runtime, tests, scripts) sees identical data:
44 traders, 6 firms, 190 completed battles, 380 participants, rating chains that land on the authored
targets (KevinV: 1,588 → 1,684, exactly +96 this season). `npm run seed` rebuilds it twice, checks
byte-identity and every invariant, and exits non-zero on violations (`validateSeed.ts`).

### Repositories — `lib/data/repositories/`

The **only** data-access surface the rest of the app may use:

- `types.ts` — the `Repositories` interface (trader, battle, challenge, market-data, leaderboard,
  firm, achievement, and notification repositories) plus composite read models (`BattleSummary`,
  `BattleDetail`, `ParticipantSummary`, `ScheduledBattle`, leaderboard queries, history filters) and
  the v1 write models (`CreateBattleInput`, `BattleSettlementInput`, `MarketBarInput`, …). All
  methods are `async` specifically so a network-backed implementation can replace the in-memory one
  without signature changes.
- `inMemory.ts` — the demo implementation, serving the seed dataset (plus in-process v1 writes).
- `postgres/` — the Neon Postgres implementation of the same interface (see
  [database.md](database.md)).
- `derive.ts` — pure derivation and row-building helpers shared by **both** backends (standings,
  leaderboards, percentiles, battle summaries, settlement rows, mark-price selection) so the two
  cannot drift.
- `index.ts` — `getRepositories()` singleton. **This is the swap seam**: `DATABASE_URL` set →
  Postgres; unset → in-memory seed. Zero caller changes either way.

## Integration layer — `lib/integrations/`

- `types.ts` defines the provider contract:
  - `TradingIntegrationProvider` — `connectAccount`, `disconnectAccount`, `getAccountSnapshot`,
    `getHistoricalExecutions`, optional `subscribeToExecutions`.
  - `NormalizedExecutionEvent` — the **only** shape allowed into the pipeline, field-for-field aligned
    with the `execution_events` table (`providerEventId` + `sourceProvider` form the dedupe key;
    `rawPayload` retains the original provider payload for audit/replay).
  - `RawExecutionRecord` — the pre-validation shape adapters emit; the pipeline validates it as if it
    came off the wire.
- `providers/mock/` — **the single source of all demo trading activity**:
  - `scenarioDefinitions.ts` — the three authored, deterministic scenario scripts (a shared NQ price
    tape as anchor points plus both participants' planned trades, each with its own PRNG seed).
  - `mockEventGenerator.ts` — expands a scenario into a battle script: an interpolated price tape and
    raw provider execution events for both participants. It also intentionally **re-delivers one
    duplicate fill per battle** (same `providerEventId`, 30s later) to exercise dedupe the way real
    providers do on reconnects.
  - `mockProvider.ts` — implements `TradingIntegrationProvider` exactly as a real adapter would,
    backed by the scenario scripts. Everything it emits is `SIMULATED`.
- `providers/csv/` — **the first real (self-reported) ingestion source**: `parseTradeCsv.ts`
  (17-column MFFU trade export → validated rows → entry/exit `RawExecutionRecord` fills with
  deterministic event ids) and `parseBarsCsv.ts` (1-minute OHLCV bars for buzzer mark-out). Pure
  parsers with per-row integrity checks; full format reference in [csv-import.md](csv-import.md).
- `providers/ninjatrader|tradovate|rithmic/` — **README stubs only, no implementation.** They exist so
  the plug-in point is explicit.

## Execution pipeline — `lib/executions/`

Pure functions, no I/O; every call returns a new JSON-serializable state.

- `normalizeExecution.ts` — untrusted value in → `NormalizedExecutionEvent` out, or a rejection with
  human-readable reasons (never silent coercion). Handles symbol normalization (futures month codes,
  e.g. `NQU6` → `NQ`).
- `deduplicateExecution.ts` — idempotent intake keyed on `sourceProvider:providerEventId`; each event
  applies at most once. State is a plain serializable object so battle snapshots JSON round-trip.
- `positionLedger.ts` — the account-state stage: consumes fills plus mark-to-market price updates and
  maintains realized/unrealized P&L, the equity curve, peak equity, max drawdown, time in severe
  drawdown, contract peaks, and completed round-trip trades. `toBattleMetrics()` is the **only** place
  the scoring engine's `BattleMetricsInput` is produced.
- `processExecutionEvent.ts` — the pipeline entrypoint and the **only door into account state**:
  normalize → reject/accept → dedupe → ledger. Outcomes are `APPLIED` (fill), `RECORDED` (valid
  non-fill, kept for the audit trail), `DUPLICATE`, or `REJECTED`. `markPipelineToMarket()` applies
  market data (not an execution); `derivePipelineMetrics()` produces scoring input on demand.
- `import/importTrades.ts` — the v1 CSV entrypoint: parse → convert to raw records → run **this
  same pipeline** per instrument, returning ledger trades, open positions, and accept/duplicate/
  reject counts. Its `replayExecutionRecords` is reused by settlement to rebuild state from
  persisted events — imports and re-settles are the same deterministic replay.

## Battles — `lib/battles/`

The v1 modules (`battleWindows`, `challengeService`, `settlementService`, `settleBattle`,
`serviceErrors`) are covered in "The v1 async loop" above. The demo battle engine:

- `battleEngine.ts` — orchestrates a battle from a deterministic **battle script** (price tape + raw
  provider events for both participants), pushing every execution through `processExecutionEvent` and
  calling the scoring engine at every step. Its pure **stepping API** is what any transport drives:
  - `createBattleState(scenarioId, source?)` → initial serializable state
  - `advanceBattle(state, steps?)` → consume the next N timeline items
  - `advanceBattleToTime(state, elapsedMs)` → catch up to a battle-clock time
  - `advanceBattleToEnd(state)` → "finish battle immediately"
  - `getBattleProgress(state)` → clock/progress for the header
  - `getFeedSince(state, afterSequence)` → incremental feed reads
  Every call returns a **new** plain-JSON state, so pause/resume/reset — and a future server-pushed
  snapshot stream — need no engine changes. The state exposes per-participant scores, metrics, P&L,
  drawdown, position, history points, a typed event feed (entries/exits, lead changes, drawdown
  alerts, discipline penalties, time markers, commentary), and a `finalResult` with the winner,
  component breakdowns, rating changes, and "why you won/lost" reasons.
- `battleScript.ts` — the provider-agnostic `BattleScriptSource` contract and registry. The mock
  provider's source is registered as the demo **default**; a live deployment registers a source built
  on a real provider's quote + execution streams, and the engine is none the wiser. Serialized battle
  states carry only the source id, so snapshots stay JSON round-trippable.
- `scenarios.ts` — the presenter-facing registry of the three scenario ids
  (`discipline-beats-raw-profit`, `comeback-victory`, `aggression-backfires`), consumed by Demo
  Controls and `npm run battle`.
- `matchmaking.ts` — deterministic opponent search with the brief's expanding rating window
  (±50 → ±100 → ±175), filtered by market/window/type/account, with shortened demo stages and
  commented plug-in points for future factors (form, smurf detection, completion reliability, …).
- `battleRules.ts` — battle windows/durations, demo account rule sets (e.g. MFFU 50K Rapid: $1,250
  permitted risk / $1,250 daily loss limit / 5 contracts), severe-drawdown threshold (50% of permitted
  risk), alert levels. For live accounts these limits would come from the provider's account snapshot
  instead — everything downstream already consumes the same `BattleRiskLimits` shape.
- `reviewNarrative.ts` — pure projection over already-computed final metric snapshots that derives the
  review page's "why you won/lost" bullets and coaching copy. It compares stored scores; it never
  recomputes them.

## Scoring and ratings — `lib/scoring/`, `lib/ratings/`

Pure, isolated, server-side-authoritative modules with configurable weights; the battle engine
(demo) and settlement (v1) are their only callers, and the UI only ever renders their outputs. Two
scoring modes exist side by side: `calculatePnlBattleScore.ts` (`PNL_V1`, used by v1 settlement,
rated with `PNL_V1_RATING_CONFIG`) and `calculateBattleScore.ts` (`NORMALIZED_4F`, the retained
4-factor demo model). Full detail, including component math, penalties, and worked examples, is in
[scoring.md](scoring.md).

## Real-time update strategy — the BattleClock

`components/battle/useBattleClock.ts` is the **client-side playback transport** and the documented
live-stream seam:

- A 200ms interval advances a presentation playhead at 30× time compression (a 90-minute Opening Bell
  battle plays in ~3 minutes at 1×; speeds 1×/2×/4×) and calls `advanceBattleToTime`. The clock owns
  nothing authoritative — scores, feed, leader, and final results all come from the engine.
- Pause = stop ticking; reset / scenario select = a fresh `createBattleState`. The feed accumulates
  incrementally via `getFeedSince`.
- **To go live**, replace the interval loop with an SSE/WebSocket subscription that delivers engine
  snapshots (or feed deltas) from a server. `BattleClockOutput` stays identical, so no UI component
  changes.

`components/battle/live-battle-screen.tsx` is the only component talking to the clock; all other
battle components are pure renderers of its outputs.

## Implementation notes (demo-specific)

- **The engine is not run server-side in this demo.** A Turbopack production *server*-chunk minifier
  bug mis-inlines `derivePipelineMetrics` (dropping an argument), which would throw if engine scoring
  ran in a production server context. Client chunks minify correctly, so the client-driven `/battle`
  screen is unaffected. Consequently, the standalone `/battle/result` and `/battle/review` pages
  render the **seeded showcase battle** (or any `?battle=<id>`) through the repositories rather than
  replaying the engine on the server. Fix the minifier setting or upgrade Next before adding
  server-side engine replay. The v1 import/settlement path **does** run server-side but never calls
  `derivePipelineMetrics` or the 4-factor engine — PNL_V1 settlement consumes ledger trades
  directly, sidestepping the bug.
- Only the showcase battle (battle-189) has full intra-battle telemetry in the seed; other battles
  carry final metric snapshots only, and the review page degrades honestly (charts/trade table hidden
  with an explanatory note).
- The live `/battle` end overlay reflects the live scenario replay, which can differ from the seeded
  showcase shown by the standalone result/review pages — deliberate, so a live demo battle reads as a
  new battle rather than a duplicate of seeded history.
