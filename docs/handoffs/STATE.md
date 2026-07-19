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

Launch **Phase 8 — Docs, then a full QA pass** (KICKOFF.md Phase 8). This is the last build
phase before polish. Two parts:

1. **Docs** (use the `docs-writer` agent). Write, describing what the code ACTUALLY does (not
   aspirational) — read the codebase first:
   - `README.md` — what Trader Battles is, the one-line pitch, "100% simulated demo data"
     framing, quickstart (`npm i` → `npm run dev`; scripts: dev/build/lint/seed/test, plus
     `npm run battle -- <scenario-id>`), route map (14 routes — see below), Vercel deploy
     notes (no DB / no paid services), and the non-negotiable rules summary.
   - `docs/architecture.md` — the one-directional data flow (mock provider → adapter →
     normalized execution event → validate/dedupe → position ledger → battle metrics → score →
     snapshot → UI). Document the module boundaries (`lib/integrations`, `lib/executions`,
     `lib/battles`, `lib/scoring`, `lib/ratings`, `lib/data/repositories`), the repository
     interface as the swap seam for real Postgres, and the `BattleClock`/`BattleScriptSource`
     client-tick abstraction as the SSE/live-stream seam.
   - `docs/scoring.md` — the 0–100 score, four components (Performance 40 / Risk 25 /
     Discipline 20 / Consistency 15, configurable), penalties, the Elo-style rating change
     (K=32, margin multiplier, violation dampening), and the worked example. **Honest-arithmetic
     caveat**: strict 40/25/20/15 weights give **83.55 / 74.0**, not the brief's published
     83.9/73.6 — document this (already handled in `lib/scoring/workedExample.ts`, ±1.0 seed
     tolerance).
   - `docs/integration-roadmap.md` — how NinjaTrader/Tradovate/Rithmic plug in behind
     `TradingIntegrationProvider` (`lib/integrations/types.ts`) and the repository interface with
     ZERO changes to scoring/battles/UI; the provider stubs under `lib/integrations/providers/*`.
   - `docs/integrity-and-verification.md` — verification states (`SIMULATED` today →
     `PROVIDER_VERIFIED` future), the "Simulated Demo Data" labeling policy, dedupe/audit trail
     (`rawPayload`, one intentional duplicate per battle), determinism (seed `0x7b17c0de`).
2. **Full QA** (use the `qa-reviewer` agent) — against the FULL MVP acceptance criteria in the
   brief (not just a phase diff) + all non-negotiable rules. Produce a prioritized fix list.
   Then fix any BLOCKER/HIGH, re-verify, commit.

- Verify gates (must stay green): `npm run build` (14 routes), `npm run lint`, `npm test`
  (139/139). Docs are prose-only — no code changes expected, so tests/build shouldn't move.
- After the phase: commit, update this doc (mark Phase 8 done), then Phase 9
  (leaderboards/profiles/leagues/history already shipped in Phase 7 — Phase 9 in KICKOFF is
  folded in; the remaining KICKOFF items are Phase 10 docs polish already covered here and
  **Phase 11 Polish**). Effectively after Phase 8 the app is feature-complete; remaining work is
  the deferred-polish backlog below.

### Deferred polish backlog (fold into Phase 11 Polish)
- **Chart a11y**: `battle-review/pair-line-chart.tsx` still has no text alternative (the Phase 7
  rating charts + dashboard sparkline now do — `role="img"` + summarizing `aria-label`). Add the
  same to `pair-line-chart.tsx` and the live-battle charts for consistency.
- **Phase 7 QA LOWs** (cosmetic, not fixed): (a) `components/layout/notifications-menu.tsx:73`
  `formatDateTime` omits the year → older seeded notifications show month/day only; (b)
  `app/firms/[slug]/page.tsx:164` uses `MARKET_LABELS[m].split(" · ")[1]` to show the market
  descriptor — relies on the " · " label shape; a dedicated market-name accessor would be safer.
- **Phase 5 LOWs** (still open): nav has "Find a Battle" + "Live Battle" as siblings (fine post
  Phase-6 dashboard CTA, revisit in polish); `app/matchmaking/page.tsx` hardcodes
  `probeElapsedMs = 600_000` — an engine-side `isMarketMatchable(request, queue)` helper would
  remove the timing assumption.
- **Phase 4 MEDIUM** (engine-side): expose an engine-computed *projected* pre-final rating
  movement on the stepping API so the live header can show "±N rating" before the final bell
  (must NOT be computed client-side — Rule 4). Currently the header shows a neutral
  "Rating on the line" label until the engine's `finalResult.ratingChange` lands.
- **Phase 4 LOWs**: Demo Controls shows disabled "Resume" at FINAL (suggest "Replay"/Reset hint);
  end overlay (z-40) covers Demo Controls (z-30) so presenter must dismiss before Reset;
  `BattleClockOutput.progress` exposed but unused by the screen.

## Phase status

