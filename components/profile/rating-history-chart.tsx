"use client";

/**
 * RatingHistoryChart — a full-size season rating trend for profile pages.
 *
 * A taller sibling of the dashboard's RatingSparkline: same data contract
 * (already-computed { index, rating } points from the seed rating history) but
 * with visible axes, a grid, and a text alternative. Pure presentation — no
 * rating math happens in the UI.
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface RatingPoint {
  index: number;
  rating: number;
}

interface RatingHistoryChartProps {
  data: RatingPoint[];
  /** Text alternative summarizing the trend for assistive tech. */
  ariaLabel: string;
}

export function RatingHistoryChart({ data, ariaLabel }: RatingHistoryChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        No rated battles yet this season.
      </div>
    );
  }

  return (
    <div className="h-56 w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <defs>
            <linearGradient id="ratingHistoryFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="index"
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            tickFormatter={(i: number) => `#${i + 1}`}
          />
          <YAxis
            domain={["dataMin - 20", "dataMax + 20"]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => v.toLocaleString("en-US")}
          />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(i) => `Battle ${Number(i) + 1}`}
            formatter={(value) => [
              typeof value === "number" ? value.toLocaleString("en-US") : "—",
              "Rating",
            ]}
          />
          <Area
            dataKey="rating"
            type="monotone"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="url(#ratingHistoryFill)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
