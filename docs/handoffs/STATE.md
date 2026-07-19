# Build state — handoff doc

> Purpose: lets a fresh Claude Code session pick up this build mid-flight without re-reading the whole
> history. Update after every phase. Read CLAUDE.md + docs/PRODUCT_BRIEF.md first; this doc only records
> what's DONE and what's NEXT.

## How this build is being run

- Following the phase plan in `KICKOFF.md`, delegating each phase to the matching `.claude/agents/` agent.
- After each phase: verify (build/lint/test), commit to git, update this doc.
- QA passes with the qa-reviewer agent after major phases and before "done".
- User (Kevin) is hands-off; proceed autonomously, ask only when genuinely blocked.

## ▶ NEXT ACTION (for the session picking this up)

Launch **Phase 6 — Dashboard, result, and review** (KICKOFF.md Phase 6). Mostly `frontend-ui`;
pull in `simulation-engine`/`scoring-engine` ONLY for additive engine-side helpers (candidates
below). Everything the session needs:

- **Three deliverables** per KICKOFF.md: (1) Home dashboard at `/` (replaces the
  `PagePlaceholder`): competitive overview (rating, league, season record, streak), "Find a
  Battle" CTA → `/matchmaking`, recent battle card, performance insight cards, activity feed —
  all from `getRepositories()` seed data (KevinV = demo user; see Phase 1 decisions for repo
  surfaces incl. notifications/achievements). (2) Battle Completion result screen — winner,
  final scores, rating change, "why you won / why you lost" (engine's
  `finalResult.reasons[]`), actions (rematch → `/matchmaking`, review, home). (3) Battle Review
  screen — score component breakdown, P&L + drawdown over time, trade-by-trade table, event
  timeline, prewritten coaching summary.
- **Result/review data sourcing decision to make early**: the live-battle end overlay already
  shows `finalResult`; the standalone result/review screens can render (a) the seeded showcase
  battle (KevinV vs DeltaHunter 2026-07-17, has authored execution trail — via repositories)
  and/or (b) a headless engine replay of a scenario (`advanceBattleToEnd`). CAUTION for (b):
  see the Turbopack prod-minifier gotcha below — run engine replay client-side (the Phase 4
  precedent) or fix the bundler issue first; do NOT call `createBattleState` in a server
  component without checking it.
- Routes: suggest `/battle/result` + `/battle/review` (or `/history/[id]` for review of any
  seeded battle — Phase 7 builds history, so keep it minimal). Wire the end-overlay's actions
  to the new screens.
- Nav cleanup opportunity (QA LOW): "Find a Battle" + "Battle" sit as sibling nav items; once
  the dashboard CTA exists, consider renaming "Battle" → "Live Battle" or trimming nav.
- Rules: same as always — no gambling language, no profitability claims (careful in coaching
  copy: frame as competitive improvement, not money-making), UI computes NO scores/ratings
  (coaching summaries must be authored/derived from engine outputs, not UI math), simulated
  labels, strong types, no `any`, deterministic.
- Verify: build + lint + test (135 green pre-phase), dev-server curl `/`, new routes, and
  `/matchmaking` + `/battle` regressions. Run `qa-reviewer` after (scope: the new diff).
- After the phase: commit, update this doc (mark Phase 6 done, decisions + QA notes), proceed
  to Phase 7 per KICKOFF.md.

## Phase status

| Phase | Status | Commit |
|---|---|---|
| 0 — Scaffold | ✅ done | `ebd92d8` |
| 1 — Data model + seed | ✅ done | `11a8d98` |
| 2 — Scoring + rating engines | ✅ done | `c9b9eb4` |
| 3 — Mock provider / pipeline / battle engine | ✅ done | `015f225` |
| 4 — Live Battle screen | ✅ done | `bcba1cb` |
| 5 — Matchmaking flow | ✅ done | `3216e43` |
| 6 — Dashboard, result, review | ⏳ next | |
| 7 — Leaderboards, profiles, leagues, history | pending | |
| 8 — Docs + full QA | pending | |

## Decisions made so far (beyond CLAUDE.md's locked ones)

- Next.js 16.2.10, Tailwind v4, ESLint 9, Vitest for tests, tsx for scripts.
- shadcn/ui with radix base; accent = single amber/gold (`--primary: oklch(0.8 0.13 80)`); cool
  near-black slate surfaces; `--positive` (emerald) / `--negative` (red) tokens for P&L/win-loss.
