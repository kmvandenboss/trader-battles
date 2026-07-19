/**
 * The product brief's worked example (KevinV vs DeltaHunter), as a shared
 * fixture for tests, docs (docs/scoring.md), and seed regeneration.
 *
 * NOTE ON THE PUBLISHED FINALS: the brief lists final scores of 83.9 and
 * 73.6, but those figures were approximations. Honest arithmetic under the
 * default 40/25/20/15 weights gives:
 *
 *   KevinV      : 78·0.40 + 91·0.25 + 88·0.20 + 80·0.15 = 83.55
 *   DeltaHunter : 86·0.40 + 63·0.25 + 66·0.20 + 71·0.15 = 74.00
 *
 * The engine always does the honest arithmetic (`expectedFinal`). The seed's
 * showcase battle stores the published figures verbatim with a ±1.0
 * validator tolerance; from Phase 3 on, freshly computed battles use the
 * honest values. The essential property holds either way: KevinV wins by a
 * clear margin despite earning less gross profit, because his result came
 * with substantially less risk and better discipline.
 */

import type { ComponentScores } from "./types";

export interface WorkedExampleTrader {
  displayName: string;
  components: ComponentScores;
  /** Honest weighted total under the default 40/25/20/15 weights. */
  expectedFinal: number;
  /** The (approximated) figure published in docs/PRODUCT_BRIEF.md. */
  publishedFinal: number;
}

export const WORKED_EXAMPLE: {
  kevinV: WorkedExampleTrader;
  deltaHunter: WorkedExampleTrader;
} = {
  kevinV: {
    displayName: "KevinV",
    components: {
      performance: 78,
      riskEfficiency: 91,
      discipline: 88,
      consistency: 80,
    },
    expectedFinal: 83.55,
    publishedFinal: 83.9,
  },
  deltaHunter: {
    displayName: "DeltaHunter",
    components: {
      performance: 86,
      riskEfficiency: 63,
      discipline: 66,
      consistency: 71,
    },
    expectedFinal: 74.0,
    publishedFinal: 73.6,
  },
};
