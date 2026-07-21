"use client";

/**
 * MarketBarsCard — secondary, collapsed card for importing 1-minute OHLCV
 * bars used ONLY to mark open positions at the window close (buzzer
 * mark-out). Posts to importBarsAction; all parsing/persistence is
 * server-side and the returned counts render verbatim.
 */

import { useActionState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importBarsAction } from "@/app/battles/[id]/actions";
import { INITIAL_IMPORT_BARS_STATE } from "./action-state";

export interface BarsMarketOption {
  value: string;
  label: string;
}

const INPUT_CLASS =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";

const FILE_INPUT_CLASS =
  "w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground outline-none transition-colors file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-secondary-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";

export function MarketBarsCard({
  battleId,
  markets,
}: {
  battleId: string;
  markets: BarsMarketOption[];
}) {
  const [state, formAction, pending] = useActionState(
    importBarsAction,
    INITIAL_IMPORT_BARS_STATE,
  );

  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 text-muted-foreground transition-transform group-open:rotate-90"
          aria-hidden
        />
        Market data for mark-out (1-min bars CSV)
        <span className="ml-auto text-[11px] font-normal text-muted-foreground">
          Optional — only needed if a position was open at the buzzer
        </span>
      </summary>
      <div className="border-t border-border/60 p-5 pt-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Bars are used only to mark positions still open when the window
          closes. Because that close-out is hypothetical, battle P&amp;L can
          differ from account P&amp;L. Format:{" "}
          <code className="rounded-sm bg-secondary/60 px-1 py-px font-mono text-[11px]">
            timestamp,open,high,low,close,volume
          </code>{" "}
          (1-minute bars, UTC timestamps).
        </p>
        <form action={formAction} className="mt-3 space-y-3">
          <input type="hidden" name="battleId" value={battleId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              name="instrument"
              required
              disabled={pending}
              aria-label="Instrument"
              className={INPUT_CLASS}
              defaultValue=""
            >
              <option value="" disabled>
                Instrument…
              </option>
              {markets.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              disabled={pending}
              aria-label="Bars CSV file"
              className={FILE_INPUT_CLASS}
            />
          </div>
          {state.status === "error" && state.error ? (
            <p
              role="alert"
              className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative"
            >
              {state.error}
            </p>
          ) : null}
          {state.status === "success" && state.result ? (
            <p className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-xs text-positive">
              Imported {state.result.parsedBars} bar(s) for{" "}
              {state.result.instrument}: {state.result.inserted} new,{" "}
              {state.result.replaced} replaced
              {state.result.rejectedRows.length > 0
                ? `, ${state.result.rejectedRows.length} row(s) rejected (first: line ${state.result.rejectedRows[0].line} — ${state.result.rejectedRows[0].reason})`
                : ""}
              .
            </p>
          ) : null}
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            {pending ? "Importing…" : "Import bars"}
          </Button>
        </form>
      </div>
    </details>
  );
}
