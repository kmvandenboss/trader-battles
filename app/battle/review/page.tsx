/**
 * /battle/review — deep post-battle analysis of the seeded showcase battle.
 * Server component: reads the fully-computed BattleDetail via the repositories
 * (loadShowcaseBattle) plus the pure review narrative, and passes serializable
 * numeric arrays to the client Recharts components. No scoring/P&L math in UI.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Home, Info, Lightbulb, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadBattleView, loadShowcaseBattle } from "@/components/battle/showcase";
import { ComponentBreakdown } from "@/components/battle/component-breakdown";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import { LeagueBadge } from "@/components/battle/league-badge";
import { PairLineChart } from "@/components/battle-review/pair-line-chart";
import { TradeTable } from "@/components/battle-review/trade-table";
import { EventTimeline } from "@/components/battle-review/event-timeline";
import { formatScore } from "@/components/battle/format";
import { VERIFICATION_LABELS } from "@/components/battle-v1/labels";

export const metadata: Metadata = {
  title: "Battle Review",
  description:
    "Post-battle analysis — score components, P&L and drawdown over time, trade-by-trade, event timeline, and a competitive coaching read. Simulated demo data.",
};

export default async function BattleReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ battle?: string }>;
}) {
  const { battle } = await searchParams;
  const view =
    (battle ? await loadBattleView(battle) : null) ??
    (await loadShowcaseBattle());
  if (!view) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        No completed battle is available to review.
      </p>
    );
  }
  // PNL_V1 battles have no 4-factor components (their final snapshots
  // persist zeros) — this screen would misrepresent them. Their settled
  // result lives on the v1 battle page.
  if (view.scoringMode === "PNL_V1") {
    redirect(`/battles/${view.battleId}`);
  }

  const { demo, opponent, narrative } = view;
  const resultHref = `/battle/result?battle=${view.battleId}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="outline" className="text-muted-foreground">
              {VERIFICATION_LABELS[view.verificationStatus]}
            </Badge>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              Battle review
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {view.marketLabel} · {view.windowLabel.split(" · ")[0]} ·{" "}
              {view.dateLabel}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={resultHref}>
              <ArrowLeft data-icon="inline-start" aria-hidden />
              Back to result
            </Link>
          </Button>
        </div>

        {/* Matchup strip */}
        <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-secondary/30 px-4 py-3">
          {[demo, opponent].map((p, index) => (
            <div
              key={p.userId}
              className={
                index === 0
                  ? "flex items-center gap-2.5"
                  : "flex flex-row-reverse items-center gap-2.5 text-right"
              }
            >
              <TraderAvatar
                displayName={p.displayName}
                accent={p.accent}
                size="md"
              />
              <div>
                <p className="text-sm font-semibold">
                  {p.displayName}
                  {p.won ? (
                    <span className="ml-1.5 text-[11px] font-medium text-primary">
                      Winner
                    </span>
                  ) : null}
                </p>
                <div
                  className={
                    index === 0
                      ? "flex items-center gap-1.5"
                      : "flex flex-row-reverse items-center gap-1.5"
                  }
                >
                  <LeagueBadge league={p.league} division={p.division} />
                  <span className="text-sm font-semibold tabular-nums">
                    {formatScore(p.finalScore)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Component breakdown */}
      <ComponentBreakdown
        edges={narrative.componentEdges}
        demoName={demo.displayName}
        opponentName={opponent.displayName}
        weightsNote="Weighted model — Performance 40% · Risk 25% · Discipline 20% · Consistency 15%. The total score rewards disciplined, risk-efficient trading over gross dollars."
      />

      {/* Intra-battle telemetry — present only for live-played battles in the
          demo. Absent it, we show an honest note and lean on the final board. */}
      {view.hasTelemetry ? (
        <>
          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            {view.pnlSeries.length > 0 ? (
              <PairLineChart
                title="P&L over time"
                subtitle="Realized P&L per account"
                data={view.pnlSeries}
                demoName={demo.displayName}
                opponentName={opponent.displayName}
                startTimestampMs={view.startTimestampMs}
                durationMin={view.durationMin}
                valueKind="pnl"
              />
            ) : null}
            {view.drawdownSeries.length > 0 ? (
              <PairLineChart
                title="Drawdown over time"
                subtitle="Peak-to-trough drop per account"
                data={view.drawdownSeries}
                demoName={demo.displayName}
                opponentName={opponent.displayName}
                startTimestampMs={view.startTimestampMs}
                durationMin={view.durationMin}
                valueKind="drawdown"
              />
            ) : null}
          </div>
          {view.scoreSeries.length > 0 ? (
            <PairLineChart
              title="Battle score progression"
              subtitle="Normalized 0–100 score at each checkpoint"
              data={view.scoreSeries}
              demoName={demo.displayName}
              opponentName={opponent.displayName}
              startTimestampMs={view.startTimestampMs}
              durationMin={view.durationMin}
              valueKind="score"
            />
          ) : null}

          {/* Trade table + timeline */}
          <div className="grid gap-6 lg:grid-cols-2">
            {view.tradeRows.length > 0 ? (
              <TradeTable
                rows={view.tradeRows}
                demoName={demo.displayName}
                opponentName={opponent.displayName}
              />
            ) : null}
            {view.timeline.length > 0 ? (
              <EventTimeline rows={view.timeline} />
            ) : null}
          </div>
        </>
      ) : (
        <section className="flex items-start gap-3 rounded-xl border border-border bg-secondary/20 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            Full intra-battle telemetry — P&amp;L and drawdown curves,
            trade-by-trade fills, and the event timeline — is captured for
            live-played battles in this demo. For this battle we&apos;re showing
            the final score breakdown, rating movement, and competitive read.
          </p>
        </section>
      )}

      {/* Coaching summary */}
      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="mb-2 flex items-center gap-2">
          <Lightbulb className="size-4 text-primary" aria-hidden />
          <h2 className="text-sm font-semibold">Coach&apos;s read</h2>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Simulated
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90">
          {narrative.coaching}
        </p>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href="/matchmaking">
            <Swords data-icon="inline-start" aria-hidden />
            Rematch
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={resultHref}>
            <ArrowLeft data-icon="inline-start" aria-hidden />
            Back to result
          </Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/">
            <Home data-icon="inline-start" aria-hidden />
            Home
          </Link>
        </Button>
      </div>
    </div>
  );
}
