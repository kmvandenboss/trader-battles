# Scoring engine

Authoritative battle scoring. Pure, testable functions with configurable
weights (defaults: Performance 40% · Risk efficiency 25% · Discipline 20% ·
Consistency 15%; score range 0–100).

Contents (implemented in Phase 2):

- `calculateBattleScore.ts` — entry point; combines the four components,
  exports `ScoringConfig`, `DEFAULT_SCORING_CONFIG`, `combineComponentScores`,
  and re-exports the whole public contract.
- `calculatePerformanceScore.ts` — return vs permitted risk, profit factor,
  gain retention.
- `calculateRiskScore.ts` — drawdown usage, return/drawdown, avg trade risk,
  contract utilization.
- `calculateDisciplineScore.ts` — 100 minus explicit violation penalties
  (contract limit, excessive size, revenge sizing, overtrading, daily loss);
  exposes the violation list for UI events and "why you won" bullets.
- `calculateConsistencyScore.ts` — gain distribution, multi-trade gains,
  stability, time in severe drawdown.
- `types.ts` — `BattleMetricsInput` (what the Phase 3 pipeline must produce)
  and all result shapes.
- `config.ts` — every weight/threshold/penalty, with defaults.
- `workedExample.ts` — the brief's KevinV vs DeltaHunter fixture (honest
  finals 83.55 / 74.0; the brief's published 83.9 / 73.6 were approximations).

Tests: `tests/scoring.test.ts` (`npm test`).

Rules: no I/O, no framework imports, no UI concerns. UI components receive
already-computed scores and must never recompute them. Full model detail
belongs in `docs/scoring.md`.
