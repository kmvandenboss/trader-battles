"use client";

/**
 * LiveBattleScreen — the Phase 4 centerpiece. Composes the battle header,
 * head-to-head scorecards, price + score charts, commentary strip, event
 * feed, Demo Controls, and the pre-battle / battle-end states.
 *
 * All battle data flows one way: BattleClock (transport) → engine snapshot →
 * these presentational components. Nothing here computes scores, ratings,
 * or P&L — see useBattleClock.ts for the transport seam.
 */

import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BattleFinalResult } from "@/lib/battles/battleEngine";
import { getBattleScriptForState } from "@/lib/battles/getBattleScript";
import { BattleEndOverlay } from "./battle-end-overlay";
import { BattleHeader } from "./battle-header";
import { CommentaryStrip } from "./commentary-strip";
import { DemoControls } from "./demo-controls";
import { EventFeed } from "./event-feed";
import { PreBattlePanel } from "./pre-battle";
import { PriceChart } from "./price-chart";
import { ScoreTimelineChart } from "./score-timeline-chart";
import { TraderScorecard } from "./scorecard";
import { useBattleClock } from "./useBattleClock";

export function LiveBattleScreen() {
  const clock = useBattleClock();
  const { state, status, feed, elapsedMs, remainingMs, controls } = clock;

  // Cheap on every render: scripts are memoized per scenario inside the
  // registered BattleScriptSource.
  const script = getBattleScriptForState(state);

  const commentary = useMemo(
    () => feed.filter((event) => event.type === "COMMENTARY"),
    [feed],
  );
  const timelineEvents = useMemo(
    () => feed.filter((event) => event.type !== "COMMENTARY"),
    [feed],
  );

  // Track dismissal by finalResult identity: a reset/new run produces a new
  // finalResult object, so the overlay reappears without any effect wiring.
  const [dismissedResult, setDismissedResult] =
    useState<BattleFinalResult | null>(null);
  const resultDismissed =
    state.finalResult !== null && state.finalResult === dismissedResult;

  const demo = state.participants[state.demoUserId];
  const opponent = state.participants[state.opponentUserId];
  const fractionComplete =
    state.durationMs > 0 ? elapsedMs / state.durationMs : 0;

  return (
    <div className="space-y-4">
      <BattleHeader
        state={state}
        status={status}
        remainingMs={remainingMs}
        fractionComplete={fractionComplete}
      />

      {status === "ready" ? (
        <PreBattlePanel state={state} onStart={controls.start} />
      ) : (
        <>
          {status === "final" && resultDismissed && state.finalResult ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm">
              <Trophy className="size-4 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">
                {state.finalResult.headline}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDismissedResult(null)}
              >
                Show result
              </Button>
            </div>
          ) : null}

          {/* Head-to-head scorecards */}
          <div className="grid gap-4 lg:grid-cols-2">
            <TraderScorecard
              participant={demo}
              accent="demo"
              isLeader={state.leaderUserId === demo.userId}
            />
            <TraderScorecard
              participant={opponent}
              accent="opponent"
              isLeader={state.leaderUserId === opponent.userId}
            />
          </div>

          <CommentaryStrip commentary={commentary} />

          {/* Charts + feed */}
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              <PriceChart
                state={state}
                pricePath={script.pricePath}
                feed={feed}
                elapsedMs={elapsedMs}
              />
              <ScoreTimelineChart
                demo={demo}
                opponent={opponent}
                startTimestampMs={state.startTimestampMs}
                durationMs={state.durationMs}
              />
            </div>
            <EventFeed
              events={timelineEvents}
              className="max-h-[26rem] xl:max-h-none xl:min-h-0"
            />
          </div>
        </>
      )}

      {status === "final" && !resultDismissed && state.finalResult ? (
        <BattleEndOverlay
          finalResult={state.finalResult}
          demoUserId={state.demoUserId}
          onClose={() => setDismissedResult(state.finalResult)}
        />
      ) : null}

      <DemoControls
        scenarioId={clock.scenarioId}
        status={status}
        speed={clock.speed}
        controls={controls}
      />
    </div>
  );
}
