"use client";

/**
 * BattleReplay — a sped-up, scrubbable replay of a SETTLED PNL_V1 battle.
 *
 * Pure presentation (Rule 4): it computes NO scores. It only reveals
 * precomputed telemetry (the PNL_V1 running score series, mark-to-market P&L
 * series, trades and event timeline — all built server-side in report.ts)
 * over a moving playhead. The "current" value at the playhead is simply the
 * latest series point at/before the playhead (step lookup); nothing is
 * recalculated. The final winner is read from meta.winnerName.
 *
 * Feel is modelled on the live-battle screen (a ~200ms tick loop, 1x/2x/4x
 * speed, an advancing feed) but is entirely data-driven from the persisted
 * telemetry, not the mock battle engine.
 */

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "@/components/battle/animated-number";
import { StatPill } from "@/components/battle/stat-pill";
import { TraderAvatar, TRADER_COLORS } from "@/components/battle/trader-avatar";
import {
  formatSignedUsdExact,
  sessionTimeAt,
} from "@/components/battle/format";
import { EventTimeline } from "@/components/battle-review/event-timeline";
import type { PairPoint, TimelineRow } from "@/components/battle/showcase";
import type { V1ParticipantReport } from "./report";

/** Real seconds to replay the FULL window at 1x. 2x/4x are proportionally faster. */
const REPLAY_SECONDS_AT_1X = 60;
/** Real-time tick cadence, matching the live-battle clock. */
const TICK_INTERVAL_MS = 200;

type ReplaySpeed = 1 | 2 | 4;
const SPEEDS: readonly ReplaySpeed[] = [1, 2, 4];
type ReplayStatus = "ready" | "playing" | "paused" | "final";

export interface BattleReplayProps {
  startTimestampMs: number;
  durationMin: number;
  winnerName: string | null;
  self: V1ParticipantReport;
  opponent: V1ParticipantReport;
  scoreSeries: PairPoint[];
  pnlSeries: PairPoint[];
  timeline: TimelineRow[];
}

/** Latest series value at/before the playhead (step lookup — no interpolation). */
function valueAt(
  series: PairPoint[],
  key: "demo" | "opponent",
  playheadMin: number,
): number | null {
  let latest: number | null = null;
  for (const point of series) {
    if (point.elapsedMin > playheadMin) break;
    const v = point[key];
    if (typeof v === "number") latest = v;
  }
  return latest;
}

function elapsedMinOf(iso: string, startMs: number): number {
  return (Date.parse(iso) - startMs) / 60_000;
}

interface ScoreboardProps {
  participant: V1ParticipantReport;
  score: number;
  pnl: number;
  isLeader: boolean;
  isFinal: boolean;
}

