# Next session — MFFU v1 implementation plan

> Read first: `CLAUDE.md`, `docs/v1-divergences.md` (the decisions), then `docs/handoffs/STATE.md`
> (what the demo already is + gotchas). This doc is the ordered work plan to turn the completed demo
> into the first real MFFU v1. Update `STATE.md` and this doc after each phase, commit per phase, and
> run `qa-reviewer` before calling a phase done — same cadence as the phase 0–11 build.

## What v1 is (the shape to build toward)

A **single-firm (MFFU), settle-after-the-fact** competition. Lifecycle of a battle:

```
create match OR challenge  →  window scheduled (timeframe + session, instrument open)
  →  traders trade their real MFFU accounts off-platform during the window
  →  after the window closes, each trader's trades are imported (CSV in v1)
  →  trades filtered to [window.start, window.end], scored, ratings updated
  →  result + review screens show the settled battle
```

No live tick loop in the v1 path. Scoring is **straight realized PnL + capped participation bonus +
tiebreaker cascade** (see `v1-divergences.md` → Scoring for exact values). Real users sign in and hold
real accounts; the seeded demo (KevinV et al.) stays as a fallback/showcase.

## Guardrails that still bind (from CLAUDE.md)

- Scoring stays **server-side, isolated, pure** (`lib/scoring/*`), config-driven. UI never computes
  authoritative scores. **Add** the v1 PnL mode; do **not** delete the 4-factor engine.
- All trade data flows through the **ingestion pipeline** (`lib/executions/*`). CSV import is just
  another source emitting `RawExecutionRecord`s — the pipeline can't tell it from the mock provider.
- Reads go through the **repository interface** (`lib/data/repositories/*`). Postgres is a new impl
  behind it, not a new access pattern in callers.
- Imported trades are **not** `SIMULATED` and **not** provider-verified — label as `SELF_REPORTED` /
  `CLIENT_VERIFIED` with honest UI copy. Don't call real imported trades "Demo Verified."
- No gambling language; no profitability claims.

## Suggested order

A and later phases build on each other, but **B (Postgres) and C (Auth) can run in parallel** — they're
independent. **D (CSV import + battle settlement) depends on A, B, and C.** Do A first (pure, testable,
no infra), stand up B+C, then D ties it together.

---

### Phase A — V1 scoring mode (owner: `scoring-engine` agent) — ✅ DONE

Shipped as specced (see STATE.md "Phase A decisions" for the API + the decisions made): pure
`lib/scoring/calculatePnlBattleScore.ts` + `resolveBattleWinner`, `PnlScoringConfig` + `ScoringMode`
in config, 26 tests (167 total), QA pass with no blockers, 4-factor engine untouched. Phase D
notes: persist gross profit/loss rather than a possibly-`Infinity` profitFactor; `settleBattle.ts`
consumes the `ScoringMode` selector (nothing dispatches on it yet).

Additive to the existing scoring engine. **Do not modify** the 4-factor component math.

1. New pure module `lib/scoring/calculatePnlBattleScore.ts`:
   - Input: a participant's window-filtered realized trades (+ any marked-out open position), account
     bracket. Output: `{ score, realizedPnl, participationBonus, closedTradeCount, tiebreakers }`.
   - Score = realized PnL dollars ($1 = 1pt) + participation bonus.
   - Participation bonus = `pointsPerTrade * min(closedTrades, maxTrades)` — defaults
     `pointsPerTrade = 5`, `maxTrades = 3` (cap +15). Pull from config, don't hard-code.
   - Emit tiebreaker fields: `profitFactor`, `winningTradeCount`, `tookTrade`, `firstGreenAtMs`.
2. `resolveBattleWinner(a, b)` implementing the cascade: PnL → profit factor → winning trades →
   took ≥1 trade → earliest first-green. Pure, returns winner + reason.
3. Config: add a `PnlScoringConfig` (pointsPerTrade, maxTrades) to `lib/scoring/config.ts` and a scoring
   **mode** selector so a battle can request `"PNL_V1"` vs `"NORMALIZED_4F"`. Default real battles to
   `PNL_V1`.
4. Unit tests (`tests/`): bonus caps at 3 trades; a trader who trades to −$3 beats a flat 0; PnL gap
   dominates the bonus in a decisive battle; both-flat resolved by the cascade; mark-out counted.
5. Gates: `npm test`, `npm run lint`. QA the scoring change.

### Phase B — Neon Postgres behind the repository interface (owner: `data-seed` agent)

The Drizzle schema already exists and is Postgres-shaped (`lib/data/schema/`). This is wiring + a new
repository impl, **zero caller changes**.

1. Deps: `drizzle-kit` (dev) + a Neon driver (`@neondatabase/serverless`, or `postgres` for a plain
   connection). Add `drizzle.config.ts` pointing at the existing schema.
2. `DATABASE_URL` env (Neon connection string). Document `.env.local` setup + that Neon is standard
   Postgres so it migrates to MFFU's DB later untouched.
