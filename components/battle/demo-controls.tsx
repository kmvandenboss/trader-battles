"use client";

/**
 * Demo Controls — the presenter panel that drives the simulated battle.
 *
 * Collapsed to a small floating pill so the primary interface reads as a
 * real product; expands into scenario picker + playback controls. Every
 * action delegates to the BattleClock (which delegates to the engine) —
 * nothing here touches scoring.
 */

import { useState } from "react";
import {
  ChevronDown,
  FastForward,
  FlaskConical,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SCENARIOS,
  getScenarioListing,
  isScenarioId,
  type ScenarioId,
} from "@/lib/battles/scenarios";
import {
  BATTLE_CLOCK_SPEEDS,
  type BattleClockControls,
  type BattleClockSpeed,
  type BattleClockStatus,
} from "./useBattleClock";

interface DemoControlsProps {
  scenarioId: ScenarioId;
  status: BattleClockStatus;
  speed: BattleClockSpeed;
  controls: BattleClockControls;
}

export function DemoControls({
  scenarioId,
  status,
  speed,
  controls,
}: DemoControlsProps) {
  const [open, setOpen] = useState(false);
  const scenario = getScenarioListing(scenarioId);

  if (!open) {
    return (
      <div className="fixed right-4 bottom-4 z-30">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="shadow-lg shadow-black/30"
        >
          <FlaskConical data-icon="inline-start" aria-hidden />
          Demo Controls
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed right-4 bottom-4 z-30 w-[19.5rem] rounded-xl border border-border bg-popover p-3 shadow-xl shadow-black/40">
      <div className="flex items-center gap-2">
        <FlaskConical className="size-3.5 text-primary" aria-hidden />
        <p className="text-xs font-semibold tracking-wide uppercase">
          Demo Controls
        </p>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          onClick={() => setOpen(false)}
          aria-label="Collapse demo controls"
        >
          <X aria-hidden />
        </Button>
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Presenter tools — drives the deterministic simulated playback. Not
        part of the product UI.
      </p>

      {/* Scenario picker */}
      <label className="mt-3 block">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Scenario
        </span>
        <div className="relative mt-1">
          <select
            value={scenarioId}
            onChange={(e) => {
              if (isScenarioId(e.target.value)) {
                controls.selectScenario(e.target.value);
              }
            }}
            className="w-full appearance-none rounded-md border border-input bg-secondary px-2.5 py-1.5 pr-8 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </label>
      <p className="mt-1.5 line-clamp-3 text-[11px] leading-snug text-muted-foreground">
        {scenario.description}
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
        Seed {scenario.seed} · deterministic replay · status{" "}
        {status.toUpperCase()}
      </p>

      {/* Playback */}
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {status === "ready" ? (
          <Button size="sm" onClick={controls.start}>
            <Play data-icon="inline-start" aria-hidden />
            Start battle
          </Button>
        ) : status === "live" ? (
          <Button size="sm" variant="secondary" onClick={controls.pause}>
            <Pause data-icon="inline-start" aria-hidden />
            Pause
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={controls.resume}
            disabled={status === "final"}
          >
            <Play data-icon="inline-start" aria-hidden />
            Resume
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={controls.advanceOneEvent}
          disabled={status === "final"}
        >
          <StepForward data-icon="inline-start" aria-hidden />
          Advance event
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={controls.finishNow}
          disabled={status === "final"}
        >
          <FastForward data-icon="inline-start" aria-hidden />
          Finish now
        </Button>
        <Button size="sm" variant="outline" onClick={controls.reset}>
          <RotateCcw data-icon="inline-start" aria-hidden />
          Reset
        </Button>
      </div>

      {/* Speed */}
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Speed
        </span>
        <div className="ml-auto flex overflow-hidden rounded-md border border-border">
          {BATTLE_CLOCK_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => controls.setSpeed(s)}
              aria-pressed={speed === s}
              className={cn(
                "px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
                speed === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