| Phase | Status | Commit |
|---|---|---|
| 0 — Scaffold | ✅ done | `ebd92d8` |
| 1 — Data model + seed | ✅ done | `11a8d98` |
| 2 — Scoring + rating engines | ✅ done | `c9b9eb4` |
| 3 — Mock provider / pipeline / battle engine | ✅ done | `015f225` |
| 4 — Live Battle screen | ✅ done | `bcba1cb` |
| 5 — Matchmaking flow | ✅ done | `3216e43` |
| 6 — Dashboard, result, review | ✅ done | `5554768` |
| 7 — Leaderboards, profiles, leagues, history | ✅ done | _this commit_ |
| 8 — Docs + full QA | ⏳ next | |

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

### Phase 6 decisions (dashboard / result / review)

- **Data sourcing (locked)**: standalone result + review screens render the **seeded showcase
  battle** (KevinV WIN 83.9 vs DeltaHunter 73.6, +17 rating; battle-189, 2026-07-17) via
  `getRepositories()` — NOT an engine replay. Sidesteps the Turbopack server-side-engine gotcha:
  `/battle/result` + `/battle/review` prerender as `○ Static`. `components/battle/showcase.ts`
  (`loadShowcaseBattle()`) is the single server-only loader → serializable `ShowcaseBattleView`
  (participant views, narrative, pnl/drawdown/score `PairPoint[]` series, `TradeRow[]`,
  `TimelineRow[]`). Both pages import it; client charts get plain numeric arrays only.
- **Narrative derivation (new pure lib module)**: `lib/battles/reviewNarrative.ts` —
  `deriveReviewNarrative(self, other)` → `{ reasons[], componentEdges[], coaching }` and
  `buildComponentEdges(self, other)`. Pure projection over already-computed final
  `BattleMetricSnapshot` values (compares/subtracts scores, never recomputes them) — mirrors the
  engine's `buildReasons()` tone. Lives in lib/ (not UI) so components never do score-comparison
  math (Rule 4). Coaching copy framed as competitive skill, no profitability/gambling language.
  4 unit tests (`tests/reviewNarrative.test.ts`) against the seeded showcase. **Total tests: 139.**
- **Home dashboard** (`app/page.tsx`, replaced PagePlaceholder): competitive overview
  (rating/Gold II/18–11/3W + standing percentiles from `leaderboards.getStanding`), "Find a
  Battle" CTA → `/matchmaking`, recent-battle card (showcase, links to result/review), performance
  insight cards (discipline 84 / risk 79 / performance 76, explicitly disclaimed as skill
  indicators not returns), activity feed (`components/dashboard/activity-feed.tsx` merges
  `notifications.listForUser` + `battles.listRecent`), season rating sparkline
  (`components/dashboard/rating-sparkline.tsx`, Recharts).
- **New components**: `components/battle/{final-scorecard,component-breakdown}.tsx` (reusable,
  mirror the end-overlay), `components/battle-review/{pair-line-chart,trade-table,event-timeline}.tsx`
  (pair-line-chart = two-series Recharts driven by a `valueKind` prop for P&L/drawdown/score),
  `components/dashboard/{activity-feed,rating-sparkline}.tsx`. `format.ts` gained pure formatters:
  `sessionTimeFromIso`, `formatDate`, `formatDateTime`, `formatScore`.
- **Wiring**: end-overlay (`battle-end-overlay.tsx`) actions now link "View full result" →
  `/battle/result` and "Full review" → `/battle/review` (removed the Phase-6 placeholder);
  "Review final board" still = onClose. Nav (`nav-items.ts`): "Battle" renamed → "Live Battle".
  NOTE: the live `/battle` overlay reflects the live *scenario replay* (may differ from the seeded
  showcase the standalone screens show) — acceptable for the demo, by design.
- Chart series: metric-timeline points share timestamps across both traders (clean 5-pt score
  chart); account snapshots don't, so P&L/drawdown series are minute-bucketed with `connectNulls`
  (same idiom as the live score-timeline chart). `showcase.ts` marks the last fully-paired score
  checkpoint as the "final bell" regardless of exact duration (post-QA robustness fix).
- **QA verdict (`qa-reviewer`): PASS, no blocker/high/medium.** 3 LOWs; 1 already satisfied (doc
  comments name the showcase sourcing), 1 fixed (isFinal edge case), 1 deferred (chart a11y
  aria-labels — see "Deferred Phase 6 polish" above).

### Phase 7 decisions (leaderboards / profiles / firms / leagues / history / notifications)

- **All UI reads through `getRepositories()`; zero authoritative math in components** (Rule 4).
  Ranks/win-rates/percentiles/scores/ratings come pre-computed from `leaderboards.query`/
  `getStanding`/`LeaderboardEntry.winRate`/`ParticipantSummary.ratingChange`/final metric
  snapshots. The only arithmetic is presentational: `topPercent = 100 - globalPercentile`,
  league band labels + division-progress % (from the provided `lib/data/leagues.ts`
  `leagueForRating`), and display-only WIN/LOSS tallies. QA confirmed clean.