- Routes: `/` `/battle` `/leaderboards` `/history` `/profile` `/leagues` `/scoring` `/integrations` (coming soon).
- Global demo notice lives in `components/layout/demo-notice.tsx`, rendered once in root layout.
- npm scripts all wired: dev/build/lint/seed (placeholder)/test.

### Phase 1 decisions (data layer)

- Schema: drizzle-orm pg-core (v0.45.2), NO db driver — demo runs fully in-memory. 14 tables in
  `lib/data/schema/tables.ts`; enums as const-tuple unions in `schema/enums.ts`; app imports
  `$inferSelect` domain types from `schema/types.ts`, never ORM objects. Timestamps `mode: "string"`.
- `lib/data/leagues.ts`: rating bands 150/league, 50/division, anchored so 1684→Gold II, 1712→Gold I.
- Repositories: `lib/data/repositories/types.ts` defines Trader/Battle/Leaderboard/Firm/Achievement/
  Notification repos under one `Repositories` interface; `getRepositories()` singleton in `index.ts`;
  in-memory impl derives standings/leaderboards/percentiles from traders+battles (no drift).
- Seed: `lib/data/seed/` — master seed `0x7b17c0de` fans into 5 mulberry32 streams. 44 traders,
  6 firms, 190 battles, 380 participants, rating chains land on authored targets (KevinV pinned to
  exactly +96, 1588→1684). Demo "today" = 2026-07-18. `getSeedDataset()` is cached.
- KevinV's latest battle vs DeltaHunter mirrors the brief's worked example incl. execution trail.
- `npm run seed` = validate + summarize dataset (exits non-zero on invariant violations).

### Phase 2 decisions (scoring/ratings)

- Public contract: `calculateBattleScore(input: BattleMetricsInput, config?: Partial<ScoringConfig>)`
  from `@/lib/scoring/calculateBattleScore` (re-exports everything). All thresholds/penalties live in
  `lib/scoring/config.ts` (`DEFAULT_SCORING_CONFIG`); weights auto-normalize (40/25/20/15 ≡ 0.4/…).
- `BattleMetricsInput` = { netPnl, grossProfit, grossLoss, peakEquity, lowestEquity, maxDrawdown,
  maxOpenContracts, trades[] (side/size/entry/exit/realizedPnl/entryTime/exitTime epoch-ms),
  battleDurationMs, timeInSevereDrawdownMs, limits{permittedRisk, dailyLossLimit, maxContracts} }.
  Severe drawdown suggestion: drawdown > 50% of permittedRisk (ledger decides).
- Components each return { score, factors[] }; discipline also returns structured `violations[]`
  (type/label/penalty/detail) → UI penalty events + "why you won" bullets.
- Ratings: `calculateRatingChange({ playerRating, opponentRating, playerScore, opponentScore, result,
  completionRatio?, playerViolationCount? })` → { change, newRating, breakdown }. Elo/400, K=32,
  margin multiplier from SCORE margin (0.75–1.5), violation dampening on gains.
- Worked example honest arithmetic = **83.55 / 74.0** (brief's 83.9/73.6 documented as approximations
  in `lib/scoring/workedExample.ts`); seed's ±1.0 tolerance covers both.

### Phase 3 decisions (simulation/pipeline/battles)

- Battle engine stepping API (`@/lib/battles/battleEngine`) — the UI tick loop calls:
  `createBattleState(scenarioId)` → `advanceBattle(state, steps?)` / `advanceBattleToTime(state, elapsedMs)`
  / `advanceBattleToEnd(state)` · `getBattleProgress(state)` · `getFeedSince(state, afterSequence)`.
  Pure/immutable: every call returns a new JSON-serializable state. Pause = stop calling; reset = recreate.
- Read surfaces: `state.participants[userId]` = { score: BattleScoreResult, metrics, netPnl, maxDrawdown,
  riskUtilization, openPosition, tradeCount, history[] }; `state.feed: BattleFeedEvent[]` (BATTLE_START,
  ENTRY, SCALE_IN/OUT, EXIT, LEAD_CHANGE, DRAWDOWN_ALERT, DISCIPLINE_PENALTY, TIME_REMAINING, COMMENTARY,
  BATTLE_END); `state.finalResult: BattleFinalResult` (winner, component breakdowns, rating changes,
  "why you won/lost" reasons[]).
