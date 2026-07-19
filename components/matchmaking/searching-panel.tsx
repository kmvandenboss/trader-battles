"use client";

/**
 * SearchingPanel — plays back a precomputed MatchmakingPlan.
 *
 * The interval below only advances a local playhead; every status message,
 * rating-window expansion, and the match moment come from `plan.ticks` /
 * `plan.matchedAtMs`, which the matchmaking engine computed up front. No
 * opponent selection or window math happens client-side.
 */

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FastForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEMO_RATING_STAGES,
  type MatchmakingPlan,
} from "@/lib/battles/matchmaking";
import {
  BATTLE_TYPE_LABELS,
  BATTLE_WINDOW_LABELS,
  MARKET_LABELS,
  formatCountdown,
} from "@/components/battle/format";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import type { MatchmakingTraderCard } from "./types";

/** Real interval driving the playhead (bookkeeping only, not plan timing). */
const PLAYBACK_INTERVAL_MS = 100;
/** How long the "Opponent found" tick holds before the reveal transition. */
const MATCH_HOLD_MS = 1200;

interface SearchingPanelProps {
  plan: MatchmakingPlan;
  demo: MatchmakingTraderCard;
  onCancel: () => void;
  onMatched: () => void;
}

export function SearchingPanel({
  plan,
  demo,
  onCancel,
  onMatched,
}: SearchingPanelProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  // Playhead: accumulate real elapsed time; the plan supplies all content.
  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      setElapsedMs((prev) => prev + delta);
    }, PLAYBACK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  // Hand off to the reveal shortly after the plan's match moment.
  const revealDue = elapsedMs >= plan.matchedAtMs + MATCH_HOLD_MS;
  useEffect(() => {
    if (revealDue) onMatched();
  }, [revealDue, onMatched]);

  // Freeze the visible clock at the match moment ("matched in 0:06").
  const clampedMs = Math.min(elapsedMs, plan.matchedAtMs);
  const matched = elapsedMs >= plan.matchedAtMs;

  const currentTick = useMemo(() => {
    let tick = plan.ticks[0];
    for (const candidate of plan.ticks) {
      if (candidate.atMs <= clampedMs) tick = candidate;
    }
    return tick;
  }, [plan.ticks, clampedMs]);

  const stageWindows = useMemo(
    () =>
      Array.from(new Set(DEMO_RATING_STAGES.map((stage) => stage.windowPoints))),
    [],
  );

  return (
    <section className="rounded-xl border border-border bg-card px-5 py-10 sm:px-8">
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        {/* Searching visual */}
        <div className="relative flex size-28 items-center justify-center">
          {!matched ? (
            <>
              <span className="absolute inset-0 animate-ping rounded-full border border-primary/30 [animation-duration:1.8s]" />
              <span className="absolute inset-4 animate-ping rounded-full border border-primary/20 [animation-duration:1.8s] [animation-delay:0.45s]" />
            </>
          ) : (
            <span className="absolute inset-2 rounded-full border border-positive/50" />
          )}
          <TraderAvatar displayName={demo.displayName} accent="demo" size="lg" />
        </div>

        <h1 className="mt-5 text-lg font-semibold">
          {matched ? "Opponent found" : "Searching for an opponent"}
        </h1>
        <p
          className="mt-1 flex min-h-5 items-center gap-1.5 text-sm text-muted-foreground"
          aria-live="polite"
        >
          {matched ? (
            <CheckCircle2 className="size-4 text-positive" aria-hidden />
          ) : null}
          {currentTick.message}
        </p>

        {/* Rating window stages (from the engine's demo stages) */}
        <div className="mt-5 flex items-center gap-1.5">
          {stageWindows.map((windowPoints) => {
            const active = currentTick.windowPoints === windowPoints;
            const passed = currentTick.windowPoints > windowPoints;
            return (
              <span
                key={windowPoints}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
                  active
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : passed
                      ? "border-border text-muted-foreground/60"
                      : "border-border text-muted-foreground",
                )}
              >
                ±{windowPoints}
              </span>
            );
          })}
          <span className="ml-2 text-[11px] text-muted-foreground">
            rating window
          </span>
        </div>

        {/* Queue context */}
        <p className="mt-4 text-xs text-muted-foreground">
          {MARKET_LABELS[plan.request.market]} ·{" "}
          {BATTLE_WINDOW_LABELS[plan.request.battleWindow]} ·{" "}
          {BATTLE_TYPE_LABELS[plan.request.battleType]}
        </p>
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          {matched ? "Matched in" : "Time in queue"}{" "}
          {formatCountdown(clampedMs)}
        </p>

        <div className="mt-6 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={matched}>
            <X data-icon="inline-start" aria-hidden />
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setElapsedMs((prev) => Math.max(prev, plan.matchedAtMs))
            }
            disabled={matched}
            title="Presenter shortcut — jumps the deterministic queue playback to its match moment."
          >
            <FastForward data-icon="inline-start" aria-hidden />
            Reveal now
          </Button>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          Deterministic demo queue — the same search resolves identically every
          time.
        </p>
      </div>
    </section>
  );
}
