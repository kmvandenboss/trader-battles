# Database (v1) — Neon Postgres behind the repository interface

The demo runs with **zero external services**: when `DATABASE_URL` is unset,
`getRepositories()` (`lib/data/repositories/index.ts`) serves the deterministic
in-memory seed dataset, exactly as before. Setting `DATABASE_URL` switches the
same interface to a real Postgres (Neon) implementation — **no caller changes**
anywhere in `app/`, `components/`, or the engines.

## Why Neon, and why it stays portable

Neon is standard Postgres. The schema (`lib/data/schema/tables.ts`, Drizzle
pg-core), the committed migrations (`drizzle/`), and the repository
implementation (`lib/data/repositories/postgres/`) contain nothing
Neon-specific except the driver in
`lib/data/repositories/postgres/client.ts` (`drizzle-orm/neon-http` +
`@neondatabase/serverless`, which works on Vercel serverless with Neon's
pooled connection string). Migrating to MFFU's own Postgres later means
swapping that one driver file — schema, migrations, repositories, and every
caller stay untouched.

## Setup

1. Create a Neon project and copy both connection strings.
2. `cp .env.example .env.local` and set:
   - `DATABASE_URL` — the **pooled** string (host contains `-pooler`); used by
     the app at runtime and by `db:seed`.
   - `DATABASE_URL_UNPOOLED` — the **direct** string; preferred by drizzle-kit
     for migrations (falls back to `DATABASE_URL` when unset).
3. Apply the schema: `npm run db:migrate`
4. Load the demo dataset: `npm run db:seed`
5. `npm run dev` — the app now reads from Postgres.