- Scenario registry `lib/battles/scenarios.ts`: `SCENARIOS`, `DEFAULT_SCENARIO_ID`
  (= discipline-beats-raw-profit), `isScenarioId`. Outcomes: discipline 83.97 vs 71.96 (KevinV wins,
  Delta out-earns $1,013 vs $704); comeback 75.39 vs 61.37 (3 lead changes); aggression 39.61 vs 80.85
  (DeltaHunter wins; Kevin briefly +$1,487 up).
- Matchmaking `lib/battles/matchmaking.ts`: `searchForOpponent`, `createMatchmakingPlan` (staged status
  messages), `DEMO_RATING_STAGES` for shortened waits; KevinV→DeltaHunter with defaults.
- Rules `lib/battles/battleRules.ts`: MFFU 50K Rapid = $1,250 permitted risk / $1,250 DLL / 5 contracts.
- Price ticks are market data (`markPipelineToMarket`); executions go through `processExecutionEvent`
  (normalize → dedupe → ledger). `npm run battle -- <scenario-id>` runs any scenario headlessly.
- Mock generator injects one intentional duplicate event per battle to exercise dedupe.
- Post-QA fixes (`3ec124d`): engine decoupled via `lib/battles/battleScript.ts` (`BattleScriptSource`
  interface + registry; mock is the default source, `createBattleState(scenarioId, source?)`); scenarios
  now sessionDate 2026-07-18, OPENING_BELL 90-min window (seeded showcase battle stays 2026-07-17 MIDDAY
  — deliberately distinct); scripts memoized per scenario id. 135 tests. Outcomes shifted slightly:
  discipline 83.97/71.79, comeback 75.28/61.46, aggression unchanged.

### Phase 4 decisions (Live Battle screen)

- `/battle` = `components/battle/live-battle-screen.tsx` (the only component talking to the clock);
  sub-components: battle-header, scorecard, score-timeline-chart, price-chart, event-feed/event-row,
  commentary-strip, demo-controls, pre-battle, battle-end-overlay; atoms: trader-avatar (+ shared
  `TRADER_COLORS`), stat-pill, animated-number, format.ts (pure display formatting only).
- **BattleClock** = `components/battle/useBattleClock.ts` — React hook owning the engine snapshot;
  the documented SSE/live-transport seam (header lines 3–21). 200ms interval advances a presentation
  playhead at 30× compression (90-min battle ≈ 3 min at 1x; speeds 1x/2x/4x) and calls
  `advanceBattleToTime`. Output: `{ scenarioId, status: ready|live|paused|final, speed, state,
  progress, feed, elapsedMs, remainingMs, controls: { start, pause, resume, reset, advanceOneEvent,
  setSpeed, finishNow, selectScenario } }`. Feed accumulates incrementally via `getFeedSince` inside
  state updates; `accumulateFeed` returns a narrow Pick so spreads can't clobber state. Pause = stop
  ticking; reset/selectScenario = fresh `createBattleState`. Engine clock stays authoritative.
- `lib/battles/getBattleScript.ts` — the only lib addition (additive, read-only):
  `getBattleScriptForState(state)` resolves the memoized script via the registered
  `BattleScriptSource` for the price chart. No engine/scoring changes.
- Pre-final rating display: engine exposes no pre-final estimate, so header shows a neutral
  "Rating on the line — 1,684 vs 1,712 · applied at final" label; actual `±N → new rating` renders
  from engine `finalResult.ratingChange` in header + end overlay. No Elo math in UI.
- End-overlay dismissal tracked by `finalResult` object identity → reappears after Reset → Finish
  now (engine immutability guarantees a fresh object).
- recharts@^3.9.2 installed. react-hooks v6 lint rules required: no ref reads during render, no
  setState-in-effect (feed accumulation lives in clock state updates).
- **QA verdict (`qa-reviewer`): pass, no blockers/highs.** Deferred findings:
  - MEDIUM → engine-side, later phase: expose an engine-computed *projected* rating movement on the
    stepping API so the header can show pre-final "±N rating" per the brief (must NOT be computed
    client-side — Rule 4).
  - LOW polish (Phase 11 or with LOWs of later phases): Demo Controls shows disabled "Resume" at
    FINAL (suggest "Replay"/Reset hint); end overlay (z-40) covers Demo Controls (z-30) so presenter
    must dismiss before Reset; `BattleClockOutput.progress` exposed but unused by the screen;
    engine flip-trade (long→short in one fill) would label SCALE_OUT/diamond — no scenario does this.

### Phase 5 decisions (matchmaking flow)

