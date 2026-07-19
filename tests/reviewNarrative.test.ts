/**
 * Review-narrative tests: the derivation is a pure projection over
 * already-computed scores. Verified against the seeded showcase battle
 * (KevinV beats DeltaHunter despite less raw P&L — the brief's worked example).
 */

import { describe, expect, it } from "vitest";

import { getRepositories } from "@/lib/data/repositories";
import {
  buildComponentEdges,
  deriveReviewNarrative,
  type ParticipantNarrativeInput,
} from "@/lib/battles/reviewNarrative";

async function showcaseInputs(): Promise<{
  kevin: ParticipantNarrativeInput;
  delta: ParticipantNarrativeInput;
}> {
  const { traders, battles } = getRepositories();
  const demo = await traders.getDemoTrader();
  const battle = await battles.getLatestForUser(demo.user.id);
  if (!battle) throw new Error("showcase battle missing");
  const [a, b] = battle.participants;
  const kevinSummary = a.trader.user.id === demo.user.id ? a : b;
  const deltaSummary = a.trader.user.id === demo.user.id ? b : a;
  return {
    kevin: {
      displayName: kevinSummary.trader.user.displayName,
      won: kevinSummary.participant.result === "WIN",
      metrics: kevinSummary.metrics,
    },
    delta: {
      displayName: deltaSummary.trader.user.displayName,
      won: deltaSummary.participant.result === "WIN",
      metrics: deltaSummary.metrics,
    },
  };
}

describe("deriveReviewNarrative (seeded showcase battle)", () => {
  it("leads with the normalized 'won with less raw P&L' reason for the winner", async () => {
    const { kevin, delta } = await showcaseInputs();
    expect(kevin.won).toBe(true);
    // Winner made less gross P&L than the loser in the worked example.
    expect(delta.metrics.netPnl).toBeGreaterThan(kevin.metrics.netPnl);

    const narrative = deriveReviewNarrative(kevin, delta);
    expect(narrative.reasons[0]).toMatch(/less raw P&L/i);
    expect(narrative.reasons.length).toBeGreaterThan(0);
    expect(narrative.reasons.length).toBeLessThanOrEqual(5);
  });

  it("produces four component edges favouring the winner on the decisive ones", async () => {
    const { kevin, delta } = await showcaseInputs();
    const edges = buildComponentEdges(kevin.metrics, delta.metrics);
    expect(edges.map((e) => e.key)).toEqual([
      "performance",
      "riskEfficiency",
      "discipline",
      "consistency",
    ]);
    // Kevin's decisive edge in the worked example is risk efficiency + discipline.
    const discipline = edges.find((e) => e.key === "discipline")!;
    expect(discipline.favored).toBe("self");
    expect(discipline.self).toBeGreaterThan(discipline.other);
  });

  it("writes coaching framed as competitive skill, with no gambling/profit language", async () => {
    const { kevin, delta } = await showcaseInputs();
    const { coaching } = deriveReviewNarrative(kevin, delta);
    expect(coaching.length).toBeGreaterThan(40);
    expect(coaching).not.toMatch(/\b(bet|wager|jackpot|odds|profit|profitable|make money)\b/i);
    expect(coaching).toContain("KevinV");
  });

  it("frames the loser's narrative around giving the edge back", async () => {
    const { kevin, delta } = await showcaseInputs();
    // Perspective flipped: write for DeltaHunter (the loser).
    const narrative = deriveReviewNarrative(delta, kevin);
    expect(narrative.reasons.some((r) => /Out-earned/i.test(r))).toBe(true);
  });
});
