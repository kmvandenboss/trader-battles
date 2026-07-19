# Ratings engine

Elo-style competitive rating, isolated from scoring.

Contents (implemented in Phase 2):

- `calculateRatingChange.ts` — expected outcome from both ratings, win/loss/
  draw, margin of victory in battle-score points (raw P&L is not even an
  input), match-completion scaling, and rule-violation dampening of gains.
  Configurable via `RatingConfig` / `DEFAULT_RATING_CONFIG`.

Tests: `tests/ratings.test.ts` (`npm test`).

Rules: pure functions, configurable parameters, unit-tested. Rating movement
is a competitive result, never described in financial or gambling terms.
