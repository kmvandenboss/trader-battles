/**
 * Rating engine — Elo-style competitive rating change.
 *
 * SERVER-SIDE AUTHORITATIVE — pure function, no I/O, no framework imports.
 * UI components receive already-computed rating changes and must never
 * recompute them. Rating movement is a competitive result, never described
 * in financial or gambling terms.
 *
 * Inputs deliberately EXCLUDE raw P&L. Rating movement is driven by:
 *   - expected outcome from both ratings (standard Elo expectation),
 *   - win / loss / draw,
 *   - margin of victory measured in BATTLE-SCORE points (the normalized
 *     0–100 score, never dollars — so raw P&L cannot dominate ratings),
 *   - match completion (partial matches move fewer points),
 *   - rule violations (a winner who broke rules gains less).
 *
 * Both participants are scored with the same K, margin multiplier, and
 * completion factor, so with no violations the winner's gain equals the
 * loser's loss (up to integer rounding).
 */

export interface RatingConfig {
  /** Base K-factor: maximum "clean, full-margin" swing is K · maxMultiplier. */
  kFactor: number;
  /** Elo logistic divisor (chess-standard 400). */
  eloDivisor: number;
  /** Battle-score margin at which the margin multiplier reaches its max. */
  marginReference: number;
  /** Multiplier for a razor-thin result (margin 0). */
  marginMultiplierMin: number;
  /** Multiplier at/beyond `marginReference` score points of margin. */
  marginMultiplierMax: number;
  /** Fractional dampening of a rating GAIN per rule violation. */
  violationDampeningPerViolation: number;
  /** Maximum total dampening from violations (0.5 = gains halved at most). */
  violationDampeningMax: number;
}

export const DEFAULT_RATING_CONFIG: RatingConfig = {
  kFactor: 32,
  eloDivisor: 400,
  marginReference: 25,
  marginMultiplierMin: 0.75,
  marginMultiplierMax: 1.5,
  violationDampeningPerViolation: 0.15,
  violationDampeningMax: 0.5,
};

/**
 * Rating config for v1 PNL_V1 battles (intended consumer: Phase D settlement,
 * `lib/battles/settleBattle.ts`).
 *
 * PNL_V1 headline scores are DOLLAR-scaled (realized PnL + capped
 * participation bonus — see `lib/scoring/calculatePnlBattleScore.ts`), not the
 * normalized 0–100 scores `marginReference: 25` was tuned for. With the
 * default, any $25+ gap would saturate the margin multiplier at 1.5×, making
 * margin meaningless for ordinary wins.
 *
 * `marginReference: 500` ramps the multiplier 0.75× → 1.5× over a $0 → $500
 * score gap, saturating at $500+ — roughly a decisive session on the primary
 * 50K account bracket. The clamp on the margin ratio keeps raw P&L from ever
 * dominating (CLAUDE.md rule: rating movement is Elo-driven; P&L only
 * modulates margin within [0.75, 1.5]). Config only — the rating math is
 * unchanged.
 */
export const PNL_V1_RATING_CONFIG: RatingConfig = {
  ...DEFAULT_RATING_CONFIG,
  marginReference: 500,
};

export interface RatingChangeInput {
  playerRating: number;
  opponentRating: number;
  /** Final normalized battle score (0–100) — NOT dollars. */
  playerScore: number;
  opponentScore: number;
  result: "WIN" | "LOSS" | "DRAW";
  /** Fraction of the match completed, 0–1. Defaults to 1 (full match). */
  completionRatio?: number;
  /** Player's rule-violation count (dampens gains). Defaults to 0. */
  playerViolationCount?: number;
}

export interface RatingChangeBreakdown {
  /** Elo win expectation for the player, 0–1. */
  expectedOutcome: number;
  /** 1 for WIN, 0.5 for DRAW, 0 for LOSS. */
  actualOutcome: number;
  kFactor: number;
  /** Multiplier from the battle-score margin of victory. */
  marginMultiplier: number;
  /** Multiplier from match completion (0–1). */
  completionFactor: number;
  /** Multiplier from rule violations (applies to gains only). */
  violationFactor: number;
  /** Change before rounding to a whole rating point. */
  rawChange: number;
}

export interface RatingChangeResult {
  /** Whole rating points gained (positive) or lost (negative). */
  change: number;
  newRating: number;
  breakdown: RatingChangeBreakdown;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

const ACTUAL_OUTCOME: Record<RatingChangeInput["result"], number> = {
  WIN: 1,
  DRAW: 0.5,
  LOSS: 0,
};

/** Compute one participant's rating change for a completed battle. */
export function calculateRatingChange(
  input: RatingChangeInput,
  config: RatingConfig = DEFAULT_RATING_CONFIG,
): RatingChangeResult {
  const {
    playerRating,
    opponentRating,
    playerScore,
    opponentScore,
    result,
  } = input;
  const completionFactor = clamp01(input.completionRatio ?? 1);
  const violations = Math.max(0, input.playerViolationCount ?? 0);

  // Standard Elo expectation from both ratings.
  const expectedOutcome =
    1 /
    (1 + Math.pow(10, (opponentRating - playerRating) / config.eloDivisor));
  const actualOutcome = ACTUAL_OUTCOME[result];

  // Margin of victory in normalized battle-score points (never dollars).
  const margin = clamp01(
    Math.abs(playerScore - opponentScore) / config.marginReference,
  );
  const marginMultiplier =
    config.marginMultiplierMin +
    (config.marginMultiplierMax - config.marginMultiplierMin) * margin;

  const rawBeforeViolations =
    config.kFactor *
    marginMultiplier *
    completionFactor *
    (actualOutcome - expectedOutcome);

  // Violations dampen GAINS only: a rule-breaking winner earns less, while a
  // rule-breaking loser's violations already cost them battle score & margin.
  const violationFactor =
    rawBeforeViolations > 0
      ? 1 -
        Math.min(
          violations * config.violationDampeningPerViolation,
          config.violationDampeningMax,
        )
      : 1;

  const rawChange = rawBeforeViolations * violationFactor;
  const change = Math.round(rawChange);

  return {
    change,
    newRating: playerRating + change,
    breakdown: {
      expectedOutcome,
      actualOutcome,
      kFactor: config.kFactor,
      marginMultiplier,
      completionFactor,
      violationFactor,
      rawChange,
    },
  };
}
