# Ratings engine

Elo-style competitive rating, isolated from scoring.

Will contain (Phase 4):

- `calculateRatingChange.ts` — margin of victory and rule violations factor
  in; raw P&L must NOT dominate rating movement.

Rules: pure functions, configurable parameters, unit-tested. Rating movement
is a competitive result, never described in financial or gambling terms.