3. Generate + apply the initial migration from the current schema. Add `npm run db:generate` /
   `db:migrate` / `db:push` scripts.
4. New `lib/data/repositories/postgres/` implementing the `Repositories` interface against Neon.
5. `getRepositories()` selects impl by env (in-memory seed when no `DATABASE_URL`; Postgres when set) so
   the demo still runs with zero external services and Vercel deploys unchanged.
6. Optional: a seed-to-Postgres script to load the demo dataset into a real DB for testing.
7. **Gotcha (STATE.md):** the Turbopack prod server-chunk minifier mis-inlines
   `derivePipelineMetrics` when the *battle engine* runs server-side. DB reads are unaffected; just don't
   run the engine in a server/prerender context. If Phase D settlement runs the engine server-side, fix
   this first (next.config minifier setting or Next upgrade) — verify with `next build && next start`.
8. Gates: `npm run build`, `npm run lint`, an integration smoke against a Neon dev branch.

### Phase C — Bridge auth (owner: `data-seed` for schema + `frontend-ui`/`general-purpose` for wiring)

Minimal, replaceable — this is a bridge until MFFU's real identity system owns login.

1. Deps: `next-auth@beta` (Auth.js v5) + `@auth/drizzle-adapter`.
2. Add Auth.js tables (users / accounts / sessions / verificationTokens) to the Drizzle schema. Relate
   an auth `user` to a **trader profile** (the existing domain trader/participant identity) — decide the
   mapping: one auth user ↔ one trader row, with the trader carrying MFFU account info.
3. A thin `getCurrentUser()` / `getCurrentTrader()` seam. **Find and replace the hardcoded demo user**
   (KevinV is currently the pre-authenticated identity — locate the constant/accessor and route it
   through the session). Fall back to the seeded demo user when unauthenticated, so the showcase still
   works.
4. Auth method: email magic-link or credentials — enough to create a handful of real tester accounts.
   Keep provider config minimal.
5. Gates: sign up, sign in, session-scoped identity resolves through the seam; `npm run build`, lint.

### Phase D — CSV trade import → battle windows → settlement (owner: `simulation-engine` for the import/pipeline path, `frontend-ui` for screens, `data-seed` for the battle/challenge tables)

Ties A+B+C together. This is the real v1 loop.

1. **Battle + challenge model** (schema + repos): a `Battle` with a window (`startAt`, `endAt`, session,
   timeframe, optional instrument), participants, account-size bracket, `status`
   (`SCHEDULED → SETTLING → SETTLED`), and result. A `Challenge` (challenger, opponent, proposed window,
   `accepted`) that materializes into a Battle on accept. Matchmaking can also create a Battle.
2. **CSV import path** (`lib/integrations/providers/csv/` or `lib/executions/import/`): parse an uploaded
   CSV into `RawExecutionRecord[]`, then run the **existing** `normalizeExecution → dedupe →
   processExecutionEvent` pipeline. Document the accepted CSV format (account id, instrument, side, qty,
   price, timestamp UTC, commission; and how a round-trip trade / open-position mark is represented).
   Verification status = `SELF_REPORTED`/`CLIENT_VERIFIED`.
3. **Settlement** (`lib/battles/settleBattle.ts`, pure): given a battle window + each participant's
   imported trades, filter realized round-trips to `[startAt, endAt]`, run Phase A's `PNL_V1` scoring +
   `resolveBattleWinner`, apply the existing rating change, persist a `BattleResult`. Idempotent /
   re-runnable (re-import shouldn't double-count — the pipeline already dedupes).
4. **Screens** (`frontend-ui`): upload-CSV-for-a-window screen; create-challenge + accept-challenge
   flow; a settled result/review view. Reuse the existing result/review components — currently they read
   the seeded showcase battle (`components/battle/showcase.ts`); adapt to load a real settled battle from
   the repo.
5. **Verification labeling**: replace "Demo Verified" with honest `SELF_REPORTED`/`CLIENT_VERIFIED`
   copy for imported battles; keep "Simulated Demo Data" only on seeded content.
6. Gates: end-to-end — create/accept a challenge, import two CSVs, settle, correct winner + rating,
   result screen renders real data; `npm run build`, lint, tests. QA against these acceptance criteria.

---

## Acceptance criteria for "v1 works"

- Two real (authenticated) testers can be matched or challenge each other into a scheduled window.
- Each imports their trades by CSV after the window; the platform scores **only** in-window realized
  trades with the PnL + capped-participation-bonus model, breaks ties by the cascade, and updates ratings.
- A trader who sat flat does **not** tie/beat a trader who took a couple of trades near breakeven.
- Data persists in Neon Postgres; the in-memory demo still runs with no `DATABASE_URL`.
- No imported trade is labeled "Demo Verified"; no gambling language; no profitability claims.

## Open decisions to confirm while building (not blockers)

- Exact CSV columns / whether testers submit fills or round-trip trades (see `v1-divergences.md`).
- Auth user ↔ trader-profile mapping and how MFFU account id is captured.
- Verification status string + UI copy for imported trades.
