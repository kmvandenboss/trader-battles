/**
 * Rating engine unit tests.
 *
 * Covers: Elo expectation, symmetry (winner gain ≈ loser loss), underdog
 * bonus, margin-of-victory scaling in battle-score points (never dollars),
 * completion scaling, and rule-violation dampening.
 */

import { describe, expect, it } from "vitest";

import {
  calculateRatingChange,
  DEFAULT_RATING_CONFIG,
  type RatingChangeInput,
} from "@/lib/ratings/calculateRatingChange";

function win(overrides: Partial<RatingChangeInput> = {}): RatingChangeInput {
  return {
    playerRating: 1_600,
    opponentRating: 1_600,
    playerScore: 82,
    opponentScore: 70,
    result: "WIN",
    ...overrides,
  };
}

describe("calculateRatingChange", () => {
  it("a clean win between equals gains points; expectation is 0.5", () => {
    const r = calculateRatingChange(win());
    expect(r.breakdown.expectedOutcome).toBeCloseTo(0.5, 10);
    expect(r.change).toBeGreaterThan(0);
    expect(r.newRating).toBe(1_600 + r.change);
  });

  it("is symmetric-ish: winner gain ≈ loser loss with default config", () => {
    const winner = calculateRatingChange(win());
    const loser = calculateRatingChange(
      win({ result: "LOSS", playerScore: 70, opponentScore: 82 }),
    );
    // Same K, margin, and completion → equal magnitude up to integer rounding.
    expect(Math.abs(winner.change + loser.change)).toBeLessThanOrEqual(1);
  });

  it("an underdog win moves more points than a favorite win", () => {
    const underdog = calculateRatingChange(
      win({ playerRating: 1_500, opponentRating: 1_700 }),
    );
    const favorite = calculateRatingChange(
      win({ playerRating: 1_700, opponentRating: 1_500 }),
    );
    expect(underdog.change).toBeGreaterThan(favorite.change);
    expect(underdog.breakdown.expectedOutcome).toBeLessThan(0.5);
    expect(favorite.breakdown.expectedOutcome).toBeGreaterThan(0.5);
  });

  it("margin of victory is measured in battle-score points and scales the change", () => {
    const narrow = calculateRatingChange(
      win({ playerScore: 76, opponentScore: 75 }),
    );
    const wide = calculateRatingChange(
      win({ playerScore: 95, opponentScore: 60 }),
    );
    expect(wide.change).toBeGreaterThan(narrow.change);
    expect(narrow.breakdown.marginMultiplier).toBeLessThan(
      wide.breakdown.marginMultiplier,
    );
    // Margin multiplier is capped at the configured max.
    expect(wide.breakdown.marginMultiplier).toBe(
      DEFAULT_RATING_CONFIG.marginMultiplierMax,
    );
  });

  it("rule violations dampen a winner's gain", () => {
    const clean = calculateRatingChange(win());
    const dirty = calculateRatingChange(win({ playerViolationCount: 2 }));
    expect(dirty.change).toBeLessThan(clean.change);
    expect(dirty.breakdown.violationFactor).toBeCloseTo(0.7, 10);
    expect(dirty.change).toBeGreaterThan(0); // dampened, not reversed
  });

  it("violation dampening is capped", () => {
    const r = calculateRatingChange(win({ playerViolationCount: 10 }));
    expect(r.breakdown.violationFactor).toBeCloseTo(
      1 - DEFAULT_RATING_CONFIG.violationDampeningMax,
      10,
    );
  });

  it("violations do not soften a loss", () => {
    const loss = win({ result: "LOSS", playerScore: 70, opponentScore: 82 });
    const clean = calculateRatingChange(loss);
    const dirty = calculateRatingChange({
      ...loss,
      playerViolationCount: 3,
    });
    expect(dirty.breakdown.violationFactor).toBe(1);
    expect(dirty.change).toBe(clean.change);
  });

  it("partial matches move fewer points", () => {
    const full = calculateRatingChange(win());
    const half = calculateRatingChange(win({ completionRatio: 0.5 }));
    expect(half.breakdown.rawChange).toBeCloseTo(
      full.breakdown.rawChange / 2,
      6,
    );
    expect(Math.abs(half.change)).toBeLessThan(Math.abs(full.change));
  });

  it("a draw between equals moves nothing", () => {
    const r = calculateRatingChange(
      win({ result: "DRAW", playerScore: 75, opponentScore: 75 }),
    );
    expect(r.breakdown.actualOutcome).toBe(0.5);
    expect(r.change).toBe(0);
  });

  it("worked example: KevinV (1684) beating DeltaHunter (1712) gains a sensible amount", () => {
    const kevin = calculateRatingChange({
      playerRating: 1_684,
      opponentRating: 1_712,
      playerScore: 83.55,
      opponentScore: 74.0,
      result: "WIN",
    });
    const delta = calculateRatingChange({
      playerRating: 1_712,
      opponentRating: 1_684,
      playerScore: 74.0,
      opponentScore: 83.55,
      result: "LOSS",
    });
    expect(kevin.change).toBeGreaterThanOrEqual(5);
    expect(kevin.change).toBeLessThanOrEqual(40);
    expect(kevin.newRating).toBe(1_684 + kevin.change);
    expect(Math.abs(kevin.change + delta.change)).toBeLessThanOrEqual(1);
    // Slight underdog beats slight favorite → gains a bit more than K/2 * margin floor.
    expect(kevin.breakdown.expectedOutcome).toBeLessThan(0.5);
  });

  it("clamps a nonsensical completion ratio into 0–1", () => {
    const r = calculateRatingChange(win({ completionRatio: 4 }));
    expect(r.breakdown.completionFactor).toBe(1);
    const zero = calculateRatingChange(win({ completionRatio: -1 }));
    expect(zero.breakdown.completionFactor).toBe(0);
    expect(zero.change).toBe(0);
  });
});
