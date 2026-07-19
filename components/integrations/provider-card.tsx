/**
 * Static presentation card for a planned integration provider on /integrations.
 *
 * Renders roadmap copy from docs/integration-roadmap.md. Nothing is connected;
 * every card is explicitly labeled planned / not-yet-connected. No card may
 * read as live. No partnership, endorsement, or integration is implied.
 */

import { Badge } from "@/components/ui/badge";

export interface PlannedProvider {
  name: string;
  phase: string;
  /** Always a planned/not-connected status — no provider is live. */
  status: string;
  connection: string;
  data: string;
  /** Verification state that live data WOULD arrive as, once built. */
  verification: string;
}

export function ProviderCard({ provider }: { provider: PlannedProvider }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{provider.name}</h3>
          <p className="mt-0.5 text-[11px] tracking-wide text-muted-foreground uppercase">
            {provider.phase}
          </p>
        </div>
        <Badge
          variant="outline"
          className="border-border/70 text-[10px] text-muted-foreground"
        >
          Not connected
        </Badge>
      </div>

      <dl className="grid grid-cols-1 gap-2.5 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">Status</dt>
          <dd className="text-right font-medium text-foreground">
            {provider.status}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">Connection method</dt>
          <dd className="text-right text-foreground">{provider.connection}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="shrink-0 text-muted-foreground">Data expected</dt>
          <dd className="text-right text-foreground">{provider.data}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-2.5">
          <dt className="shrink-0 text-muted-foreground">
            Verification (once live)
          </dt>
          <dd className="text-right">
            <code className="text-[11px] font-medium text-primary">
              {provider.verification}
            </code>
          </dd>
        </div>
      </dl>
    </div>
  );
}
