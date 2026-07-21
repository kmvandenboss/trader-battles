# Trader Battles

> **Get matched. Trade your account. Beat your opponent.**

Trader Battles is a competitive web app where futures traders are matched in daily 1-on-1 battles and
scored on **normalized** trading performance — not just who made the most dollars. A disciplined trader
with less drawdown can beat an opponent who made more gross profit with reckless risk. It is built to
feel like a premium competitive platform for serious traders, not a trading journal or a casino.

**This build started as an interactive concept demo running on 100% simulated data.** Every seeded
trader, account, trade, battle, and result is generated deterministically in-memory. Nothing connects
live to NinjaTrader, Tradovate, Rithmic, any brokerage, or any prop firm, and no partnership with any
firm or platform is implied. The architecture is designed so real integrations can replace the
simulated data without rewriting scoring, matchmaking, battles, leaderboards, or the UI — see
[docs/integration-roadmap.md](docs/integration-roadmap.md).

**Current direction — MFFU v1.** On top of the demo, the first real v1 loop now exists: optional
Neon Postgres behind the same repository interface ([docs/database.md](docs/database.md)), bridge
auth for real tester accounts ([docs/auth.md](docs/auth.md)), and **settle-after-the-fact battles**
— challenge a trader to a named future window (`/challenges`), trade your real account off-platform,
then import your trades by **CSV** and settle on in-window realized P&L (`/battles/[id]`,
[docs/csv-import.md](docs/csv-import.md)). Imported trades are labeled **self-reported** — never
"Demo Verified", never broker-verified. Scoring for these battles uses the `PNL_V1` mode; the
demo's 4-factor model is retained as a config mode ([docs/scoring.md](docs/scoring.md)). Product
decisions behind this are in [docs/v1-divergences.md](docs/v1-divergences.md).

Nothing in this product claims or implies that users will make money or become profitable by using it.
Battle scores and ratings measure competitive execution quality, not returns.

## Tech stack

- **Next.js** (App Router) + **TypeScript** + **React**
- **Tailwind CSS** + **shadcn/ui** (dark theme by default), **Recharts** for charts
- **Drizzle ORM** schema (Postgres-portable) — but the demo runs **entirely in-memory** behind a
  repository interface; no database driver is installed or required
- **Vitest** for unit tests, **tsx** for scripts
- Deploys to **Vercel** with zero external services

## Quickstart

```bash
npm install
npm run dev        # http://localhost:3000
```

That's it. With no environment variables set, the app runs the pure in-memory demo: no signup and no
login — it opens pre-authenticated as the demo user **KevinV** (Gold II, rating 1,684) — no database
to provision, and no seed step to run first (the deterministic dataset is built in-memory on demand).

