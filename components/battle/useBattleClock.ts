"use client";

/**
 * BattleClock — the client-side playback transport for a live battle.
 *
 * THIS IS THE TRANSPORT SEAM. A timed tick loop owns the battle-engine state
 * and drives it forward through the engine's pure stepping API
 * (`createBattleState` / `advanceBattleToTime` / `advanceBattle` /
 * `advanceBattleToEnd`). UI components consume ONLY this hook's outputs and
 * never call engine functions themselves.
 *
 * PLUG-IN POINT FOR REAL INTEGRATIONS: to go live, replace this hook's
 * interval loop with an SSE / WebSocket subscription that delivers engine
 * snapshots (or feed deltas) from the server. The output shape
 * (`BattleClockOutput`) stays identical, so no UI component changes.
 *
 * The clock computes NOTHING authoritative — scores, feed events, leader,
 * and final results all come from the engine, which in turn only calls
 * lib/scoring + lib/ratings. The only thing owned here is the playhead
 * (how much simulated battle time the demo has revealed so far).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  advanceBattle,
  advanceBattleToEnd,
  advanceBattleToTime,
  createBattleState,
  getBattleProgress,
  getFeedSince,
  type BattleEngineState,
  type BattleFeedEvent,
  type BattleProgress,
} from "@/lib/battles/battleEngine";
import { DEFAULT_SCENARIO_ID, type ScenarioId } from "@/lib/battles/scenarios";

export type BattleClockStatus = "ready" | "live" | "paused" | "final";
export type BattleClockSpeed = 1 | 2 | 4;

export const BATTLE_CLOCK_SPEEDS: readonly BattleClockSpeed[] = [1, 2, 4];

/** Real-time interval between engine catch-up ticks. */
const TICK_INTERVAL_MS = 200;
/**
 * Simulated battle ms revealed per real ms at 1x. 30x compression plays a
 * 90-minute Opening Bell battle in ~3 minutes (45s at 4x).
 */
const BASE_TIME_COMPRESSION = 30;

export interface BattleClockControls {
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  advanceOneEvent: () => void;
  setSpeed: (speed: BattleClockSpeed) => void;
  finishNow: () => void;
  selectScenario: (scenarioId: ScenarioId) => void;
}

export interface BattleClockOutput {
  scenarioId: ScenarioId;
  status: BattleClockStatus;
  speed: BattleClockSpeed;
  /** Full engine snapshot (read-only — scores are engine-computed). */
  state: BattleEngineState;
  progress: BattleProgress;
  /** Feed accumulated incrementally via getFeedSince (oldest first). */
  feed: BattleFeedEvent[];
  /** Smooth presentation clock (ms of battle time revealed), for countdowns. */
  elapsedMs: number;
  remainingMs: number;
  controls: BattleClockControls;
}

interface ClockCore {
  scenarioId: ScenarioId;
  status: BattleClockStatus;
  speed: BattleClockSpeed;
  state: BattleEngineState;
  playheadMs: number;
  /** Feed accumulated incrementally through getFeedSince. */
  feed: BattleFeedEvent[];
  lastFeedSequence: number;
}

/** Incremental feed read — only pulls entries newer than the last sequence. */
function accumulateFeed(
  prev: Pick<ClockCore, "feed" | "lastFeedSequence">,
  state: BattleEngineState,
): Pick<ClockCore, "feed" | "lastFeedSequence"> {
  // Always return a narrow object: callers spread the result into ClockCore.
  if (state.feedSequence <= prev.lastFeedSequence) {
    return { feed: prev.feed, lastFeedSequence: prev.lastFeedSequence };
  }
  return {
    feed: [...prev.feed, ...getFeedSince(state, prev.lastFeedSequence)],
    lastFeedSequence: state.feedSequence,
  };
}

