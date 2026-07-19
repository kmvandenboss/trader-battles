"use client";

/**
 * RatingSparkline — a compact season rating trend for the dashboard hero.
 *
 * Pure presentation: it plots already-computed ratings from the seed rating
 * history (RatingHistoryEntry.newRating), handed down as a numeric array. No
 * rating math happens in the UI.
 */

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";

export interface SparklinePoint {
  index: number;
  rating: number;
}

interface RatingSparklineProps {
  data: SparklinePoint[];
  /** Optional text alternative summarizing the trend for assistive tech. */
  ariaLabel?: string;
}

export function RatingSparkline({ data, ariaLabel }: RatingSparklineProps) {
  return (
    <div
      className="h-16 w-full"
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={["dataMin - 20", "dataMax + 20"]} hide />
          <Tooltip
            cursor={{ stroke: "var(--border)" }}
            contentStyle={{
              backgroundColor: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={() => ""}
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
            fill="url(#ratingFill)"
            isAnimationActive={false}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
