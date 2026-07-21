"use client";

/**
 * SettleCard — the "Settle battle" control on /battles/[id]. Posts to
 * settleBattleAction; the settlement service enforces every rule (window
 * closed, both imports present) and its ServiceError messages render inline
 * verbatim. Success redirects back to the battle page, which then shows the
 * settled result. No scoring math in the browser.
 */

import { useActionState } from "react";
import { Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { settleBattleAction } from "@/app/battles/[id]/actions";
import { INITIAL_SETTLE_STATE } from "./action-state";

export function SettleCard({ battleId }: { battleId: string }) {
  const [state, formAction, pending] = useActionState(
    settleBattleAction,
    INITIAL_SETTLE_STATE,
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">Settle the battle</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        Settlement runs after the window closes and both traders have
        imported. It scores only in-window realized trades (plus the buzzer
        mark-out for open positions), resolves ties by the cascade, and
        updates both ratings. Re-settling with the same imports produces the
        same result.
      </p>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="battleId" value={battleId} />
        {state.error ? (
          <p
            role="alert"
            className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative"
          >
            {state.error}
          </p>
        ) : null}
        <Button type="submit" size="sm" disabled={pending}>
          <Gavel data-icon="inline-start" aria-hidden />
          {pending ? "Settling…" : "Settle battle"}
        </Button>
      </form>
    </section>
  );
}
