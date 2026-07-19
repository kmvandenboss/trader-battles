# Build state — handoff doc

> Purpose: lets a fresh Claude Code session pick up this build mid-flight without re-reading the whole
> history. Update after every phase. Read CLAUDE.md + docs/PRODUCT_BRIEF.md first; this doc only records
> what's DONE and what's NEXT.

## How this build is being run

- Following the phase plan in `KICKOFF.md`, delegating each phase to the matching `.claude/agents/` agent.
- After each phase: verify (build/lint/test), commit to git, update this doc.
- QA passes with the qa-reviewer agent after major phases and before "done".
- User (Kevin) is hands-off; proceed autonomously, ask only when genuinely blocked.

## Phase status

| Phase | Status | Commit |
|---|---|---|
| 0 — Scaffold | ✅ done | `ebd92d8` |
| 1 — Data model + seed | ✅ done | `11a8d98` |
| 2 — Scoring + rating engines | ✅ done | `c9b9eb4` |
| 3 — Mock provider / pipeline / battle engine | ⏳ next | |
| 4 — Live Battle screen | pending | |
| 5 — Matchmaking flow | pending | |
| 6 — Dashboard, result, review | pending | |
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

## Known state / gotchas

- **Worked-example arithmetic**: the brief's component scores (78/91/88/80 vs 86/63/66/71) under strict
  40/25/20/15 weights give **83.55 / 74.0**, not the brief's published 83.9/73.6. Seed validator allows
  ±1.0 tolerance on the showcase battle. Scoring engine (Phase 2) must document/handle this.
- DeltaHunter's derived current streak is a LOSS streak (he just lost the showcase battle); his 21–13 /
  1712 are exact per spec.
- Historical seed battle scores are authored demo data, internally consistent with 40/25/20/15 weights;
  plug-in points to regenerate via lib/scoring are commented in `buildDataset.ts` + `constants.ts`.
- Git repo initialized on `main`; no remote yet.
- Subagent IDs (SendMessage to continue): frontend-ui `ae1a75fb3298ec217`, data-seed `a48aa214eb1089c5f`
  (same-session only — useless to a fresh session).
