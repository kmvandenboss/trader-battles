"use client";

/**
 * Score-over-time comparison — both participants' engine-computed battle
 * scores (participant.history[]) as two lines on a 0–100 axis.
 */

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BattleParticipantState } from "@/lib/battles/battleEngine";
import { TRADER_COLORS } from "./trader-avatar";
import { sessionTimeAt } from "./format";

interface ScorePoint {
  elapsedMin: number;
  demo: number | null;
  opponent: number | null;
}

interface ScoreTimelineChartProps {
  demo: BattleParticipantState;
  opponent: BattleParticipantState;
  startTimestampMs: number;
  durationMs: number;
}

export function ScoreTimelineChart({
  demo,
  opponent,
  startTimestampMs,
  durationMs,
}: ScoreTimelineChartProps) {
  const data = useMemo<ScorePoint[]>(() => {
    const byMinute = new Map<number, ScorePoint>();
    const add = (
      history: BattleParticipantState["history"],
      key: "demo" | "opponent",
    ) => {
      for (const point of history) {
        const elapsedMin = Math.round(point.elapsedMs / 60_000);
        const existing = byMinute.get(elapsedMin) ?? {
          elapsedMin,
          demo: null,
          opponent: null,
        };
        existing[key] = point.score;
        byMinute.set(elapsedMin, existing);
      }
    };
    add(demo.history, "demo");
    add(opponent.history, "opponent");
    return [...byMinute.values()].sort((a, b) => a.elapsedMin - b.elapsedMin);
  }, [demo.history, opponent.history]);

  const durationMin = Math.round(durationMs / 60_000);

  const lastScore = (key: "demo" | "opponent"): number | null => {
    for (let i = data.length - 1; i >= 0; i -= 1) {
      const v = data[i][key];
      if (typeof v === "number") return v;
    }
    return null;
  };
  const demoScore = lastScore("demo");
  const opponentScore = lastScore("opponent");
  const ariaLabel =
    demoScore === null || opponentScore === null
      ? `Battle score over time for ${demo.displayName} and ${opponent.displayName}.`
      : `Battle score over time. ${demo.displayName} at ${demoScore.toFixed(1)}, ` +
        `${opponent.displayName} at ${opponentScore.toFixed(1)}, on a 0 to 100 scale.`;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Battle score over time</h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: TRADER_COLORS.demo }}
            />
            {demo.displayName}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: TRADER_COLORS.opponent }}
            />
            {opponent.displayName}
          </span>
        </div>
      </div>
      <div className="h-48" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 8, bottom: 0, left: -18 }}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="elapsedMin"
              type="number"
              domain={[0, durationMin]}
              tickFormatter={(min: number) =>
                sessionTimeAt(startTimestampMs, min * 60_000)
              }
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              ticks={[0, 15, 30, 45, 60, 75, 90].filter(
                (m) => m <= durationMin,
              )}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{
                backgroundColor: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(min) =>
                `${sessionTimeAt(startTimestampMs, Number(min) * 60_000)} ET`
              }
              formatter={(value, name) => [
                typeof value === "number" ? value.toFixed(1) : "—",
                name === "demo" ? demo.displayName : opponent.displayName,
              ]}
            />
            <Line
              dataKey="demo"
              stroke={TRADER_COLORS.demo}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              dataKey="opponent"
              stroke={TRADER_COLORS.opponent}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
