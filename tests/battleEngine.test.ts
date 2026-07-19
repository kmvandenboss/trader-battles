/**
 * Battle engine + scenario tests: determinism, stepping equivalence, the
 * three demo scenarios' required narrative properties, and the guarantee
 * that final authoritative scores come from the engine (never the UI).
 */

import { describe, expect, it } from "vitest";

import {
  advanceBattle,
  advanceBattleToEnd,
  advanceBattleToTime,
  createBattleState,
  getBattleProgress,
  getFeedSince,
  type BattleEngineState,
} from "@/lib/battles/battleEngine";
import { SCENARIOS, type ScenarioId } from "@/lib/battles/scenarios";
import { generateBattleScript } from "@/lib/integrations/providers/mock/mockEventGenerator";
import { WORKED_EXAMPLE } from "@/lib/scoring/workedExample";

function runToEnd(scenarioId: ScenarioId, chunk = 40): BattleEngineState {
  let state = createBattleState(scenarioId);
  while (state.status !== "COMPLETED") {
    state = advanceBattle(state, chunk);
  }
  return state;
}

function participantOf(state: BattleEngineState, userId: string) {
  const final = state.finalResult;
  if (!final) throw new Error("battle not finalized");
  const participant = final.participants.find((p) => p.userId === userId);
  if (!participant) throw new Error(`no participant ${userId}`);
  return participant;
}

