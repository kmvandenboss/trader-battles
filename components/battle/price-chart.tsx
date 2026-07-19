"use client";

/**
 * Intraday price chart — the scenario's NQ price tape (from the battle
 * script's pricePath, revealed up to the current battle clock) with each
 * trader's entry/exit markers overlaid from the engine's feed events.
 *
 * Markers are distinguished by trader color (amber = demo, blue = opponent)
 * and shape (triangle = entry/add, pointing in trade direction; diamond =
 * exit/trim). No trading math happens here — prices and fills come straight
 * from the engine's script + feed.
 */

import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  BattleEngineState,
  BattleFeedEvent,
} from "@/lib/battles/battleEngine";
import type { BattlePricePoint } from "@/lib/battles/battleScript";
import { TRADER_COLORS } from "./trader-avatar";
import { sessionTimeAt } from "./format";

// ---------------------------------------------------------------------------
// Marker shapes (recharts clones these with cx/cy/payload injected)
// ---------------------------------------------------------------------------

interface MarkerDatum {
  elapsedMin: number;
  price: number;
  /** +1 = long-side fill, -1 = short-side fill (from feed event data). */
  direction: 1 | -1;
}

interface MarkerShapeProps {
  cx?: number;
  cy?: number;
  fill?: string;
  payload?: MarkerDatum;
}

function EntryMarker({ cx = 0, cy = 0, fill, payload }: MarkerShapeProps) {
  const up = (payload?.direction ?? 1) > 0;
  const points = up
    ? `${cx},${cy - 5} ${cx - 4.5},${cy + 4} ${cx + 4.5},${cy + 4}`
    : `${cx},${cy + 5} ${cx - 4.5},${cy - 4} ${cx + 4.5},${cy - 4}`;
  return (
    <polygon
      points={points}
      fill={fill}
      stroke="var(--background)"
      strokeWidth={1}
    />
  );
}

function ExitMarker({ cx = 0, cy = 0, fill }: MarkerShapeProps) {
  const points = `${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`;
  return (
    <polygon
      points={points}
      fill="var(--background)"
      stroke={fill}
      strokeWidth={1.5}
    />
  );
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

const ENTRY_TYPES = new Set(["ENTRY", "SCALE_IN"]);
const EXIT_TYPES = new Set(["EXIT", "SCALE_OUT"]);

function markersFor(
  feed: BattleFeedEvent[],
  userId: string,
  types: Set<string>,
): MarkerDatum[] {
  const markers: MarkerDatum[] = [];
  for (const event of feed) {
    if (event.userId !== userId || !types.has(event.type)) continue;
    const price = event.data.price;
    if (typeof price !== "number" || price <= 0) continue;
    const position = event.data.position;
    const direction: 1 | -1 =
      typeof position === "number" && position < 0 ? -1 : 1;
    markers.push({
      elapsedMin: event.elapsedMs / 60_000,
      price,
      direction,
    });
  }
  return markers;
}

interface PriceChartProps {
  state: BattleEngineState;
  pricePath: BattlePricePoint[];
  feed: BattleFeedEvent[];
  /** Presentation clock — how much of the tape is revealed. */
  elapsedMs: number;
}

export function PriceChart({
  state,
  pricePath,
  feed,
  elapsedMs,
}: PriceChartProps) {
  const durationMin = Math.round(state.durationMs / 60_000);

  const revealed = useMemo(() => {
    const cutoff = state.startTimestampMs + elapsedMs;
    return pricePath
      .filter((point) => point.timestampMs <= cutoff)
      .map((point) => ({ elapsedMin: point.minute, price: point.price }));
  }, [pricePath, state.startTimestampMs, elapsedMs]);

  // Fixed Y domain from the full tape so the chart never rescales mid-battle.
  const [yMin, yMax] = useMemo(() => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const point of pricePath) {
      if (point.price < min) min = point.price;
      if (point.price > max) max = point.price;
    }
    const pad = Math.max(5, (max - min) * 0.08);
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [pricePath]);

  const demo = state.participants[state.demoUserId];
  const opponent = state.participants[state.opponentUserId];
  const demoEntries = useMemo(
    () => markersFor(feed, state.demoUserId, ENTRY_TYPES),
    [feed, state.demoUserId],
  );
  const demoExits = useMemo(
    () => markersFor(feed, state.demoUserId, EXIT_TYPES),
    [feed, state.demoUserId],
  );
  const opponentEntries = useMemo(
    () => markersFor(feed, state.opponentUserId, ENTRY_TYPES),
    [feed, state.opponentUserId],
  );
  const opponentExits = useMemo(
    () => markersFor(feed, state.opponentUserId, EXIT_TYPES),
    [feed, state.opponentUserId],
  );

  const priceAria =
    revealed.length === 0
      ? `${state.market} simulated intraday price tape (not yet revealed).`
      : `${state.market} simulated intraday price tape, currently ` +
        `${revealed[revealed.length - 1].price.toLocaleString("en-US")}, with ` +
        `${demo.displayName} and ${opponent.displayName} entry and exit markers.`;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {state.market} intraday{" "}
          <span className="font-normal text-muted-foreground">
            (simulated tape)
          </span>
        </h3>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
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
          <span>▲▼ entry / add · ◇ exit / trim</span>
        </div>
      </div>
      <div className="h-64" role="img" aria-label={priceAria}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={revealed}
            margin={{ top: 6, right: 8, bottom: 0, left: -8 }}
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="elapsedMin"
              type="number"
              domain={[0, durationMin]}
              tickFormatter={(min: number) =>
                sessionTimeAt(state.startTimestampMs, min * 60_000)
              }
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              ticks={[0, 15, 30, 45, 60, 75, 90].filter(
                (m) => m <= durationMin,
              )}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(value: number) =>
                value.toLocaleString("en-US")
              }
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
                `${sessionTimeAt(state.startTimestampMs, Number(min) * 60_000)} ET`
              }
              formatter={(value) => [
                typeof value === "number"
                  ? value.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : String(value),
                state.market,
              ]}
            />
            <Line
              dataKey="price"
              stroke="var(--chart-5)"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Scatter
              data={demoEntries}
              dataKey="price"
              fill={TRADER_COLORS.demo}
              shape={<EntryMarker fill={TRADER_COLORS.demo} />}
              isAnimationActive={false}
            />
            <Scatter
              data={demoExits}
              dataKey="price"
              fill={TRADER_COLORS.demo}
              shape={<ExitMarker fill={TRADER_COLORS.demo} />}
              isAnimationActive={false}
            />
            <Scatter
              data={opponentEntries}
              dataKey="price"
              fill={TRADER_COLORS.opponent}
              shape={<EntryMarker fill={TRADER_COLORS.opponent} />}
              isAnimationActive={false}
            />
            <Scatter
              data={opponentExits}
              dataKey="price"
              fill={TRADER_COLORS.opponent}
              shape={<ExitMarker fill={TRADER_COLORS.opponent} />}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
