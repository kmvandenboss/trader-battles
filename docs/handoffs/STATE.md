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

**Direction change (2026-07-21): the demo is done; we are now building MFFU v1.** The phase 0–11
demo is complete and green. New work follows **[NEXT-SESSION.md](NEXT-SESSION.md)** (ordered plan)
against the decisions in **[../v1-divergences.md](../v1-divergences.md)**. Read CLAUDE.md's
"Current direction — MFFU v1" section first. v1 = MFFU-only, straight-PnL scoring (`PNL_V1` mode,
keep the 4-factor engine), Neon Postgres behind the repo interface, bridge auth (Auth.js v5), and
CSV import → settle-after-the-fact battle scoring. Phases: A scoring → B Postgres → C auth →
D CSV import + settlement (A first; B/C parallel; D depends on all).

**Phases A (v1 scoring mode), B (Neon Postgres), and C (bridge auth) are DONE, committed, and
LIVE-SMOKED against the real Neon database (2026-07-21).** `.env.local` holds the Neon
credentials (`DATABASE_URL` pooled + `DATABASE_URL_UNPOOLED` direct + locally generated
`AUTH_SECRET`); migrations `0000`+`0001` applied; `db:seed` loaded all 1,792 rows and re-runs
idempotently. Live smokes green: all 12 routes 200 against Postgres; headless-Chromium auth flow
(sign-up → session identity via the seam → sign-out demo fallback → sign-in → generic
wrong-password error, 9/9 checks); DB rows verified (bcrypt hash stored, users.auth_user_id
linked, trader_profiles 1500/SILVER II/firm-mffu); test account removed; 44 seeded users intact.
NOTE: with `DATABASE_URL` set, `next build` marks ALL routes dynamic (session read) — expected.
**Vercel deploy needs `AUTH_SECRET` set manually** (the Neon integration injects only the DB vars).

**Phase D (CSV import → battle windows → settlement) is DONE, QA'd, and LIVE-SMOKED against the
real Neon database (2026-07-21).** Migration `0002` applied (`challenges`, `market_bars`, v1
battle/participant columns, `csv` provider, `SETTLING` status). The full v1 loop works end-to-end
through the **production server bundle** (the Turbopack server-minifier bug class from Phase B did
NOT reproduce — the PNL_V1 path never touches `derivePipelineMetrics`/the 4F engine, by design):
challenge → accept → CSV import (both sides) → bars import → settle → settled result page, with
idempotent re-import (0 new / N duplicates) and idempotent re-settlement verified live. See "Phase
D decisions" below for the full write-up, the QA findings, and how each was closed.

**Next up:** nothing blocking — v1's core loop (A+B+C+D) is complete. Remaining open items are
tracked as **[open]** entries in `../v1-divergences.md` (self-supplied mark-out bars, overlapping-
battle rating staleness) — none block using the platform at current volume. Natural next slice:
wire the challenge/import/settle screens into the main nav flow more prominently (currently
reachable at `/challenges`), or pick up a deferred item from `v1-divergences.md`.

**Demo baseline (unchanged, still green):** Phase 11 DONE. Gates: `npm run lint`, `npm run build`
(14 routes; `/scoring` + `/integrations` `○ Static`), `npm test` **142/142**, `npm run battle`
(KevinV winner), prod-server smoke. The two low-value backlog items below remain deferred.

If continuing: the only backlog items intentionally left are two low-value ones — the Phase 5
`probeElapsedMs = 600_000` timing assumption in `app/matchmaking/page.tsx` (an engine-side
`isMarketMatchable(request, queue)` helper would remove it) and the unused
`BattleClockOutput.progress`. Nav still lists "Find a Battle" + "Live Battle" as siblings (a
deliberate keep — the dashboard CTA is the primary entry). Everything else is resolved.