describe("battle script generation", () => {
  it("is deterministic — same scenario, byte-identical script", () => {
    const a = generateBattleScript("discipline-beats-raw-profit");
    const b = generateBattleScript("discipline-beats-raw-profit");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("emits only SIMULATED raw events through the mock provider", () => {
    const script = generateBattleScript("comeback-victory");
    const executions = script.timeline.filter((i) => i.kind === "EXECUTION");
    expect(executions.length).toBeGreaterThan(0);
    for (const item of executions) {
      if (item.kind !== "EXECUTION") continue;
      expect(item.record.sourceProvider).toBe("mock");
      expect(item.record.verificationStatus).toBe("SIMULATED");
    }
  });

  it("price path is tick-aligned and one point per minute", () => {
    const script = generateBattleScript("aggression-backfires");
    expect(script.pricePath).toHaveLength(
      Math.round(script.durationMs / 60_000) + 1,
    );
    for (const point of script.pricePath) {
      expect((point.price * 4) % 1).toBeCloseTo(0, 10); // 0.25 tick
    }
  });
});

describe("battle engine determinism", () => {
  it("replays identically: same feed and final result across runs", () => {
    const a = runToEnd("discipline-beats-raw-profit");
    const b = runToEnd("discipline-beats-raw-profit");
    expect(JSON.stringify(a.feed)).toBe(JSON.stringify(b.feed));
    expect(JSON.stringify(a.finalResult)).toBe(JSON.stringify(b.finalResult));
  });

  it("stepping granularity does not change the outcome", () => {
    const oneByOne = runToEnd("comeback-victory", 1);
    const chunked = runToEnd("comeback-victory", 500);
    const jumped = advanceBattleToEnd(createBattleState("comeback-victory"));
    expect(JSON.stringify(oneByOne.finalResult)).toBe(
      JSON.stringify(chunked.finalResult),
    );
    expect(JSON.stringify(oneByOne.feed)).toBe(JSON.stringify(jumped.feed));
  });

  it("advanceBattleToTime catches up to the battle clock", () => {
    let state = createBattleState("discipline-beats-raw-profit");
    state = advanceBattleToTime(state, 30 * 60_000);
    expect(state.clockMs).toBe(30 * 60_000);
    expect(state.status).toBe("LIVE");
    const progress = getBattleProgress(state);
    expect(progress.fractionComplete).toBeCloseTo(0.25, 5);
    const resumed = advanceBattleToEnd(state);
    const straight = advanceBattleToEnd(
      createBattleState("discipline-beats-raw-profit"),
    );
    expect(JSON.stringify(resumed.finalResult)).toBe(
      JSON.stringify(straight.finalResult),
    );
  });

  it("state snapshots survive JSON round-trips (serializable)", () => {
    let state = createBattleState("discipline-beats-raw-profit");
    state = advanceBattle(state, 80);
    const revived = JSON.parse(JSON.stringify(state)) as BattleEngineState;
    const fromRevived = advanceBattleToEnd(revived);
    const fromOriginal = advanceBattleToEnd(state);
    expect(JSON.stringify(fromRevived.finalResult)).toBe(
      JSON.stringify(fromOriginal.finalResult),
    );
  });

  it("exposes incremental feed reads for the UI", () => {
    const state = runToEnd("discipline-beats-raw-profit");
    const mid = state.feed[Math.floor(state.feed.length / 2)];
    const rest = getFeedSince(state, mid.sequence);
    expect(rest[0]?.sequence).toBe(mid.sequence + 1);
    expect(rest.length).toBe(state.feed.length - mid.sequence);
  });
});

describe("scenario: discipline-beats-raw-profit", () => {
  const state = runToEnd("discipline-beats-raw-profit");
  const final = state.finalResult!;
  const kevin = participantOf(state, "user-kevinv");
  const delta = participantOf(state, "user-deltahunter");

  it("KevinV wins on normalized score despite less raw profit", () => {
    expect(final.winnerUserId).toBe("user-kevinv");
    expect(kevin.result).toBe("WIN");
    expect(delta.netPnl).toBeGreaterThan(kevin.netPnl);
    expect(delta.metrics.grossProfit).toBeGreaterThan(
      kevin.metrics.grossProfit,
    );
  });

  it("lands in the neighborhood of the brief's worked example", () => {
    expect(
      Math.abs(kevin.finalScore.total - WORKED_EXAMPLE.kevinV.expectedFinal),
    ).toBeLessThanOrEqual(4);
    expect(
      Math.abs(
        delta.finalScore.total - WORKED_EXAMPLE.deltaHunter.expectedFinal,
      ),
    ).toBeLessThanOrEqual(4);
    expect(kevin.finalScore.total - delta.finalScore.total).toBeGreaterThan(5);
  });

  it("opponent uses much more drawdown", () => {
    expect(delta.maxDrawdown).toBeGreaterThan(kevin.maxDrawdown * 1.5);
    expect(delta.violations.length).toBeGreaterThan(0);
  });

  it("the injected duplicate delivery is dropped by the pipeline", () => {
    const kevinLive = state.participants["user-kevinv"];
    expect(kevinLive.pipeline.duplicateCount).toBe(1);
    expect(kevinLive.pipeline.rejectedCount).toBe(0);
  });

  it("rating changes come from the rating engine with sane direction", () => {
    expect(kevin.ratingChange.change).toBeGreaterThan(0);
    expect(delta.ratingChange.change).toBeLessThan(0);
    expect(kevin.ratingChange.newRating).toBe(1684 + kevin.ratingChange.change);
  });

  it("emits the full battle life cycle in the feed", () => {
    const types = new Set(state.feed.map((event) => event.type));
    for (const required of [
      "BATTLE_START",
      "ENTRY",
      "EXIT",
      "LEAD_CHANGE",
      "DRAWDOWN_ALERT",
      "DISCIPLINE_PENALTY",
      "TIME_REMAINING",
      "COMMENTARY",
      "BATTLE_END",
    ]) {
      expect(types.has(required as never), `missing ${required}`).toBe(true);
    }
  });
});

describe("scenario: comeback-victory", () => {
  const state = runToEnd("comeback-victory");
  const final = state.finalResult!;
  const kevin = participantOf(state, "user-kevinv");

  it("KevinV wins after trailing early", () => {
    expect(final.winnerUserId).toBe("user-kevinv");
  });

  it("has at least one lead change", () => {
    expect(final.leadChanges).toBeGreaterThanOrEqual(1);
  });

  it("shows an early deficit: negative P&L and trailing score", () => {
    const kevinHistory = state.participants["user-kevinv"].history;
    const deltaHistory = state.participants["user-deltahunter"].history;
    const behindEarly = kevinHistory.some((point, index) => {
      const other = deltaHistory[index];
      return (
        point.elapsedMs < state.durationMs / 2 &&
        point.netPnl < 0 &&
        other !== undefined &&
        point.score < other.score
      );
    });
    expect(behindEarly).toBe(true);
  });

  it("KevinV reduces size after the early losses (no revenge sizing)", () => {
    const sizes = kevin.metrics.trades.map((trade) => trade.size);
    expect(sizes[0]).toBe(2);
    expect(sizes[sizes.length - 1]).toBe(1);
    expect(Math.max(...sizes.slice(2))).toBe(1);
    expect(kevin.violations).toHaveLength(0);
  });
});

describe("scenario: aggression-backfires", () => {
  const state = runToEnd("aggression-backfires");
  const final = state.finalResult!;
  const kevin = participantOf(state, "user-kevinv");
  const delta = participantOf(state, "user-deltahunter");

  it("DeltaHunter wins on score", () => {
    expect(final.winnerUserId).toBe("user-deltahunter");
    expect(delta.finalScore.total).toBeGreaterThan(kevin.finalScore.total);
  });

  it("KevinV takes revenge-sizing and oversized-position penalties", () => {
    const types = kevin.violations.map((violation) => violation.type);
    expect(types).toContain("REVENGE_SIZING");
    expect(types).toContain("EXCESSIVE_CONTRACT_SIZE");
    const penaltyFeed = state.feed.filter(
      (event) =>
        event.type === "DISCIPLINE_PENALTY" && event.userId === "user-kevinv",
    );
    expect(penaltyFeed.length).toBeGreaterThanOrEqual(2);
  });

  it("KevinV briefly holds the P&L lead but loses anyway", () => {
    const kevinHistory = state.participants["user-kevinv"].history;
    const deltaHistory = state.participants["user-deltahunter"].history;
    const heldPnlLead = kevinHistory.some((point, index) => {
      const other = deltaHistory[index];
      return other !== undefined && point.netPnl > other.netPnl + 100;
    });
    expect(heldPnlLead).toBe(true);
    expect(kevin.result).toBe("LOSS");
  });
});

describe("engine authority over scores", () => {
  it("final result carries full authoritative score breakdowns", () => {
    const state = runToEnd("discipline-beats-raw-profit");
    for (const participant of state.finalResult!.participants) {
      // UI receives computed totals + components; nothing left to compute.
      expect(participant.finalScore.total).toBeGreaterThan(0);
      expect(participant.finalScore.total).toBeLessThanOrEqual(100);
      const { components, weights } = participant.finalScore;
      expect(components.performance.factors.length).toBeGreaterThan(0);
      expect(components.riskEfficiency.factors.length).toBeGreaterThan(0);
      expect(components.consistency.factors.length).toBeGreaterThan(0);
      expect(components.discipline.score).toBeLessThanOrEqual(100);
      const weightSum =
        weights.performance +
        weights.riskEfficiency +
        weights.discipline +
        weights.consistency;
      expect(weightSum).toBeCloseTo(1, 10);
      expect(participant.reasons.length).toBeGreaterThan(0);
      expect(participant.ratingChange.breakdown).toBeDefined();
    }
  });

  it("every scenario in the registry completes with its expected winner", () => {
    for (const scenario of SCENARIOS) {
      const state = runToEnd(scenario.id);
      expect(state.finalResult?.winnerUserId).toBe(
        scenario.expectedWinnerUserId,
      );
    }
  });
});
