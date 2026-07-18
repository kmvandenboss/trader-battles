# Scoring engine

Authoritative battle scoring. Pure, testable functions with configurable
weights (defaults: Performance 40% · Risk efficiency 25% · Discipline 20% ·
Consistency 15%; score range 0–100).

Will contain (Phase 4):

- `calculateBattleScore.ts` — combines the four components.
- `calculatePerformanceScore.ts`
- `calculateRiskScore.ts`
- `calculateDisciplineScore.ts`
- `calculateConsistencyScore.ts`

Rules: no I/O, no framework imports, no UI concerns. UI components receive
already-computed scores and must never recompute them. Full model detail
belongs in `docs/scoring.md`.
