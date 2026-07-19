# Battles

Battle orchestration built on the execution pipeline and scoring engine.

- `battleEngine.ts` — drives a battle from raw provider events through
  `lib/executions/processExecutionEvent` to metrics, authoritative scores
  (`lib/scoring`), lead changes, feed events, commentary, final result, and
  rating changes (`lib/ratings`). Steppable + serializable: Phase 4's tick
  loop calls `createBattleState` / `advanceBattle` / `advanceBattleToTime` /
  `advanceBattleToEnd`.
- `matchmaking.ts` — expanding rating window (±50 → ±100 → ±175), market and
  queue filters, deterministic demo queue (KevinV matches DeltaHunter by
  default), commented plug-in points for future factors.
- `battleRules.ts` — battle windows/durations, demo account rule sets
  (permitted risk, daily loss limit, max contracts), severe-drawdown and
  alert thresholds.
- `scenarios.ts` — Demo Controls registry for the three deterministic
  scenarios (discipline-beats-raw-profit, comeback-victory,
  aggression-backfires).

The engine consumes `lib/executions/*` output and calls `lib/scoring/*`; it
never computes scores itself and cannot tell mock events from real ones.
Run one headlessly: `npm run battle -- <scenario-id>`.
