# CLAUDE.md — Trader Battles

This file is read automatically at the start of every Claude Code session. Treat everything here as
binding project rules. The full product brief lives at `docs/PRODUCT_BRIEF.md` — read it before making
structural decisions.

---

## What we are building

**Trader Battles** — a competitive web app where futures traders are matched in daily 1-on-1 battles and
scored on *normalized* trading performance (not just who made the most dollars). It should feel like a
premium competitive gaming platform for serious traders, not a trading journal or a casino.

This first build is a **functional demo with 100% simulated data**. There are no real brokerage,
prop-firm, or execution-platform connections yet. But the architecture must let real integrations replace
the simulated data later **without rewriting** scoring, matchmaking, battles, leaderboards, or UI.

The one-line pitch: *Get matched. Trade your account. Beat your opponent.*

---

## Non-negotiable rules (do not violate)

1. **All data is simulated.** Label it as `Simulated Demo Data` / `Demo Verified`. Never present demo
   activity as real provider-verified trading. One global demo notice + contextual labels — not
   disclaimers on every element.
2. **No gambling language, ever.** Never use: bet, wager, jackpot, odds, stake (as in money), cash game,
   pot. Rating movement is *not* a financial stake. This is competition, not gambling.
3. **No profitability claims.** Nothing in the product may claim or imply users will make money or become
   profitable by using it.
4. **Scoring and rating logic is server-side and isolated.** UI components receive already-computed
   scores. They must never compute authoritative scores themselves. All scoring lives in `lib/scoring/*`
   and rating in `lib/ratings/*` as pure, testable functions with configurable weights.
5. **Everything flows through the ingestion pipeline.** Simulated trades become *normalized execution
   events* and pass through the same pipeline future live data will use. The battle/scoring engine must
   not know or care whether an event came from the mock provider or a future real one.
6. **Determinism.** Simulations use seeded randomness so the same demo scenario replays identically every
   time. No `Math.random()` without a seed.

---

## Locked technical decisions

Do not re-litigate these unless the user asks.

- **Framework:** Next.js (App Router) + TypeScript + React.
- **Styling:** Tailwind CSS + shadcn/ui. Dark theme by default, strong contrast, restrained accents,
  clean typography. Desktop-first, mobile-responsive.
- **Charts:** Recharts.
- **Data layer for the demo:** deterministic seed data authored as TypeScript, served through a
  **repository interface** (e.g. `lib/data/repositories/*`). Define the schema with **Drizzle ORM** so
  the domain types and table shapes are Postgres-portable — but the demo itself does **not** require a
  running database. A real Postgres can be dropped in behind the same repository interface later. This
  keeps the demo trivially runnable and Vercel-deployable with zero external services.
- **Live updates:** a client-side timed "tick" loop drives each battle, but every tick calls the same
  pure `lib/executions/*` and `lib/scoring/*` functions the real pipeline uses. Hide this behind a small
  `BattleClock`/transport abstraction so it can later be swapped for SSE or a real event stream without
  touching UI or scoring.
- **Deploy target:** Vercel. No paid external services required for the demo.

---

## Architecture invariants

The data flow is strictly one-directional:

```
mock provider  →  provider adapter  →  normalized execution event
   →  validate & dedupe  →  position ledger / account state
   →  battle metrics  →  battle score  →  snapshot  →  UI update
```

Keep these boundaries as separate modules:

```
lib/
  integrations/
    types.ts                     # TradingIntegrationProvider interface (see brief)
    providers/mock/              # mockProvider.ts, mockEventGenerator.ts (ONLY source of demo data)
    providers/ninjatrader|tradovate|rithmic/  # README stubs only, no impl
  executions/
    normalizeExecution.ts        # provider event -> NormalizedExecutionEvent
    deduplicateExecution.ts
    positionLedger.ts            # position + realized/unrealized P&L + drawdown
    processExecutionEvent.ts     # the pipeline entrypoint
  battles/
    battleEngine.ts              # orchestrates a battle from events
    matchmaking.ts
    battleRules.ts
  scoring/
    calculateBattleScore.ts      # combines the four components with configurable weights
    calculatePerformanceScore.ts
    calculateRiskScore.ts
    calculateDisciplineScore.ts
    calculateConsistencyScore.ts
  ratings/
    calculateRatingChange.ts     # Elo-style; margin + rule violations factor in; raw P&L must NOT dominate
  data/
    repositories/                # swappable data access
    seed/                        # deterministic seed authoring
```

**The mock provider is the single source of all demo activity.** Do not scatter dummy-data generation
into UI components or the scoring engine.

## Scoring model (default weights — must stay configurable)

- Performance 40% · Risk efficiency 25% · Discipline 20% · Consistency 15%. Score is 0–100.
- The whole point: a disciplined trader with less drawdown can beat someone who made more gross dollars
  with reckless risk. Verify the worked examples in the brief still hold (KevinV 83.9 beats DeltaHunter
  73.6). Full detail goes in `docs/scoring.md`.

---

## Build order

Foundations must exist before the showpiece. Build in this order, and get to a runnable UI early:

1. **Scaffold** — Next.js + TS + Tailwind + shadcn, folder structure above, dark theme, demo notice.
2. **Domain model + Drizzle schema + repository interface** (types first).
3. **Deterministic seed data** — ≥40 traders, ≥5 firms, ≥150 battles, ratings/badges/notifications.
4. **Scoring + rating engines** — pure functions + unit tests + worked examples passing.
5. **Mock provider + execution pipeline + battle engine** — with the 3 seeded scenarios.
6. **Live Battle screen** (the centerpiece) — head-to-head, chart, event feed, commentary, Demo Controls.
7. **Matchmaking flow** — queue → opponent reveal → head-to-head → battle start.
8. **Home dashboard**, then **battle result + review**.
9. **Leaderboards, trader/firm profiles, leagues, match history.**
10. **Docs** (README, architecture, scoring, integration-roadmap, integrity-and-verification).
11. **Polish.**

> Note on the brief's "Development Priorities" list: that ranks product *importance* (live battle first).
> This build *order* front-loads the foundations the live battle depends on. Same destination.

---

## The demo user (pre-authenticated, no signup)

`KevinV` · Gold II · rating 1,684 · season 18–11 · streak 3W · primary NQ, secondary ES · firm MFFU ·
style Balanced · discipline 84 · risk 79 · performance 76. Give this user real history, badges, trends.

Example opponent seed: `DeltaHunter` · Gold I · 1,712 · 21–13 · NQ · Aggressive · firm Tradeify.

---

## Conventions

- Strong TypeScript types everywhere; no `any` in domain/scoring/pipeline code.
- Pure functions for scoring/rating/ledger — no I/O, no framework imports — so they're unit-testable.
- Prefer clarity over cleverness. Small files, reusable components.
- When you add a new module boundary, note in the file header where future real integrations plug in.
- Keep the four demo firms (MFFU, Tradeify, Apex, Topstep) clearly labeled as demo data; imply no real
  partnership. Do not use insulting or unserious trader names.

## Working style

- Delegate specialist work to the subagents in `.claude/agents/` (scoring, simulation, ui, data/seed,
  docs, qa). Keep scoring/rating changes inside the scoring-engine agent's scope.
- After each phase, run the qa-reviewer agent against the MVP acceptance criteria in the brief.
- Prefer running the app and showing something working over adding breadth.

## Commands

```
npm run dev        # local dev server
npm run seed       # regenerate deterministic seed data
npm run build      # production build (must pass before "done")
npm run lint
npm test           # scoring/rating/ledger unit tests
```
