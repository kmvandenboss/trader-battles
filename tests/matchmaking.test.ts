/**
 * Matchmaking tests: expanding rating window, deterministic opponent
 * selection (KevinV -> DeltaHunter with defaults), and filters.
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_RATING_STAGES,
  DEMO_RATING_STAGES,
  createMatchmakingPlan,
  getDemoQueue,
  getRatingWindow,
  searchForOpponent,
  type MatchmakingRequest,
} from "@/lib/battles/matchmaking";

const KEVIN_REQUEST: MatchmakingRequest = {
  userId: "user-kevinv",
  rating: 1684,
  market: "NQ",
  battleWindow: "MIDDAY",
  battleType: "LIVE_PERFORMANCE",
};

describe("rating window expansion", () => {
  it("widens 50 -> 100 -> 175 points over time (brief spec)", () => {
    expect(getRatingWindow(0).windowPoints).toBe(50);
    expect(getRatingWindow(9_999).windowPoints).toBe(50);
    expect(getRatingWindow(10_000).windowPoints).toBe(100);
    expect(getRatingWindow(19_999).windowPoints).toBe(100);
    expect(getRatingWindow(20_000).windowPoints).toBe(175);
    expect(getRatingWindow(600_000).windowPoints).toBe(175);
  });

  it("demo stages use the same windows on a faster clock", () => {
    expect(DEMO_RATING_STAGES.map((s) => s.windowPoints)).toEqual(
      DEFAULT_RATING_STAGES.map((s) => s.windowPoints),
    );
    expect(DEMO_RATING_STAGES[0].untilMs).toBeLessThan(
      DEFAULT_RATING_STAGES[0].untilMs,
    );
  });
});

describe("opponent search", () => {
  it("matches KevinV with DeltaHunter using default settings", () => {
    const status = searchForOpponent(KEVIN_REQUEST, 5_000);
    expect(status.state).toBe("MATCHED");
    if (status.state !== "MATCHED") return;
    expect(status.opponent.userId).toBe("user-deltahunter");
    expect(status.opponent.displayName).toBe("DeltaHunter");
    expect(status.opponent.rating).toBe(1712);
  });

  it("only matches distant ratings after the window expands", () => {
    const farQueue = getDemoQueue().filter(
      (candidate) => candidate.userId === "user-trendtitan", // 1815, +131
    );
    expect(farQueue).toHaveLength(1);
    const early = searchForOpponent(KEVIN_REQUEST, 5_000, farQueue);
    expect(early.state).toBe("SEARCHING");
    const mid = searchForOpponent(KEVIN_REQUEST, 15_000, farQueue);
    expect(mid.state).toBe("SEARCHING"); // still outside ±100
    const late = searchForOpponent(KEVIN_REQUEST, 25_000, farQueue);
    expect(late.state).toBe("MATCHED");
    if (late.state === "MATCHED") {
      expect(late.opponent.userId).toBe("user-trendtitan");
      expect(late.windowPoints).toBe(175);
    }
  });

  it("filters by market: no compatible trader means no match", () => {
    const status = searchForOpponent(
      { ...KEVIN_REQUEST, market: "CL" },
      30_000,
    );
    // Only MacroMiles trades CL in the demo queue, 207 points away.
    expect(status.state).toBe("SEARCHING");
    expect(status.state === "SEARCHING" && status.statusMessage).toContain(
      "±175",
    );
  });

  it("never matches a player against themselves", () => {
    const queue = getDemoQueue();
    const request: MatchmakingRequest = {
      ...KEVIN_REQUEST,
      userId: "user-deltahunter",
      rating: 1712,
    };
    const status = searchForOpponent(request, 5_000, queue);
    expect(status.state === "MATCHED" && status.opponent.userId).not.toBe(
      "user-deltahunter",
    );
  });
});

describe("matchmaking plan (UI playback)", () => {
  it("is deterministic and staged", () => {
    const a = createMatchmakingPlan(KEVIN_REQUEST);
    const b = createMatchmakingPlan(KEVIN_REQUEST);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.opponent.userId).toBe("user-deltahunter");
    expect(a.matchedAtMs).toBeGreaterThanOrEqual(4_000); // presentation pacing
    expect(a.ticks.length).toBeGreaterThanOrEqual(2);
    expect(a.ticks[0].atMs).toBe(0);
    const lastTick = a.ticks[a.ticks.length - 1];
    expect(lastTick.message).toContain("Opponent found");
  });
});