### Polish backlog (Phase 11) — all resolved except the two noted above
- ✅ **MEDIUM — real `/scoring` page** ("How Scoring Works"): built from `docs/scoring.md`.
- ✅ **MEDIUM — real `/integrations` page**: planned-provider matrix from `docs/integration-roadmap.md`.
- ✅ **Chart a11y**: `role="img"` + aria-label on pair-line-chart + both live-battle charts.
- ✅ **Phase 8 LOW**: header identity chip is now a prop wired from the root layout.
- ✅ **Phase 7 LOWs**: `formatDateTime` includes the year; `marketTicker`/`marketName` accessors
  replaced the fragile `.split(" · ")` idiom.
- ✅ **Phase 4 MEDIUM**: engine-computed projected pre-final rating (see Phase 11 decisions).
- ✅ **Phase 4 LOWs**: Demo Controls shows an active "Replay" at FINAL; z-index raised above the
  end overlay so the presenter can Reset without dismissing.
- ⏸ **Phase 5 LOW** (left): `probeElapsedMs = 600_000` timing assumption; unused `progress`.

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
| 7 — Leaderboards, profiles, leagues, history | ✅ done | `4cc0e3c` |
| 8 — Docs + full QA | ✅ done | `64dbfa1` |
| 11 — Polish (backlog above) | ✅ done | `e0e8479` |
| **v1 A — `PNL_V1` scoring mode** | ✅ done | `20208f9` |
| **v1 B — Neon Postgres repos** | ✅ done, live-smoked | `f9c4b0a` |
| **v1 C — bridge auth (Auth.js v5)** | ✅ done, live-smoked | `f129de8` |
| **v1 D — CSV import + settlement** | ✅ done, live-smoked | *(pending commit)* |

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

### Phase 8 decisions (docs + full QA)

- **Docs written** (docs-writer agent), all describing actual code behavior: root `README.md`
  (pitch, simulated-data framing, quickstart, scripts incl. `npm run battle -- <scenario-id>`,
  full route table, Vercel notes, rules summary), `docs/architecture.md` (pipeline flow, module
  boundaries, repository + BattleClock/BattleScriptSource swap seams, Turbopack note),
  `docs/scoring.md` (components/weights/penalties tables verified against `lib/scoring/config.ts`,
  rating math vs `lib/ratings/config.ts`, honest 83.55/74.0 caveat), `docs/integration-roadmap.md`
  (provider stubs, zero-UI-change plug-in path, "nothing connected today", no partnership implied),
  `docs/integrity-and-verification.md` (SIMULATED→PROVIDER_VERIFIED, labeling policy, dedupe/audit,
  seed `0x7b17c0de`). `docs/README.md` replaced with a docs index. Route-count honesty: 13 app
  routes; Next reports 14 incl. auto `_not-found`.
- **Full-app QA (qa-reviewer): PASS — zero BLOCKER/HIGH.** All 14 MVP acceptance criteria met
  with evidence; all 6 non-negotiable rules clean (word-boundary gambling-term scan, no
  scoring/ratings imports in app/ or components/, no unseeded randomness anywhere). Gates green:
  build (14 routes, static/dynamic split unchanged), lint, 139/139 tests, seed validator,
  headless `npm run battle` (83.97 vs 71.79, expected winner confirmed), prod-server smoke —
  17 routes 200, bad slugs 404.