- `/matchmaking` = server page (`app/matchmaking/page.tsx`) + client flow
  `components/matchmaking/matchmaking-flow.tsx` (state machine: config → searching → reveal →
  head-to-head). Sub-components: config-panel, searching-panel, opponent-reveal, head-to-head,
  types.ts (serializable `MatchmakingTraderCard`/`BattleConfig` view models). New shared atoms:
  `components/battle/league-badge.tsx`; `format.ts` gained `BATTLE_STYLE_LABELS`, `formatLeague`,
  `formatRecord`, `formatStreak`.
- Server page sources all trader cards (demo user + full demo queue, incl. account plan labels)
  through `getRepositories()`, and computes per-market matchability by probing the engine's
  `searchForOpponent` past the widest stage — UI never invents matchmaking results. Scripted
  opponent identity comes from `OPPONENT_PARTICIPANT` (mock provider constant, same source
  `scenarios.ts` uses), NOT from constructing engine state server-side (see Turbopack gotcha).
- Client flow builds the plan ONCE via `createMatchmakingPlan(request, undefined,
  DEMO_RATING_STAGES)`; searching-panel is a pure playhead over `plan.ticks`/`matchedAtMs`
  (±50→±100→±175 chips, cycling messages, "Reveal now" skip, Cancel). Reveal auto-advances 2.6s.
- Market honesty: NQ/ES/MNQ selectable (engine-verified matches); MES/CL/GC disabled ("No
  opponents queued"); non-Opening-Bell windows + non-Live-Performance types visible but disabled.
  `battlePlayable` requires scripted opponent AND `market === "NQ"` (MNQ also resolves to
  DeltaHunter but the scripts are NQ) — otherwise an honest "scripts follow the NQ rivalry" note
  with New-search action.
- Handoff: `/battle?scenario=<id>` validated server-side with `isScenarioId` (silent fallback to
  default); `LiveBattleScreen` gained optional `initialScenarioId` prop → `useBattleClock(id)`;
  page keys the screen by scenario for clean client-nav remounts. Head-to-head has a "Presenter
  pick" scenario picker (3 scenarios, default = discipline). No forked battle UI.
- Nav: added `{ label: "Find a Battle", href: "/matchmaking" }` after Home.
- **QA verdict (`qa-reviewer`): pass, no blockers/highs.** MEDIUM (MNQ→NQ-script handoff
  mismatch) + 2 LOWs (silent catch → inline `role="status"` error; account card "Connected
  (Simulated)" chip + "Daily drawdown remaining" relabel) fixed pre-commit. Deferred LOWs:
  - Nav has "Find a Battle" + "Battle" as siblings — revisit when Phase 6 dashboard CTA lands.
  - `app/matchmaking/page.tsx` hardcodes `probeElapsedMs = 600_000` for the matchability probe —
    engine-side `isMarketMatchable(request, queue)` helper would remove the timing assumption.

## Known state / gotchas

- **Worked-example arithmetic**: the brief's component scores (78/91/88/80 vs 86/63/66/71) under strict
  40/25/20/15 weights give **83.55 / 74.0**, not the brief's published 83.9/73.6. Seed validator allows
  ±1.0 tolerance on the showcase battle. Scoring engine (Phase 2) must document/handle this.
- DeltaHunter's derived current streak is a LOSS streak (he just lost the showcase battle); his 21–13 /
  1712 are exact per spec.
- Historical seed battle scores are authored demo data, internally consistent with 40/25/20/15 weights;
  plug-in points to regenerate via lib/scoring are commented in `buildDataset.ts` + `constants.ts`.
- **Turbopack prod-minifier bug (found Phase 5)**: the production *server*-chunk minifier
  mis-inlines `derivePipelineMetrics` (`lib/executions/processExecutionEvent.ts`) — the inlined
  call drops the third argument, leaving a bare `battleDurationMs` reference → `ReferenceError`
  if engine scoring runs in a production server context (e.g. `createBattleState` during
  prerender). Client chunks minify correctly, so `/battle` (client-side clock) is unaffected.
  Workaround so far: don't run the engine server-side. If a later phase needs server-side engine
  replay (e.g. battle review SSR), fix first (next.config minify setting or Next upgrade).
- Git repo initialized on `main`; no remote yet.
- Verification gates green as of `3216e43`: `npm run build` (12 routes), `npm run lint`,
  `npm test` (135/135), dev-server curls: `/matchmaking`, `/battle`,
  `/battle?scenario=comeback-victory`, `/battle?scenario=bogus` (falls back to default) all 200.
- Working tree at handoff: only this file modified since `3216e43`.