- **Routes** (14 total). New/replaced: `/leaderboards` (URL-param filters `?league&market&firmSlug`,
  "Your standing" strip, KevinV row highlight), `/profile` (demo user) + dynamic
  `/profile/[userId]` (any seeded trader; `notFound()` on bad id), dynamic `/firms/[slug]`
  (`notFound()` on bad slug), `/leagues` (Bronze→Elite ladder + promotion/demotion progress +
  firms overview), `/history` (`BattleHistoryFilter` URL params incl. date range). Build:
  `/leagues` + `/profile` prerender static; `/leaderboards`, `/history`, `/firms/[slug]`,
  `/profile/[userId]`, and now `/battle/result` + `/battle/review` are **dynamic** (they read
  `searchParams`/`params`).
- **New components**: `components/profile/{profile.ts (server loader → ProfileViewModel, mirrors
  showcase.ts), trader-profile-view.tsx (shared by both profile routes), rating-history-chart.tsx
  (full-size client rating chart, sibling of the dashboard sparkline), achievement-grid.tsx
  (lucide icon-name→component resolver, earned/locked states)}`,
  `components/filters/query-filters.tsx` (reusable client filter bar; pushes URL query params —
  the ONLY client-side filter mechanism, server components re-query on param change),
  `components/layout/notifications-menu.tsx` (radix `Popover` bell + unread badge).
  `format.ts` gained `FIRM_KIND_LABELS`, `formatWinRate`, exported `LEAGUE_LABELS`.
- **Review-screen parameterization (done)**: `components/battle/showcase.ts` now exposes
  `loadBattleView(battleId)` alongside `loadShowcaseBattle()`; both delegate to a private
  `buildBattleView(detail, demoUserId)`. `loadBattleView` returns `null` if the battle is missing
  or KevinV isn't a participant; `/battle/review` + `/battle/result` do
  `(battle ? await loadBattleView(battle) : null) ?? await loadShowcaseBattle()` on a `?battle=`
  param. The demo user always maps to the `demo` accent. **All sourcing via repositories — NO
  server-side engine** (Turbopack prod-minifier gotcha holds).
- **Telemetry degradation (important)**: only the showcase battle (battle-189) has intra-battle
  telemetry (account snapshots, execution events, non-final metric snapshots). The other 189
  battles have ONLY final metric snapshots. The view model gained a `hasTelemetry` flag; when
  false the pnl/drawdown/score series + trade rows + timeline are empty and the review page
  hides those blocks (each also guarded `.length > 0`), still rendering header + component
  breakdown + why-won/lost + rating, plus an honest inline note ("Full intra-battle telemetry …
  is captured for live-played battles in this demo…"). Match History "Review" links →
  `/battle/review?battle=<id>`.
- **Notifications data flow**: repositories are server-only, so the **root layout** (`app/layout.tsx`,
  now `async`) fetches `notifications.listForUser` + `countUnread` for KevinV, maps to a plain
  `HeaderNotification[]`, and passes it + `unreadCount` as props into the client `SiteHeader` →
  `NotificationsMenu`. NO repo call inside any client component. Bell is accessible
  (Esc/click-outside dismiss, `aria-label` with unread count, deep links via `href`).
- **A11y**: new rating charts + dashboard sparkline gained `role="img"` + summarizing
  `aria-label` (partially addresses the deferred Phase 6 chart-a11y item; `pair-line-chart.tsx`
  + live-battle charts still pending — see backlog).
- **Notifications/firms labeling**: firms carry "Demo firm — no real partnership implied";
  skill-indicator cards (discipline/risk/performance) framed as competitive skill, NOT returns.
  Fixed a Phase-6 carryover: dashboard Performance hint "Normalized returns" → "Normalized
  execution" (matches the profile card) to keep clear of returns framing.
- **QA verdict (`qa-reviewer`): PASS, no blocker/high.** 1 MEDIUM (the "Normalized returns"
  framing) fixed pre-commit; 2 LOWs deferred (cosmetic — see backlog). Prohibited-term scan clean.

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
- Verification gates green as of the Phase 7 commit: `npm run build` (14 routes — `/battle/result`
  + `/battle/review` are now **dynamic** because they read `?battle=`; `/leaderboards`, `/history`,
  `/firms/[slug]`, `/profile/[userId]` dynamic; `/leagues`, `/profile`, `/`, `/matchmaking`,
  `/scoring`, `/integrations` static), `npm run lint`, `npm test` (139/139), prod-server
  (`next start`) curls all 200 for: `/`, `/leaderboards` (+ `?league=GOLD`, multi-filter, and an
  empty-result filter), `/profile`, `/profile/user-deltahunter`, `/firms/mffu`, `/firms/tradeify`,
  `/leagues`, `/history` (+ `?result=WIN`, `?result=LOSS&market=NQ`),
  `/battle/review?battle=battle-001` (no-telemetry graceful render),
  `/battle/result?battle=battle-001`, `/battle/review`, `/battle/result`, `/matchmaking`,
  `/battle`, `/scoring`; correct 404s for `/profile/user-doesnotexist`, `/firms/nope`.
- Notifications dropdown uses the unified `radix-ui` package (`import { Popover } from "radix-ui"`,
  already a dep `^1.6.2`) — no new dependency / no lockfile change.
- Working tree at handoff: clean after the Phase 7 commit (this doc + Phase 7 files committed
  together).