Optionally, for the v1 path: set `DATABASE_URL` (Neon Postgres — [docs/database.md](docs/database.md))
and `AUTH_SECRET` (sign-in at `/signin` — [docs/auth.md](docs/auth.md)) per `.env.example` to enable
real tester accounts, challenges, CSV import, and settlement persistence.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run seed` | Rebuilds the deterministic in-memory dataset twice, validates every invariant (volumes, referential integrity, `SIMULATED` labeling, rating chains, determinism) and prints a summary. Exits non-zero on any violation. It does **not** write to a database — there isn't one. |
| `npm test` | Unit tests for scoring, ratings, ledger, pipeline, engine, matchmaking, seed, repositories |
| `npm run battle -- <scenario-id>` | Headless end-to-end battle run: mock provider events → normalization → dedupe → position ledger → metrics → scoring → commentary → final score → rating changes, printed to the terminal |

Scenario ids for `npm run battle` (defined in `lib/battles/scenarios.ts`):

- `discipline-beats-raw-profit` (default) — DeltaHunter out-earns KevinV in dollars but loses on
  normalized score
- `comeback-victory` — KevinV falls behind early, cuts risk, and wins late
- `aggression-backfires` — KevinV sizes up after losses, takes discipline penalties, and loses despite
  briefly holding the P&L lead

## Routes

| Route | Purpose |
|---|---|
| `/` | Home dashboard — rating, league, record, streak, insights, activity feed, "Find a Battle" CTA |
| `/matchmaking` | Configure a battle, search with an expanding rating window, opponent reveal, head-to-head |
| `/battle` | **Live Battle screen** (the centerpiece) — head-to-head scores, price chart, event feed, commentary, Demo Controls (scenario picker, pause, speed, advance, finish, reset). Accepts `?scenario=<id>` |
| `/challenges` | **v1** — challenge a specific trader to a named future window (session date + battle window, account bracket, optional instrument pin); accept/decline incoming challenges; track the scheduled battles they materialize into |
| `/battles/[id]` | **v1** — a scheduled battle: window details, both participants' import status, CSV trade import (self-reported), optional 1-min bars import for buzzer mark-out, the settle control, and the settled PNL_V1 result. See [docs/csv-import.md](docs/csv-import.md) |
| `/signin` | **v1** — sign in / sign up (only when `DATABASE_URL` + `AUTH_SECRET` are set; otherwise the app stays pre-authenticated as the demo user) |
| `/battle/result` | Battle completion screen — winner, scores, rating change, "why you won/lost" |
| `/battle/review` | Deep post-battle analysis — component breakdown, P&L/drawdown/score charts, trade table, timeline, coaching summary. Accepts `?battle=<id>` |
| `/leaderboards` | Filterable rankings (league / market / firm) with the demo user's standing |
| `/history` | Searchable, filterable match history with links to reviews |
| `/profile` | The demo user's competitive profile |
| `/profile/[userId]` | Any seeded trader's profile |
| `/firms/[slug]` | Demo prop-firm team pages (MFFU, Tradeify, Apex, Topstep, …) — demo data, no partnership implied |
| `/leagues` | Bronze → Elite ladder, divisions, promotion/demotion progress |
| `/scoring` | How Scoring Works — in-app explainer of the four weighted components, discipline penalties, the KevinV vs DeltaHunter worked example, and the Elo-style rating change (mirrors [docs/scoring.md](docs/scoring.md)) |
| `/integrations` | Integration roadmap — planned-provider matrix (status / connection / data / verification level), the five drop-in seams, and an explicit "nothing connected, no partnership implied" status (mirrors [docs/integration-roadmap.md](docs/integration-roadmap.md)) |

## Data and the seed process

There is no database. The demo dataset is **authored TypeScript** built deterministically from a master
seed (`0x7b17c0de`) fanned into mulberry32 PRNG streams — the same build produces byte-identical data
every run, in every process. It contains 44 traders, 6 firms, 190 completed battles, rating histories,
achievements, and notifications, all carrying `verificationStatus: "SIMULATED"`.

All reads flow through a **repository interface** (`lib/data/repositories/`); the in-memory
implementation serves the seed dataset today, and a real Postgres (via the existing Drizzle schema in
`lib/data/schema/`) can be swapped in behind the same interface later with zero caller changes.

Live-battle activity comes from a **mock provider** (`lib/integrations/providers/mock/`) — the single
source of all demo trading activity — and passes through the same ingestion pipeline real provider data
would use. See [docs/architecture.md](docs/architecture.md).

## Deploying to Vercel

The app is a standard Next.js project with no external dependencies:

1. Push the repository to Git and import it in Vercel.
2. Framework preset: Next.js. No environment variables, no database, no paid services.
3. Deploy. All data is generated in-memory inside each serverless/runtime process, deterministically —
   every instance sees identical data.

## Non-negotiable product rules

These are enforced throughout the codebase (see `CLAUDE.md`):

1. **Data is labeled by its true source** — one global demo notice plus contextual labels: seeded
   demo data is "Simulated Demo Data" / "Demo Verified"; v1 CSV-imported trades are
   "Self-reported (CSV import)". Demo activity is never presented as real trading, and imported
   trades are never presented as demo-verified or broker-verified.
2. **No gambling language.** Rating movement is a competitive result, never money at risk.
3. **No profitability claims**, explicit or implied.
4. **Scoring and rating logic is server-side and isolated** (`lib/scoring/*`, `lib/ratings/*`) as pure,
   testable functions with configurable weights. UI components receive already-computed scores and
   never compute authoritative scores themselves.
5. **Everything flows through one ingestion pipeline.** Simulated trades become normalized execution
   events and pass through the same pipeline future live data will use; downstream code cannot tell
   mock data from real data.
6. **Determinism.** All simulation and seed randomness is seeded; the same scenario replays identically
   every time.

## Known limitations

- **No live integrations.** NinjaTrader / Tradovate / Rithmic folders are README stubs only; the
  `/integrations` page documents the planned roadmap. The only real ingestion path is the v1 CSV
  import (self-reported); everything else is simulated demo data.
- **V1 is settle-after-the-fact.** Real battles score only after the window closes and both sides
  import; there is no live scoring of real trades. CSV settlement limits (trade-close-granularity
  drawdown, single-position mark-out, one account per file) are documented in
  [docs/csv-import.md](docs/csv-import.md) and [docs/scoring.md](docs/scoring.md).
- **Only the seeded showcase battle** (KevinV vs DeltaHunter, battle-189) carries full intra-battle
  telemetry (execution events, account snapshots, metric timelines). The other 189 seeded battles have
  final metric snapshots only, so their review pages hide the chart/trade sections and say so.
- **Scripted matchmaking.** The demo queue always resolves KevinV to his scripted rival DeltaHunter;
  MES/CL/GC show honestly as having no queued opponents, and all three live scenarios are NQ scripts.
- **The battle engine runs client-side in this demo** (driven by a timed tick loop) rather than on the
  server — a documented workaround for a Turbopack production-minifier issue; the engine itself is a
  pure, transport-agnostic module. See the implementation notes in
  [docs/architecture.md](docs/architecture.md).
- The live battle header shows a neutral "Rating on the line" label until the final bell; the engine
  does not yet expose a projected mid-battle rating movement.
- Historical seed battle scores are authored demo data (internally consistent with the default
  weights), not engine-computed replays.

## Documentation

- [docs/architecture.md](docs/architecture.md) — domain model, ingestion pipeline, module boundaries,
  the v1 async loop, real-time strategy, integration seams
- [docs/scoring.md](docs/scoring.md) — the `PNL_V1` settlement scoring (realized P&L + participation
  bonus + tiebreaker cascade), the retained 4-factor model, and the rating system
- [docs/csv-import.md](docs/csv-import.md) — the accepted CSV formats (trade export + market bars),
  integrity checks, dedupe, and window rules — the reference for v1 testers
- [docs/database.md](docs/database.md) — the optional Neon Postgres backend behind the repository
  interface
- [docs/auth.md](docs/auth.md) — the bridge auth (Auth.js) and the demo-user fallback
- [docs/v1-divergences.md](docs/v1-divergences.md) — the product decisions behind v1
- [docs/integration-roadmap.md](docs/integration-roadmap.md) — how real providers plug in later
- [docs/integrity-and-verification.md](docs/integrity-and-verification.md) — verification states,
  labeling policy, and how a production version would handle integrity
- [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md) — the original product brief
