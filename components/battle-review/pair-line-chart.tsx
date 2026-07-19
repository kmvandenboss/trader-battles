"use client";

/**
 * PairLineChart — a reusable two-series line chart (demo vs opponent) for the
 * battle review screen: P&L over time, drawdown over time, and score
 * progression all render through this one component.
 *
 * Pure presentation: it receives already-computed numeric arrays (PairPoint[])
 * built server-side in components/battle/showcase.ts. No trading/scoring math.
 * Recharts only, themed to match the live-battle charts.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PairPoint } from "@/components/battle/showcase";
import { TRADER_COLORS } from "@/components/battle/trader-avatar";
import {
  formatScore,
  formatSignedUsd,
  formatUsd,
  sessionTimeAt,
} from "@/components/battle/format";

type ValueKind = "pnl" | "drawdown" | "score";

function formatValue(value: number, kind: ValueKind): string {
  if (kind === "score") return formatScore(value);
  if (kind === "drawdown") return formatUsd(value);
  return formatSignedUsd(value);
}

interface PairLineChartProps {
  title: string;
  subtitle?: string;
  data: PairPoint[];
  demoName: string;
  opponentName: string;
  startTimestampMs: number;
  durationMin: number;
  valueKind: ValueKind;
}

export function PairLineChart({
  title,
  subtitle,
  data,
  demoName,
  opponentName,
  startTimestampMs,
  durationMin,
  valueKind,
}: PairLineChartProps) {
  const ticks: number[] = [];
  for (let m = 0; m <= durationMin; m += 30) ticks.push(m);

  const yDomain =
    valueKind === "score" ? ([0, 100] as const) : (["auto", "auto"] as const);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle ? (
            <p className="text-[11px] text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: TRADER_COLORS.demo }}
            />
            {demoName}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: TRADER_COLORS.opponent }}
            />
            {opponentName}
          </span>
        </div>
      </div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -6 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            {valueKind !== "score" ? (
              <ReferenceLine y={0} stroke="var(--border)" strokeDasharray="3 3" />
            ) : null}
            <XAxis
              dataKey="elapsedMin"
              type="number"
              domain={[0, durationMin]}
              ticks={ticks}
              tickFormatter={(min: number) =>
                sessionTimeAt(startTimestampMs, min * 60_000)
              }
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              domain={yDomain as [number, number] | ["auto", "auto"]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(value: number) => formatValue(value, valueKind)}
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
                typeof value === "number" ? formatValue(value, valueKind) : "—",
                name === "demo" ? demoName : opponentName,
              ]}
            />
            <Line
              dataKey="demo"
              stroke={TRADER_COLORS.demo}
              strokeWidth={2}
              dot={{ r: 2, fill: TRADER_COLORS.demo, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls
            />
            <Line
              dataKey="opponent"
              stroke={TRADER_COLORS.opponent}
              strokeWidth={2}
              dot={{ r: 2, fill: TRADER_COLORS.opponent, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