function freshCore(
  scenarioId: ScenarioId,
  speed: BattleClockSpeed,
): ClockCore {
  const state = createBattleState(scenarioId);
  return {
    scenarioId,
    status: "ready",
    speed,
    state,
    playheadMs: 0,
    ...accumulateFeed({ feed: [], lastFeedSequence: 0 }, state),
  };
}

export function useBattleClock(
  initialScenarioId: ScenarioId = DEFAULT_SCENARIO_ID,
): BattleClockOutput {
  const [core, setCore] = useState<ClockCore>(() =>
    freshCore(initialScenarioId, 1),
  );

  // ---- tick loop (the part a live transport would replace) ----------------
  useEffect(() => {
    if (core.status !== "live") return;
    let lastTick = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const deltaMs = now - lastTick;
      lastTick = now;
      setCore((prev) => {
        if (prev.status !== "live") return prev;
        const playheadMs = Math.min(
          prev.state.durationMs,
          prev.playheadMs + deltaMs * BASE_TIME_COMPRESSION * prev.speed,
        );
        const state = advanceBattleToTime(prev.state, playheadMs);
        return {
          ...prev,
          playheadMs,
          state,
          status: state.status === "COMPLETED" ? "final" : prev.status,
          ...accumulateFeed(prev, state),
        };
      });
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [core.status, core.speed]);

  // ---- controls -----------------------------------------------------------
  const start = useCallback(() => {
    setCore((prev) =>
      prev.status === "ready" ? { ...prev, status: "live" } : prev,
    );
  }, []);

  const pause = useCallback(() => {
    setCore((prev) =>
      prev.status === "live" ? { ...prev, status: "paused" } : prev,
    );
  }, []);

  const resume = useCallback(() => {
    setCore((prev) =>
      prev.status === "paused" ? { ...prev, status: "live" } : prev,
    );
  }, []);

  const reset = useCallback(() => {
    setCore((prev) => freshCore(prev.scenarioId, prev.speed));
  }, []);

  const advanceOneEvent = useCallback(() => {
    setCore((prev) => {
      if (prev.status === "final") return prev;
      const state = advanceBattle(prev.state, 1);
      return {
        ...prev,
        state,
        // Keep the presentation clock in sync with the engine clock so a
        // later resume continues from where stepping left off.
        playheadMs: Math.max(prev.playheadMs, state.clockMs),
        status:
          state.status === "COMPLETED"
            ? "final"
            : prev.status === "live"
              ? "live"
              : "paused",
        ...accumulateFeed(prev, state),
      };
    });
  }, []);

  const setSpeed = useCallback((speed: BattleClockSpeed) => {
    setCore((prev) => ({ ...prev, speed }));
  }, []);

  const finishNow = useCallback(() => {
    setCore((prev) => {
      if (prev.status === "final") return prev;
      const state = advanceBattleToEnd(prev.state);
      return {
        ...prev,
        state,
        playheadMs: prev.state.durationMs,
        status: "final",
        ...accumulateFeed(prev, state),
      };
    });
  }, []);

  const selectScenario = useCallback((scenarioId: ScenarioId) => {
    setCore((prev) =>
      prev.scenarioId === scenarioId && prev.status === "ready"
        ? prev
        : freshCore(scenarioId, prev.speed),
    );
  }, []);

  const controls = useMemo<BattleClockControls>(
    () => ({
      start,
      pause,
      resume,
      reset,
      advanceOneEvent,
      setSpeed,
      finishNow,
      selectScenario,
    }),
    [
      start,
      pause,
      resume,
      reset,
      advanceOneEvent,
      setSpeed,
      finishNow,
      selectScenario,
    ],
  );

  const progress = useMemo(() => getBattleProgress(core.state), [core.state]);

  const elapsedMs = Math.min(core.playheadMs, core.state.durationMs);

  return {
    scenarioId: core.scenarioId,
    status: core.status,
    speed: core.speed,
    state: core.state,
    progress,
    feed: core.feed,
    elapsedMs,
    remainingMs: Math.max(0, core.state.durationMs - elapsedMs),
    controls,
  };
}
