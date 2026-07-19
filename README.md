# Trader Battles

> **Get matched. Trade your account. Beat your opponent.**

Trader Battles is a competitive web app where futures traders are matched in daily 1-on-1 battles and
scored on **normalized** trading performance — not just who made the most dollars. A disciplined trader
with less drawdown can beat an opponent who made more gross profit with reckless risk. It is built to
feel like a premium competitive platform for serious traders, not a trading journal or a casino.

**This build is an interactive concept demo running on 100% simulated data.** Every trader, account,
trade, battle, and result is generated deterministically in-memory. Nothing connects to NinjaTrader,
Tradovate, Rithmic, any brokerage, or any prop firm, and no partnership with any firm or platform is
implied. The architecture is designed so real integrations can replace the simulated data later without
rewriting scoring, matchmaking, battles, leaderboards, or the UI — see
[docs/integration-roadmap.md](docs/integration-roadmap.md).

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

That's it. There is no signup and no login — the app opens pre-authenticated as the demo user
**KevinV** (Gold II, rating 1,684). There are **no required environment variables**, no database to
provision, and no seed step to run first (the deterministic dataset is built in-memory on demand).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build (13 app routes; Next reports 14 including its auto `_not-found` route) |
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

1. **All data is simulated and labeled as such** — one global demo notice plus contextual
   "Simulated Demo Data" / "Demo Verified" labels. Demo activity is never presented as
   provider-verified trading.
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

- **No real integrations.** NinjaTrader / Tradovate / Rithmic folders are README stubs only; the
  `/integrations` page documents the planned roadmap, but nothing is connected — all data is simulated.
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
  real-time strategy, integration seams
- [docs/scoring.md](docs/scoring.md) — the 0–100 battle score, component math, penalties, worked
  example, rating system
- [docs/integration-roadmap.md](docs/integration-roadmap.md) — how real providers plug in later
- [docs/integrity-and-verification.md](docs/integrity-and-verification.md) — verification states,
  labeling policy, and how a production version would handle integrity
- [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md) — the original product brief