Unset `DATABASE_URL` (or just don't create `.env.local`) to return to the
in-memory demo. Next.js loads `.env.local` automatically; the CLI commands
(`db:migrate`, `db:push`, `db:seed`) read it via a tiny loader in
`scripts/load-env.ts` — no dotenv dependency.

## Scripts

| Script | What it does |
|---|---|
| `npm run db:generate` | Regenerate SQL migrations in `drizzle/` from the schema (offline — no database needed). |
| `npm run db:migrate` | Apply committed migrations to the database in `DATABASE_URL_UNPOOLED` (falls back to `DATABASE_URL`). |
| `npm run db:push` | Push the schema directly without migration files (dev-branch convenience only). |
| `npm run db:seed` | Load the deterministic demo dataset into Postgres. **Scoped delete-and-insert**: deletes exactly the seed dataset's rows by their seed-authored ids (children first) and re-inserts them; **real accounts and their data are never touched**, and the shared reference tables real rows point at (firms, achievements) are upserted in place. Rows from an older seed version can linger — for a clean slate, reset a fresh database/branch and re-seed. Fails with a clear message when `DATABASE_URL` is unset. |

## How the env switch works

```
getRepositories()                       (lib/data/repositories/index.ts)
  ├─ DATABASE_URL set   → createPostgresRepositories(url)   (postgres/)
  └─ DATABASE_URL unset → createInMemoryRepositories(seed)  (inMemory.ts)
```

- The selection happens once per process (singleton) and is server-side only —
  repositories are never imported by client components.
- The Postgres module does **not** connect at import time; `npm run build`
  succeeds with no `DATABASE_URL` and no reachable database.
- Both implementations import the same pure derivation helpers
  (`lib/data/repositories/derive.ts`) for leaderboards, standings,
  percentiles, firm records, and battle summaries — derived from traders +
  battles at read time, never stored — so the two backends cannot drift.

## Migration 0002 — the v1 battle loop (Phase D)

`drizzle/0002_bumpy_loki.sql` adds the schema for challenges → scheduled windows → CSV import →
settlement (see [architecture.md](architecture.md) and [csv-import.md](csv-import.md)):

- **New tables**
  - `challenges` — challenger/opponent, `challenge_status` (`PENDING / ACCEPTED / DECLINED /
    CANCELLED / EXPIRED`), the proposed `session_date` + `battle_window`, optional `market` pin,
    `account_bracket`, message, and a `battle_id` link filled in when an accept materializes the
    battle.
  - `market_bars` — imported 1-minute OHLCV bars, unique per `(instrument, bar_start)`, used only
    for buzzer mark-out prices.
- **New enums / values**
  - `challenge_status` and `scoring_mode` (`PNL_V1`, `NORMALIZED_4F`) enums.
  - `battle_status` gains **`SETTLING`** (between `SCHEDULED` and `COMPLETED`). There is
    deliberately **no separate "SETTLED" status — `COMPLETED` is the terminal settled state** for
    both demo battles and v1 async-settled battles, so every existing status check keeps working.
  - `integration_provider` gains **`csv`** (the first real, self-reported ingestion source).
- **`battles` columns** — `scheduled_end`, `scoring_mode` (column default `NORMALIZED_4F` for
  legacy/demo rows; the v1 repository `create()` sets `PNL_V1`), `account_bracket`, `decided_by`
  (the tiebreaker-cascade tier that decided it), `resolution_detail`; `market` becomes nullable
  (open instrument choice).
- **`battle_participants` columns** — the PNL_V1 settlement outputs: `realized_pnl`,
  `participation_bonus`, `closed_trade_count`, `gross_profit` / `gross_loss` (loss stored positive —
  never a profit factor, which can be `Infinity`), `mark_out_pnl` / `mark_out_status` /
  `mark_out_note`. Because participants now exist from scheduling time, the outcome columns
  (`trading_account_id`, `ending_rating`, `final_score`, `result`) become nullable — they are
  guaranteed set once a battle is `COMPLETED`.

### Repository surface added for v1

Both backends (in-memory and Postgres) implement the same additions in
`lib/data/repositories/types.ts`; the row-building logic is shared in `derive.ts` so they cannot
drift:

- **`BattleRepository`** — `create` (SCHEDULED PNL_V1 battle + two participant rows),
  `listScheduledForUser` / `getScheduledById` (metrics-free composites), `updateStatus`,
  `saveImportedExecutions` / `listImportedExecutions` (idempotent on
  `(sourceProvider, providerEventId, tradingAccountId)`), and `saveSettlement` — one call persists
  participant outcomes, battle result columns, final metric snapshots, rating-history rows, and
  profile rating/record/streak updates. **Idempotent**: re-settling replaces the prior settlement
  rows (deterministic ids) and reverses the prior W/L contribution first.
- **`ChallengeRepository`** — `create`, `getById`, `listForUser` (incoming/outgoing), `respond`,
  `linkBattle`.
- **`MarketDataRepository`** — `saveBars` (upsert per `(instrument, barStart)`), `getMarkPrice`
  (freshest bar close within 5 minutes of the requested time, else null), `hasBars`.
- **`TraderRepository.findOrCreateCsvAccount`** — binds a CSV `trading_account_id` to a user's
  `SELF_REPORTED` trading account (provider `csv`), created on first import.

## Semantics notes (Postgres impl)

- **Timestamps**: the schema uses `timestamp(..., { mode: "string" })`.
  Postgres returns `"2026-07-17 16:00:00+00"`; the Postgres impl normalizes
  every timestamp back to the ISO-8601 shape the in-memory impl serves
  (`"2026-07-17T16:00:00.000Z"`, see `postgres/rows.ts`) so date filtering,
  sorting, and formatting behave identically.
- **Ordering**: every ranking/sort uses the shared comparators. Rows are
  loaded with deterministic primary-key ordering, so stable-sort ties resolve
  by id on Postgres (the in-memory impl resolves them by seed authoring
  order). With the current dataset no user-visible ordering differs — there
  are no rating ties — and all callers resolve battle participants by
  `userId`, never by tuple position. The achievements catalog is returned in
  id order on Postgres vs authoring order in memory.
- **Verification labeling**: `db:seed` loads only `SIMULATED` (Demo Verified)
  rows and stores no secrets or tokens. Real imported trades (Phase D CSV)
  carry `SELF_REPORTED` — never `SIMULATED`, never "Demo Verified". See
  [csv-import.md](csv-import.md).