- 2 MEDIUMs found (placeholder `/scoring` + `/integrations` pages vs the brief's full text) →
  deferred to the Phase 11 backlog above per QA's recommendation; README's `/scoring` row
  reworded pre-commit to stop overstating the page. 1 new LOW (hardcoded header identity chip)
  added to backlog.

### Phase 11 decisions (polish)

- **`/scoring` — "How Scoring Works"** (`app/scoring/page.tsx`, frontend-ui agent): real static
  server page built verbatim from `docs/scoring.md`. Four-component weight overview (40/25/20/15
  bars), per-component sub-factor cards, the 5-row discipline-penalty table, the KevinV vs
  DeltaHunter worked example (78/91/88/80 vs 86/63/66/71 → 83.55/74.00 with the honest-arithmetic
  block), an Elo rating-change summary, and "why reckless risk doesn't pay". New primitives:
  `components/scoring/scoring-primitives.tsx` (`ComponentWeightBar`, `SubFactorRow`). **Imports NO
  `lib/scoring`/`lib/ratings` — every figure is fixed display copy (Rule 4).** Prerenders `○ Static`.
- **`/integrations` — roadmap** (`app/integrations/page.tsx`): real static page from
  `docs/integration-roadmap.md`. Honest "nothing connected / no partnership implied" banner,
  planned-provider matrix (NinjaTrader→CLIENT_VERIFIED, Tradovate→PROVIDER_VERIFIED, Rithmic,
  CQG/ProjectX, partner infra — every card "Not connected"), SIMULATED→CLIENT_VERIFIED→
  PROVIDER_VERIFIED row, the 5 drop-in seams, "TradingView deliberately not planned". New:
  `components/integrations/provider-card.tsx`. Prerenders `○ Static`. README route table +
  limitations reworded (both rows no longer say "placeholder").
- **Engine-computed projected rating (Phase 4 MEDIUM, Rule 4-safe)**: `lib/battles/battleEngine.ts`
  now exposes `state.projection: BattleRatingProjection | null` (`ProjectedRatingSide` per trader —
  result/change/newRating, plus `completionRatio` + `tied`). `computeProjection(state)` calls the
  SAME `calculateRatingChange` as `finalize`, with `completionRatio = clockMs/durationMs`, so the
  projected movement grows toward the true value as the clock runs; recomputed at
  `createBattleState`/`advanceBattle`/`advanceBattleToTime`, cleared to `null` once COMPLETED
  (finalResult supersedes). `components/battle/battle-header.tsx` renders it labeled "Projected
  rating · applied at final" once scores separate (`!tied`), else the neutral "Rating on the line"
  label; the UI computes no rating math. 3 new tests (start tied@0, leader-ahead@75%, deterministic
  + cleared-at-final + projected-winner-matches-actual). **Tests now 142.**
- **Chart a11y**: `role="img"` + summarizing `aria-label` added to
  `components/battle-review/pair-line-chart.tsx` (final values per series),
  `components/battle/score-timeline-chart.tsx`, `components/battle/price-chart.tsx` — matches the
  Phase 7 rating-chart/sparkline pattern. Labels derive from the last non-null data point.
- **Cosmetic LOWs**: site-header identity chip is now a `HeaderUser` prop wired from `app/layout.tsx`
  (`displayName`/`subtitle`/`initials` via `formatLeague`+`initialsFor`) — no hardcoded "KevinV".
  `format.ts` gained `marketTicker`/`marketName` (single source, replaced `.split(" · ")` in firm
  page + head-to-head + opponent-reveal + trader-profile-view) and its datetime format now includes
  the year (fixes notifications-menu + activity-feed older items). `demo-controls.tsx`: FINAL now
  shows an active "Replay" (→ reset) instead of a disabled "Resume", and its z-index raised to z-50
  so the presenter reaches Reset without dismissing the z-40 end overlay.
- Prohibited-gambling-term scan clean (reworded a "stakes" code comment → "movement"). No
  `lib/scoring`/`lib/ratings` imports in `app/` or `components/`.
- **QA verdict (`qa-reviewer`): PASS — no blocker/high/medium.** All 6 rules re-confirmed
  (gambling + profitability scans clean, no scoring/ratings imports in UI, projection determinism
  test passes). Gates: lint, build (14 routes, both new pages `○ Static`), 142/142 tests,
  headless battle (KevinV winner). 1 informational LOW: `/scoring` shows the honest 83.55/74.00
  (not the brief's published 83.9/73.6) — intentional, documented in `docs/scoring.md`. No fixes.

### Phase A decisions (v1 `PNL_V1` scoring mode) — scoring-engine agent, QA'd, no blockers

- **New pure module `lib/scoring/calculatePnlBattleScore.ts`** (file header names Phase D
  `lib/battles/settleBattle.ts` as the intended caller):
  `calculatePnlBattleScore(input: PnlBattleInput, config?: Partial<PnlScoringConfig>)` →
  `{ score, realizedPnl, participationBonus, closedTradeCount, tiebreakers, markOut }`.
  Score = realized PnL ($1 = 1 pt) + bonus (`pointsPerTrade * min(closedTrades, maxTrades)`).
  Tiebreakers: `{ profitFactor, winningTradeCount, tookTrade, firstGreenAtMs }`.
  `resolveBattleWinner(a, b)` → `{ outcome: "A"|"B"|"TIE", decidedBy: TiebreakerTier, detail }`.
- **Config additions (`lib/scoring/config.ts`, purely additive)**: `ScoringMode =
  "PNL_V1" | "NORMALIZED_4F"`, `DEFAULT_SCORING_MODE = "PNL_V1"`, `PnlScoringConfig`
  `{ pointsPerTrade: 5, maxTrades: 3 }` (cap +15), `resolvePnlScoringConfig(overrides?)` with
  validation (`maxTrades` must be a non-negative integer; fractional `pointsPerTrade` allowed as a
  tuning knob). **The 4-factor engine + its config are byte-identical — untouched per CLAUDE.md.**
- **Cascade order**: `SCORE` → `REALIZED_PNL` (realized + mark-out, i.e. score minus bonus) →
  `PROFIT_FACTOR` → `WINNING_TRADES` → `TOOK_TRADE` → `FIRST_GREEN` → explicit `DEAD_TIE`.
  The extra `REALIZED_PNL` tier reconciles "cascade starts at PnL" with "tiebreakers don't touch
  the headline number": a $10/1-trade (15 pts) beats $0/3-trades (15 pts). Comparisons use a 1e-9
  epsilon (float noise only — can't false-tie cents or epoch-ms). `Infinity === Infinity` profit
  factors short-circuit to the next tier safely.
- **Mark-out semantics (per v1-divergences)**: open position at window close with a provided
  `markPrice` → `markOut.status = "MARKED"`, signed PnL from `markPrice` + `pointValue` (short sign
  verified), included in `score` and the `REALIZED_PNL` tier but NOT in `realizedPnl`, the bonus,
  or per-trade tiebreakers; no mark price → `"EXCLUDED_NO_MARK"`, PnL 0, human-readable `note`.
- **`accountBracket` is an informational `string`** (e.g. "50K") — bracket matching happens
  upstream; Phase D's schema owns any bracket enum. **Dead ties return `outcome: "TIE"`** — rating
  treatment of draws is the settlement/rating caller's decision.
- **Tests**: `tests/pnlScoring.test.ts` (26) — bonus cap, −$3-beats-flat-0, PnL-gap-dominates-bonus,
  both-flat cascade/dead-tie, mark-out (long + short + excluded), every cascade tier, config
  validation, symmetry. **Total tests: 167** (all prior 141 + 26 new; 4F worked examples unchanged).
- **QA verdict (`qa-reviewer`): PASS, no blockers.** 2 minors fixed pre-commit (integer guard on
  `maxTrades`; `round2` on `participationBonus`). **Notes deliberately left for Phase D**:
  (1) `tiebreakers.profitFactor` can be `Infinity` — `JSON.stringify` turns it into `null`, so
  settlement persistence must store gross profit/loss (or a sentinel) instead of the raw number;
  (2) `ScoringMode` is declarative only — nothing dispatches on it yet; `settleBattle.ts` is where
  the mode gets consumed; (3) minor double-rounding (`realizedPnl` rounded before `score` sums it)
  — irrelevant for cent-denominated imports.

### Phase B decisions (Neon Postgres behind the repository interface) — data-seed agent, QA'd

- `lib/data/repositories/postgres/` implements the full `Repositories` interface via
  `drizzle-orm/neon-http` + `@neondatabase/serverless`; **zero caller changes**, `types.ts`
  untouched. `getRepositories()` selects by env: `DATABASE_URL` set → Postgres, unset → in-memory
  seed (singleton kept; import-time safe — the Neon client is only constructed when selected, so
  the no-env build/prerender is unaffected).
- **Shared derivation helpers** extracted to `lib/data/repositories/derive.ts` (leaderboards,
  standings/percentiles, history filters, firm standings, sorts) — both backends import the SAME
  functions; the refactor was verified byte-identical (613 method-output comparisons vs the
  pre-refactor impl). Postgres loads rows with deterministic id ordering and reuses the helpers —
  no rankings reimplemented in SQL. Timestamps normalized to the same ISO strings in
  `postgres/rows.ts`.
- Migrations: `drizzle.config.ts` (schema = tables.ts + authTables.ts, out `drizzle/`, url prefers
  `DATABASE_URL_UNPOOLED` for DDL); `drizzle/0000_init.sql` = 14 tables / 19 enums / 20 FKs.
  Scripts: `db:generate` / `db:migrate` / `db:push` / `db:seed`; `scripts/load-env.ts` reads
  `.env.local`/`.env` for CLI tools (no dotenv dep). `.env.example` committed (`!.env.example`
  negation in .gitignore).
- **`db:seed` is scoped, not truncate**: deletes exactly the seed dataset's rows by seed-authored
  ids (children-first) and re-inserts; firms + achievements are UPSERTED because real rows FK to
  them; real accounts/data are never touched. Older-seed leftovers require a fresh branch reset
  (documented in `docs/database.md`).
- Still pending Neon credentials: `db:migrate`, `db:seed`, live integration smoke.

### Phase C decisions (bridge auth — Auth.js v5 + seam) — data-seed + general-purpose, QA'd

- **Schema (`lib/data/schema/authTables.ts`)**: the four @auth/drizzle-adapter tables namespaced
  `auth_users` / `auth_accounts` / `auth_sessions` / `auth_verification_tokens` (TS property names
  match the adapter's default shape; auth timestamps `{withTimezone, mode:"date"}` unlike the
  domain's `mode:"string"`), plus nullable `passwordHash` on auth_users. Domain `users` gained
  nullable-UNIQUE `authUserId` FK → auth_users.id (SET NULL). Migration `drizzle/0001_*.sql`.
  Seeded users all `authUserId: null`.
- **Auth method: credentials (email+password, bcryptjs cost 10) + JWT sessions** (required for
  credentials); DrizzleAdapter wired with the custom tables for later OAuth/email providers. User
  rows are created by OUR sign-up server action, not the adapter: auth_users → domain users
  (`user-<uuid>`) → trader_profiles with defaults **rating 1500 → Silver II** (via
  `leagueForRating`), MFFU firm (by slug — requires `db:seed` to have run; honest error if not),
  NQ primary, BALANCED, 0–0, skill indicators 50/50/50; then auto sign-in. neon-http has no
  transactions → sequential inserts with best-effort unwind (documented). **MFFU account-id
  capture deferred to Phase D** (CSV import owns account identity).
- **The identity seam — `lib/auth/currentUser.ts`** (THE replaceable bridge): `getCurrentUser()`,
  `getCurrentTrader()`, `getCurrentIdentity()` (adds `isAuthenticated`/`isDemoFallback`), all
  React `cache()`d. Session → auth_users.id → users.auth_user_id → `traders.getById()`; falls back
  to `getDemoTrader()` when unauthenticated/unlinked/auth-disabled. All 9 `getDemoTrader()` call
  sites in app/ + components/ rewired (layout, dashboard, leagues, matchmaking, history,
  leaderboards, showcase.ts both loaders, profile loader → `loadCurrentProfile`). Repositories
  interface unchanged.
- **`isAuthEnabled()` requires BOTH `DATABASE_URL` and `AUTH_SECRET`** (`lib/auth/db.ts`): missing
  secret → logged warning + demo-fallback identity (Postgres reads keep working), never a crash.
  `getCurrentUser()` short-circuits before `auth()` when disabled → **no cookie read → the static
  route split is unchanged in the no-env build** (verified: `/`, `/leagues`, `/matchmaking`,
  `/profile`, `/scoring`, `/integrations`, `/signin` static; 15 routes). `/api/auth/*` returns 404
  in demo mode. On a DB-backed deploy these pages go dynamic (session read) — expected.
- **Rule-1 labeling** keys off `user.authUserId === null` (seeded) — real sign-ups never get
  "Simulated Demo Data"; header chip shows a "Demo user" tag + Sign in link on fallback, sign-out
  when authenticated. `/signin` = tabs sign-in/create-account (server actions, useActionState,
  disabled with honest notice when auth is off).
- **Fresh-trader robustness**: empty states for 0 battles (dashboard latest-battle card + sparkline
  placeholder, history empty vs no-match, neutral-50 skill copy); `tests/derive.test.ts` (4 tests)
  covers zero-battle standings/leaderboard/history. **Tests: 171.**
- QA (qa-reviewer): PASS with fixes — all three applied pre-commit (db:seed scoping = the HIGH;
  AUTH_SECRET guard; auth-API 404). Noted for Phase D: leaderboard/global demo notices are
  unconditional — on a DB deploy with real users the copy needs to become conditional ("includes
  seeded demo traders"); prefer a positive seed marker over the null-auth-link proxy once real
  trade data exists; sign-up email-enumeration + `trustHost` acceptable for the bridge only.
- Deps: `next-auth@5.0.0-beta.32`, `@auth/drizzle-adapter@1.11.3`, `bcryptjs@3.0.3` — no peer-dep
  friction on Next 16.2.10 / React 19.
- Live-smoked 2026-07-21 (see the Phase D writeup below for the credentialed session that also
  covered auth's session-identity path end to end through the real flow).

### Phase D decisions (CSV import → battle windows → settlement) — data-seed, scoring-engine,
simulation-engine, frontend-ui agents; QA'd; fixes applied post-QA

Ties A+B+C together into the real v1 loop: challenge → accept → scheduled window → off-platform
trading → CSV import (both sides) → settlement → settled result. Built across four agents in
parallel/pipeline, then a QA pass, then targeted fixes (some by follow-up agents, some applied
directly after the session hit its monthly spend limit mid-fix — see the QA/fix section below).

- **Schema (migration `drizzle/0002_bumpy_loki.sql`)**: `INTEGRATION_PROVIDERS` +`"csv"`;
  `BATTLE_STATUSES` +`"SETTLING"` (terminal settled state stays the existing `COMPLETED` — no
  separate `SETTLED` value, so every existing status check still works); new `CHALLENGE_STATUSES`,
  `SCORING_MODES` (kept in lockstep with `lib/scoring/config.ts`'s `ScoringMode` by convention, not
  import — schema never imports scoring). `battles` gained nullable `market` (null = open
  instrument choice), nullable `scheduledEnd`, `scoringMode` (default `NORMALIZED_4F`, so every
  seeded/legacy row is unaffected), nullable `accountBracket`/`decidedBy`/`resolutionDetail`.
  `battle_participants` gained nullable `tradingAccountId`/`endingRating`/`finalScore`/`result`
  (a v1 battle is created with unsettled participants) plus the PNL_V1 settlement columns
  (`realizedPnl`, `participationBonus`, `closedTradeCount`, `grossProfit`/`grossLoss` — **gross**
  profit/loss persisted, never a profit factor, since it can be `Infinity` and `JSON.stringify`s to
  `null`; `markOutPnl`/`markOutStatus`/`markOutNote`). New `challenges` and `market_bars` tables
  (the latter with a unique `(instrument, barStart)` index; imports upsert).
- **Repository surface** (`lib/data/repositories/types.ts`, both backends — in-memory + Postgres,
  byte-identical row shapes via shared `derive.ts` builders): `BattleRepository.create` /
  `listScheduledForUser` / `getScheduledById` / `updateStatus` / `saveSettlement` (idempotent —
  re-settling replaces the prior settlement rows; profile deltas are computed by reversing the
  battle's *previous* stored result before applying the new one, so a re-settle with a **changed**
  result doesn't double-count W/L — tested) / `saveImportedExecutions` (dedupes on
  provider+providerEventId+account) / `listImportedExecutions`; new `ChallengeRepository`
  (`respond` takes an optional `{ expectedStatus }` guard — a conditional update so a concurrent
  accept/decline/cancel racing the same challenge can't double-apply); new `MarketDataRepository`
  (`saveBars` upserts, `getMarkPrice` returns the close of the latest bar that **ends** at/before
  the query instant, within a 5-minute freshness window); `TraderRepository.findOrCreateCsvAccount`.
- **CSV provider + import pipeline** (`lib/integrations/providers/csv/`, `lib/executions/import/`):
  the real MFFU warehouse trade-export format (17 columns; `market_profit` in points, `net_profit`
  in dollars net of fees, naive-UTC timestamps) is parsed and integrity-checked (instrument
  resolves, recomputed points/dollars match the file within a cent/tick tolerance) BEFORE any
  record is emitted; each CLOSED row becomes an entry fill (0 commission) + exit fill (full fees)
  through the **existing, unmodified** `normalizeExecution → dedupe → positionLedger` pipeline, so
  realized PnL reproduces the file's `net_profit` to the cent. Deterministic `providerEventId`s make
  re-import a no-op. A separate 1-minute-OHLCV bars CSV format feeds `MarketDataRepository` for
  buzzer mark-outs only (never account P&L) — full format reference: `docs/csv-import.md`.
- **Window rules + settlement** (`lib/battles/{battleWindows,settleBattle,settlementService,
  challengeService}.ts`, all pure/DI'd, zero `Date.now`): `windowBoundsUtc` computes ET session
  bounds in UTC with correct US DST; `classifyWindow` (settleBattle.ts) is **the single source** of
  which trades count — entered AND exited in-window; entered-before-window excluded entirely;
  entered-in-window-but-exited-after aggregates into one markable open-at-close position (largest
  same-instrument/side bucket; the rest excluded and noted) — `settlementService`'s pre-settlement
  preview calls the same function so the two can never drift. Settlement scores via Phase A's
  `calculatePnlBattleScore`/`resolveBattleWinner`, applies ratings via
  `PNL_V1_RATING_CONFIG` (new: `lib/ratings/calculateRatingChange.ts`, `marginReference: 500` —
  dollar-scaled margin instead of the 0–100 score scale, still clamped so raw P&L can't dominate
  Elo), and rebuilds the persisted `resolutionDetail` with each trader's **display name** (not the
  scoring engine's internal "A"/"B" positional labels).
- **One trading account per battle per user**: `importForBattle` rejects a second CSV resolving to
  a different account for the same (battle, user) (`ACCOUNT_MISMATCH`); `settleScheduledBattle`
  refuses to replay stored events spanning more than one account as defense in depth.
- **Screens**: `/challenges` (incoming/outgoing/scheduled, create-challenge form) and
  `/battles/[id]` (window/status header, CSV import card, collapsed bars-import card,
  participant-gated settle button, inline settled PNL_V1 result once COMPLETED). The old `/battle`
  live-demo showcase and seeded `/battle/result`+`/battle/review` are untouched for
  `NORMALIZED_4F` battles; both routes now redirect a `PNL_V1` battle to `/battles/[id]` instead of
  rendering a misleading zeroed 4-factor breakdown (`components/battle-v1/labels.ts` centralizes
  the honest verification/status/decidedBy copy). Every displayed settlement number is a straight
  repo read — zero `lib/scoring`/`lib/ratings` imports in `app/`/`components/` (verified).
- **Labeling (Rule 1)**: imported trades/battles are `SELF_REPORTED` end to end, surfaced as
  "Self-reported (CSV import)" — never "Demo Verified"/`SIMULATED`. The global notice, footer, and
  leaderboards copy became dual-source honest ("seeded demo traders … imported battles are
  self-reported"); history/dashboard badges were already conditional on `authUserId === null` from
  Phase C and needed no change beyond their stale `metadata.description` strings.
- **QA (`qa-reviewer`) + fixes**: prod-server E2E smoke (the Phase B Turbopack server-minifier
  gotcha did **not** reproduce — PNL_V1 never touches `derivePipelineMetrics`) drove the real flow
  through `next build && next start` against Neon: challenge → accept → both CSVs imported →
  idempotent re-import (0 new/N duplicates) → bars imported → settle → named winner banner,
  mark-out row, rating deltas, "Self-reported" chip — then cleaned up and restored the seed. Found
  1 HIGH (legacy `/battle/review`+`/battle/result` mislabeled real settled battles "Simulated Demo
  Data") + 5 MEDIUM + 3 LOW; **all fixed**: the HIGH + labeling MEDIUMs (frontend-ui agent, then
  finished directly after that agent hit the session's spend limit mid-fix); the account-mismatch
  guard + `previewWindow`/`classifyWindow` drift risk (simulation-engine agent, same interruption);
  the `respond` conditional-update guard + `getMarkPrice` buzzer-boundary fix (data-seed agent,
  same interruption) — the boundary fix corrected `getMarkPrice`/`selectMarkPrice` to require the
  selected bar to **end** at/before the query instant (previously a bar could be selected whose
  close lagged up to a minute past the buzzer); the changed-result re-settlement test gap was
  closed directly. The double-accept race (originally just guarded, not fully closed — a losing
  concurrent accept could still create an orphan battle before hitting the guard) was closed by
  reordering `acceptChallenge` to run the guarded status transition BEFORE creating anything,
  verified with a dedicated concurrent-accept test. **Tests: 259** (up from 171 pre-Phase-D).
- **Session note**: three follow-up fix agents were interrupted mid-task by the account's monthly
  spend limit; their partial work was inventoried via `git status`/`git diff` and completed
  directly (no further subagents) rather than re-dispatched, to avoid repeating the failure.
- Still open (tracked in `../v1-divergences.md`, not blockers): self-supplied mark-out bars are
  participant-gated but not sourced from a platform market-data feed; overlapping scheduled
  battles settle off each battle's accept-time starting rating and a later settlement can
  overwrite an earlier one's rating movement.

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
- **Verification gates green as of the Phase D commit**: `npm run lint`, `npx tsc --noEmit`,
  `npm test` (**259/259**), `npm run seed`, `npm run build` without `DATABASE_URL` (17 routes;
  static split unchanged from Phase C — `/`, `/integrations`, `/leagues`, `/matchmaking`,
  `/profile`, `/scoring`, `/signin` static; new `/challenges` + `/battles/[id]` dynamic) and with
  it (all-dynamic, expected), prod-server (`next build && next start`) E2E against the live Neon
  dev DB covering the full challenge → import → settle loop (see "Phase D decisions" above) with
  cleanup back to the seeded baseline verified.
- The Phase B Turbopack server-chunk minifier bug is now confirmed **not** to affect the v1
  settlement path — PNL_V1 settlement never calls `derivePipelineMetrics` or the 4F engine
  server-side. It remains a live constraint for any FUTURE feature that runs the 4F battle engine
  server-side (e.g. SSR replay of the demo showcase).
