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
| 1 — Data model + seed | ⏳ next | |
| 2 — Scoring + rating engines | pending | |
| 3 — Mock provider / pipeline / battle engine | pending | |
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

## Known state / gotchas

- `lib/` contains only README stubs + `lib/integrations/types.ts` placeholder — no real code yet.
- `scripts/seed.ts` is a placeholder; Phase 1 replaces it.
- Git repo initialized on `main`; no remote yet.
