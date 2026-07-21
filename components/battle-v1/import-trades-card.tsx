"use client";

/**
 * ImportTradesCard — the current participant's CSV trade-import card on
 * /battles/[id].
 *
 * Pure form state + presentation: the file is posted to importTradesAction,
 * which runs the settlement service's import path (parse → the EXISTING
 * ingestion pipeline → persist). Every count and preview number rendered
 * here was computed server-side and returned in the action state — nothing
 * is parsed or scored in the browser. Rule 1: imported trades are labeled
 * self-reported, never demo/simulated, never broker-verified.
 */

import { useActionState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importTradesAction } from "@/app/battles/[id]/actions";
import { INITIAL_IMPORT_TRADES_STATE } from "./action-state";

const FILE_INPUT_CLASS =
  "w-full cursor-pointer rounded-md border border-border bg-background px-3 py-2 text-sm text-muted-foreground outline-none transition-colors file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-secondary-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50";

function CountBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 bg-secondary/40 px-2.5 py-1.5">
      <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ImportTradesCard({ battleId }: { battleId: string }) {
  const [state, formAction, pending] = useActionState(
    importTradesAction,
    INITIAL_IMPORT_TRADES_STATE,
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Import your trades</h2>
        <span className="inline-flex h-5 items-center rounded-sm border border-border bg-secondary/40 px-1.5 text-[11px] font-medium text-muted-foreground">
          Self-reported (CSV import)
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        Upload your MFFU trade export (CSV, one row per round-trip trade)
        after the window closes. Imported trades are self-reported — they are
        not broker-verified. Only trades entered inside the battle window
        count toward the score; re-importing the same file is safe
        (duplicates are skipped).
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <input type="hidden" name="battleId" value={battleId} />
        <input
          type="file"
          name="file"
          accept=".csv,text/csv"
          required
          disabled={pending}
          aria-label="Trade CSV file"
          className={FILE_INPUT_CLASS}
        />
        {state.status === "error" && state.error ? (
          <p
            role="alert"
            className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative"
          >
            {state.error}
          </p>
        ) : null}
        <Button type="submit" size="sm" disabled={pending}>
          <Upload data-icon="inline-start" aria-hidden />
          {pending ? "Importing…" : "Import trades"}
        </Button>
      </form>

      {state.status === "success" && state.result ? (
        <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">
            Imported for account{" "}
            <span className="font-medium text-foreground">
              {state.result.accountLabel}
            </span>
            .
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CountBlock label="Rows parsed" value={state.result.parsedRows} />
            <CountBlock label="New events" value={state.result.inserted} />
            <CountBlock
              label="Duplicates skipped"
              value={state.result.skippedDuplicates + state.result.duplicates}
            />
            <CountBlock
              label="Rows rejected"
              value={state.result.rejectedRows.length}
            />
          </div>
          {state.result.rejectedRows.length > 0 ? (
            <div className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2">
              <p className="text-xs font-medium text-negative">
                Rejected rows (not imported):
              </p>
              <ul className="mt-1 space-y-0.5 text-[11px] text-negative/90">
                {state.result.rejectedRows.map((r) => (
                  <li key={`${r.line}-${r.reason}`}>
                    Line {r.line}: {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            <p className="font-medium text-foreground">
              What will count at settlement
            </p>
            <p>
              {state.result.preview.tradesInWindow} trade(s) inside the battle
              window will count · {state.result.preview.tradesOutsideWindow}{" "}
              trade(s) entered outside the window will be excluded ·{" "}
              {state.result.preview.openAtBuzzer} position(s) open at the
              buzzer will be marked out at the window-close price.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