function Scoreboard({
  participant,
  score,
  pnl,
  isLeader,
  isFinal,
}: ScoreboardProps) {
  const color =
    participant.accent === "demo" ? TRADER_COLORS.demo : TRADER_COLORS.opponent;
  const won = isFinal && participant.result === "WIN";
  return (
    <div
      className={cn(
        "flex-1 rounded-xl border p-4 transition-colors",
        won
          ? "border-primary/50 bg-primary/5"
          : isLeader
            ? "border-border bg-secondary/30"
            : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-2.5">
        <TraderAvatar
          displayName={participant.displayName}
          accent={participant.accent}
          size="sm"
        />
        <p className="text-sm font-semibold">{participant.displayName}</p>
        {won ? (
          <Trophy className="size-3.5 text-primary" aria-hidden />
        ) : isLeader ? (
          <span
            className="ml-auto rounded-sm border border-border/60 px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
          >
            Leading
          </span>
        ) : null}
      </div>
      <p
        className="mt-3 text-3xl font-semibold tracking-tight tabular-nums"
        style={{ color }}
      >
        <AnimatedNumber value={score} decimals={0} />
        <span className="ml-1 text-sm font-normal text-muted-foreground">
          pts
        </span>
      </p>
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
        {isFinal ? "Final PNL_V1 score" : "Running PNL_V1 score"}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StatPill
          label="Mark-to-market P&L"
          value={formatSignedUsdExact(pnl)}
          tone={pnl > 0 ? "positive" : pnl < 0 ? "negative" : "neutral"}
        />
        <StatPill
          label="Result"
          value={isFinal ? participant.result : isLeader ? "AHEAD" : "BEHIND"}
        />
      </div>
    </div>
  );
}

export function BattleReplay({
  startTimestampMs,
  durationMin,
  winnerName,
  self,
  opponent,
  scoreSeries,
  pnlSeries,
  timeline,
}: BattleReplayProps) {
  const [playheadMin, setPlayheadMin] = useState(0);
  const [status, setStatus] = useState<ReplayStatus>("ready");
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const lastTickRef = useRef<number>(0);

  const battleMinPerMs = durationMin / (REPLAY_SECONDS_AT_1X * 1000);

  useEffect(() => {
    if (status !== "playing") return;
    lastTickRef.current = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const deltaMs = now - lastTickRef.current;
      lastTickRef.current = now;
      setPlayheadMin((prev) => {
        const next = prev + deltaMs * battleMinPerMs * speed;
        if (next >= durationMin) {
          setStatus("final");
          return durationMin;
        }
        return next;
      });
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [status, speed, battleMinPerMs, durationMin]);

  const play = () => {
    if (status === "final" || playheadMin >= durationMin) {
      setPlayheadMin(0);
    }
    setStatus("playing");
  };
  const pause = () => setStatus("paused");
  const restart = () => {
    setPlayheadMin(0);
    setStatus("playing");
  };
  const seek = (min: number) => {
    setPlayheadMin(min);
    if (min >= durationMin) setStatus("final");
    else if (status === "final") setStatus("paused");
  };

  const isFinal = status === "final";
  const clampedMin = Math.min(playheadMin, durationMin);

  const selfScore = valueAt(scoreSeries, "demo", clampedMin) ?? 0;
  const oppScore = valueAt(scoreSeries, "opponent", clampedMin) ?? 0;
  const selfPnl = valueAt(pnlSeries, "demo", clampedMin) ?? 0;
  const oppPnl = valueAt(pnlSeries, "opponent", clampedMin) ?? 0;
  const selfLeads = selfScore >= oppScore;

  const revealed = timeline.filter(
    (row) => elapsedMinOf(row.iso, startTimestampMs) <= clampedMin + 0.001,
  );

  const isPlaying = status === "playing";

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Replay</h3>
          <p className="text-[11px] text-muted-foreground">
            Sped-up playback of the settled telemetry · minute {Math.round(clampedMin)} of {durationMin}
          </p>
        </div>
        <p className="text-xs font-medium tabular-nums text-muted-foreground">
          {sessionTimeAt(startTimestampMs, clampedMin * 60_000)} ET
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Scoreboard
          participant={self}
          score={selfScore}
          pnl={selfPnl}
          isLeader={selfLeads}
          isFinal={isFinal}
        />
        <Scoreboard
          participant={opponent}
          score={oppScore}
          pnl={oppPnl}
          isLeader={!selfLeads}
          isFinal={isFinal}
        />
      </div>

      {isFinal ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-primary/40 bg-primary/5 py-2 text-sm font-medium">
          <Trophy className="size-4 text-primary" aria-hidden />
          {winnerName ? `${winnerName} wins the battle` : "Battle drawn"}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={isPlaying ? pause : play}
          aria-label={isPlaying ? "Pause replay" : "Play replay"}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium hover:bg-secondary"
        >
          {isPlaying ? (
            <Pause className="size-3.5" aria-hidden />
          ) : (
            <Play className="size-3.5" aria-hidden />
          )}
          {isPlaying ? "Pause" : isFinal ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          onClick={restart}
          aria-label="Restart replay from the beginning"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-xs font-medium hover:bg-secondary"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Restart
        </button>
        <div
          className="inline-flex overflow-hidden rounded-md border border-border"
          role="group"
          aria-label="Replay speed"
        >
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-label={`Play at ${s}x speed`}
              aria-pressed={speed === s}
              className={cn(
                "px-2.5 py-1.5 text-xs font-medium tabular-nums",
                speed === s
                  ? "bg-primary/15 text-primary"
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary",
              )}
            >
              {s}x
            </button>
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={durationMin}
          step={1}
          value={Math.round(clampedMin)}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Seek replay position (battle minutes)"
          aria-valuetext={`Minute ${Math.round(clampedMin)} of ${durationMin}`}
          className="ml-auto h-1.5 w-full min-w-40 flex-1 cursor-pointer accent-[var(--chart-1)] sm:w-auto"
        />
      </div>

      <div className="max-h-72 overflow-y-auto">
        {revealed.length > 0 ? (
          <EventTimeline rows={revealed} />
        ) : (
          <p className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
            Press play to reveal the battle event by event.
          </p>
        )}
      </div>
    </div>
  );
}
