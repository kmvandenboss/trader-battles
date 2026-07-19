"use client";

/**
 * Battle header — type, market, session window, countdown, status badge,
 * battle ID, rating movement, and the demo-data verification indicator.
 *
 * Rating movement is a competitive result, never financial. Before the final,
 * the engine exposes a *projected* movement (state.projection) computed by the
 * same rating engine as if the battle ended now; we render it, clearly marked
 * "projected", once scores separate, and fall back to a neutral label while
 * tied. Once finalResult exists we render the engine-computed final changes.
 * All rating numbers come from the engine — the UI never computes them.
 */

import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BattleEngineState } from "@/lib/battles/battleEngine";
import type { BattleClockStatus } from "./useBattleClock";
import {
  BATTLE_TYPE_LABELS,
  BATTLE_WINDOW_LABELS,
  MARKET_LABELS,
  formatCountdown,
  formatRatingDelta,
} from "./format";

function ratingTone(change: number): string {
  if (change > 0) return "text-positive";
  if (change < 0) return "text-negative";
  return "text-foreground";
}

const STATUS_META: Record<
  BattleClockStatus,
  { label: string; className: string; dotClassName: string }
> = {
  ready: {
    label: "READY",
    className: "border-border bg-secondary text-secondary-foreground",
    dotClassName: "bg-muted-foreground",
  },
  live: {
    label: "LIVE",
    className: "border-positive/40 bg-positive/10 text-positive",
    dotClassName: "bg-positive animate-pulse",
  },
  paused: {
    label: "PAUSED",
    className: "border-primary/40 bg-primary/10 text-primary",
    dotClassName: "bg-primary",
  },
  final: {
    label: "FINAL",
    className: "border-border bg-foreground/10 text-foreground",
    dotClassName: "bg-foreground",
  },
};

interface BattleHeaderProps {
  state: BattleEngineState;
  status: BattleClockStatus;
  remainingMs: number;
  /** 0–1 fraction of the battle revealed (presentation clock). */
  fractionComplete: number;
}

export function BattleHeader({
  state,
  status,
  remainingMs,
  fractionComplete,
}: BattleHeaderProps) {
  const statusMeta = STATUS_META[status];
  const demo = state.participants[state.demoUserId];
  const opponent = state.participants[state.opponentUserId];
  const finalParticipants = state.finalResult?.participants ?? null;
  // Show the engine's projected movement once scores have separated.
  const projection =
    !finalParticipants && state.projection && !state.projection.tied
      ? state.projection
      : null;

  return (
    <section className="rounded-xl border border-border bg-card px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* Status + identity */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold tracking-wide",
              statusMeta.className,
            )}
          >
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", statusMeta.dotClassName)}
            />
            {statusMeta.label}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
              {BATTLE_TYPE_LABELS[state.battleType]}
              <span className="text-muted-foreground"> · </span>
              <span className="text-primary">{state.market}</span>
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {MARKET_LABELS[state.market]} ·{" "}
              {BATTLE_WINDOW_LABELS[state.battleWindow]}
            </p>
          </div>
        </div>

        {/* Rating movement */}
        <div className="text-xs leading-tight">
          {finalParticipants ? (
            <div className="flex items-center gap-3">
              {finalParticipants.map((p) => (
                <span key={p.userId} className="tabular-nums">
                  <span className="text-muted-foreground">
                    {p.displayName}{" "}
                  </span>
                  <span
                    className={cn("font-semibold", ratingTone(p.ratingChange.change))}
                  >
                    {formatRatingDelta(p.ratingChange.change)} rating
                  </span>
                </span>
              ))}
            </div>
          ) : projection ? (
            <div className="text-right sm:text-left">
              <div className="flex items-center gap-3">
                {[projection.demo, projection.opponent].map((side) => (
                  <span key={side.userId} className="tabular-nums">
                    <span className="text-muted-foreground">
                      {side.displayName}{" "}
                    </span>
                    <span
                      className={cn("font-semibold", ratingTone(side.change))}
                    >
                      {formatRatingDelta(side.change)}
                    </span>
                  </span>
                ))}
              </div>
              <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
                Projected rating · applied at final
              </p>
            </div>
          ) : (
            <div className="text-right sm:text-left">
              <p className="font-medium text-foreground">Rating on the line</p>
              <p className="text-muted-foreground tabular-nums">
                {demo.rating.toLocaleString("en-US")} vs{" "}
                {opponent.rating.toLocaleString("en-US")} · applied at final
              </p>
            </div>
          )}
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p
              className="text-2xl font-semibold tabular-nums tracking-tight"
              aria-label="Time remaining"
            >
              {formatCountdown(remainingMs)}
            </p>
            <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Time remaining
            </p>
          </div>
        </div>
      </div>

      {/* Progress + meta row */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div
          className="h-1 min-w-40 flex-1 overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(fractionComplete * 100)}
          aria-label="Battle progress"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${Math.min(100, fractionComplete * 100)}%` }}
          />
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {state.battleId}
        </span>
        <Badge
          variant="outline"
          className="gap-1 border-primary/30 text-primary"
        >
          <ShieldCheck aria-hidden />
          Demo Verified — Simulated Data
        </Badge>
      </div>
    </section>
  );
}
