/**
 * ComponentBreakdown — the four scoring components (Performance, Risk
 * efficiency, Discipline, Consistency) as mirrored two-sided bars, demo vs
 * opponent. Mirrors the battle-end overlay's component layout.
 *
 * Pure presentation: rows come from `ReviewNarrative.componentEdges`, which the
 * pure lib/battles/reviewNarrative helper derived from already-computed scores.
 */

import { cn } from "@/lib/utils";
import type { ComponentEdge } from "@/lib/battles/reviewNarrative";

interface ComponentBreakdownProps {
  edges: ComponentEdge[];
  demoName: string;
  opponentName: string;
  /** Descriptive weight note, e.g. the 40/25/20/15 model labels. */
  weightsNote?: string;
}

export function ComponentBreakdown({
  edges,
  demoName,
  opponentName,
  weightsNote,
}: ComponentBreakdownProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Score component breakdown</h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: "var(--chart-1)" }}
            />
            {demoName}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: "var(--chart-2)" }}
            />
            {opponentName}
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {edges.map((edge) => (
          <div
            key={edge.key}
            className="grid grid-cols-[3.5rem_1fr_7rem_1fr_3.5rem] items-center gap-2 text-xs"
          >
            <span
              className={cn(
                "text-right font-medium tabular-nums",
                edge.favored === "self"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {edge.self.toFixed(1)}
            </span>
            <div className="flex h-2 justify-end overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, edge.self)}%`,
                  backgroundColor: "var(--chart-1)",
                }}
              />
            </div>
            <span className="text-center text-[11px] text-muted-foreground">
              {edge.label}
            </span>
            <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, edge.other)}%`,
                  backgroundColor: "var(--chart-2)",
                }}
              />
            </div>
            <span
              className={cn(
                "font-medium tabular-nums",
                edge.favored === "other"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {edge.other.toFixed(1)}
            </span>
          </div>
        ))}
      </div>
      {weightsNote ? (
        <p className="mt-3 border-t border-border/60 pt-2.5 text-[11px] text-muted-foreground">
          {weightsNote}
        </p>
      ) : null}
    </div>
  );
}
