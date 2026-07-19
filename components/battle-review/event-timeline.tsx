/**
 * EventTimeline — a chronological, factual narrative of the battle: opening,
 * each entry/exit, score-lead checkpoints, and the final bell.
 *
 * Pure presentation: every row is derived server-side from already-computed
 * execution events + metric snapshots (see components/battle/showcase.ts). No
 * invented drama, no scoring math.
 */

import { Flag, LogIn, LogOut, TrendingUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineKind, TimelineRow } from "@/components/battle/showcase";
import { TRADER_COLORS } from "@/components/battle/trader-avatar";
import { sessionTimeFromIso } from "@/components/battle/format";

const KIND_ICON: Record<TimelineKind, typeof Flag> = {
  start: Flag,
  entry: LogIn,
  exit: LogOut,
  checkpoint: TrendingUp,
  final: Trophy,
};

interface EventTimelineProps {
  rows: TimelineRow[];
}

export function EventTimeline({ rows }: EventTimelineProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">Event timeline</h3>
      <ol className="relative space-y-3 border-l border-border/60 pl-5">
        {rows.map((row) => {
          const Icon = KIND_ICON[row.kind];
          const color =
            row.accent === "demo"
              ? TRADER_COLORS.demo
              : row.accent === "opponent"
                ? TRADER_COLORS.opponent
                : "var(--muted-foreground)";
          const highlight = row.kind === "final";
          return (
            <li key={row.id} className="relative">
              <span
                aria-hidden
                className="absolute top-0.5 -left-[27px] flex size-4 items-center justify-center rounded-full border border-border bg-background"
                style={{ color }}
              >
                <Icon className="size-2.5" />
              </span>
              <div className="flex items-baseline justify-between gap-3">
                <p
                  className={cn(
                    "text-xs",
                    highlight ? "font-medium text-foreground" : "text-foreground/90",
                  )}
                >
                  {row.text}
                </p>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {sessionTimeFromIso(row.iso)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
