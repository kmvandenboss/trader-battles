/**
 * TradeTable — the trade-by-trade execution list for the battle review screen.
 *
 * Pure presentation: rows are the seeded FILL executions (already normalized in
 * the pipeline) handed down as TradeRow[]. No P&L or scoring math here.
 */

import { cn } from "@/lib/utils";
import type { TradeRow } from "@/components/battle/showcase";
import { TRADER_COLORS } from "@/components/battle/trader-avatar";
import { sessionTimeFromIso } from "@/components/battle/format";

interface TradeTableProps {
  rows: TradeRow[];
  demoName: string;
  opponentName: string;
}

export function TradeTable({ rows, demoName, opponentName }: TradeTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold">Trade-by-trade</h3>
        <p className="text-[11px] text-muted-foreground">
          {rows.length} fills · both accounts · times ET
        </p>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="text-[10px] tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-2 text-left font-medium">Time</th>
              <th className="px-2 py-2 text-left font-medium">Trader</th>
              <th className="px-2 py-2 text-left font-medium">Side</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              <th className="px-2 py-2 text-left font-medium">Instrument</th>
              <th className="px-4 py-2 text-right font-medium">Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const color =
                row.accent === "demo"
                  ? TRADER_COLORS.demo
                  : TRADER_COLORS.opponent;
              return (
                <tr
                  key={row.id}
                  className="border-t border-border/40 tabular-nums hover:bg-secondary/30"
                >
                  <td className="px-4 py-1.5 text-left text-muted-foreground">
                    {sessionTimeFromIso(row.iso)}
                  </td>
                  <td className="px-2 py-1.5 text-left">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      {row.accent === "demo" ? demoName : opponentName}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-left">
                    <span
                      className={cn(
                        "font-medium",
                        row.side === "BUY" ? "text-positive" : "text-negative",
                      )}
                    >
                      {row.side}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right">{row.quantity}</td>
                  <td className="px-2 py-1.5 text-left text-muted-foreground">
                    {row.instrument}
                  </td>
                  <td className="px-4 py-1.5 text-right font-medium">
                    {row.price.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
