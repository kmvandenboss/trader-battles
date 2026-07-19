/**
 * /integrations — how real trading-platform integrations would plug in later.
 * Static server-rendered page built verbatim from docs/integration-roadmap.md.
 *
 * IMPORTANT: nothing here is connected. Every provider is a planned design, not
 * a commitment, and no partnership, endorsement, or confirmed integration with
 * any firm or platform is implied. This page imports no engine and computes
 * nothing — it is display copy only.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Plug, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ProviderCard,
  type PlannedProvider,
} from "@/components/integrations/provider-card";

export const metadata: Metadata = { title: "Integrations" };

const PROVIDERS: PlannedProvider[] = [
  {
    name: "NinjaTrader",
    phase: "Phase 1 — desktop add-on",
    status: "Planned — design only",
    connection: "Local desktop add-on, signed events (CSV fallback)",
    data: "Executions, orders, position changes, account snapshots",
    verification: "CLIENT_VERIFIED",
  },
  {
    name: "Tradovate",
    phase: "Phase 2 — direct integration",
    status: "Planned — subject to API availability",
    connection: "Server-to-server OAuth-style grant",
    data: "Historical executions, account snapshots, live stream where supported",
    verification: "PROVIDER_VERIFIED",
  },
  {
    name: "Rithmic",
    phase: "Phase 3 — additional providers",
    status: "Planned — subject to commercial + technical approval",
    connection: "Provider-level adapter",
    data: "Executions and account state via the same adapter pattern",
    verification: "PROVIDER_VERIFIED",
  },
  {
    name: "CQG · ProjectX · other systems",
    phase: "Phase 3 — additional providers",
    status: "Planned — additive enum entries",
    connection: "One new provider folder per system",
    data: "Broker / prop-firm executions via the shared adapter pattern",
    verification: "PROVIDER_VERIFIED",
  },
  {
    name: "Partner infrastructure",
    phase: "Phase 4 — once multiple live providers exist",
    status: "Planned — not started",
    connection: "Firm dashboards, webhooks, enterprise APIs on the same repositories",
    data: "Team standings, roster activity, battle-result feeds",
    verification: "PROVIDER_VERIFIED",
  },
];

const SEAMS = [
  {
    name: "TradingIntegrationProvider",
    detail:
      "Every source of trading activity implements the same connect / disconnect / snapshot / historical / subscribe interface. The mock provider already implements it in full, subscription included.",
  },
  {
    name: "Normalized-execution-event boundary",
    detail:
      "Adapters emit raw records that validate into NormalizedExecutionEvents — the only shape allowed into the pipeline. Past this boundary, mock data is indistinguishable from real data.",
  },
  {
    name: "BattleScriptSource",
    detail:
      "The battle engine consumes a provider-agnostic script (price tape + raw executions). The mock source is only the registered demo default; a live source is registered the same way.",
  },
  {
    name: "BattleClock transport",
    detail:
      "The demo's timed client tick loop is the documented seam to swap for an SSE / WebSocket subscription of server-computed snapshots. The clock's output shape stays identical, so no UI changes.",
  },
  {
    name: "Repository interface",
    detail:
      "All reads go through the async Repositories. The in-memory seed implementation swaps for a Postgres implementation on the existing Drizzle schema with zero caller changes.",
  },
];

function SectionHeading({
  icon: Icon,
  children,
}: {
  icon?: typeof Plug;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {Icon ? (
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      ) : null}
      <h2 className="text-sm font-semibold">{children}</h2>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <Badge>Coming soon</Badge>
          <Badge variant="outline" className="text-muted-foreground">
            Simulated Demo Data
          </Badge>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          How real trading-platform integrations would plug into Trader Battles
          later. The phases below are a design plan, not commitments.
        </p>
      </header>

      {/* Honest status banner */}
      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex gap-3">
          <AlertTriangle
            className="mt-0.5 size-5 shrink-0 text-primary"
            aria-hidden
          />
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-foreground">
              Nothing is connected. This demo runs on 100% simulated data.
            </p>
            <p className="text-xs text-muted-foreground">
              No partnership, endorsement, or confirmed integration with any firm
              or platform is implied by anything on this page or in the product.
              The provider folders in the codebase contain README stubs only — no
              implementation and no API access.
            </p>
          </div>
        </div>
      </section>

      {/* Planned provider matrix */}
      <section>
        <SectionHeading icon={Plug}>Planned provider roadmap</SectionHeading>
        <p className="mb-4 max-w-3xl text-xs text-muted-foreground">
          Each provider below is planned and not yet connected. The verification
          state shown is what live data <em>would</em> arrive as once the
          integration is built — not a status it holds today.
        </p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {PROVIDERS.map((p) => (
            <ProviderCard key={p.name} provider={p} />
          ))}
        </div>
      </section>

      {/* Verification states */}
      <section className="rounded-xl border border-border bg-card p-5">
        <SectionHeading icon={ShieldCheck}>
          Verification travels with the data
        </SectionHeading>
        <p className="mb-4 max-w-3xl text-xs text-muted-foreground">
          Every account, event, and battle carries a verification state. Today
          everything is universally simulated; live data would arrive at a
          stronger state depending on how it was collected.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <code className="rounded-md border border-border bg-secondary/30 px-2 py-1 font-medium text-muted-foreground">
            SIMULATED
          </code>
          <span className="text-muted-foreground">today, everywhere</span>
          <span aria-hidden className="text-muted-foreground">
            &rarr;
          </span>
          <code className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 font-medium text-primary">
            CLIENT_VERIFIED
          </code>
          <span className="text-muted-foreground">desktop add-on paths</span>
          <span aria-hidden className="text-muted-foreground">
            &rarr;
          </span>
          <code className="rounded-md border border-primary/30 bg-primary/5 px-2 py-1 font-medium text-primary">
            PROVIDER_VERIFIED
          </code>
          <span className="text-muted-foreground">
            direct provider integrations — the strongest state
          </span>
        </div>
      </section>

      {/* Drop-in seams */}
      <section className="rounded-xl border border-border bg-card p-5">
        <SectionHeading icon={Plug}>
          What makes integrations drop-in
        </SectionHeading>
        <p className="mb-4 max-w-3xl text-xs text-muted-foreground">
          The demo was built so real providers can replace simulated data with
          zero changes to scoring, battles, matchmaking, or UI. Five seams
          already exist in the code.
        </p>
        <ol className="space-y-3">
          {SEAMS.map((s, i) => (
            <li key={s.name} className="flex gap-3">
              <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary tabular-nums">
                {i + 1}
              </span>
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {s.name}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  {s.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          Swapping the mock provider for a real one touches only a new provider
          folder, a live BattleScriptSource, a server transport behind the
          BattleClock seam, and a Postgres-backed repository implementation.
          Scoring, ratings, executions, the battle engine, and every UI component
          stay unchanged.
        </p>
      </section>

      {/* Explicit exclusion */}
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            TradingView is deliberately not planned
          </span>{" "}
          as an execution-data source — at most a future charting or alert layer,
          never an authoritative record of manual trades. For how scores are
          computed from these normalized events, see{" "}
          <Link href="/scoring" className="text-primary hover:underline">
            How Scoring Works
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
