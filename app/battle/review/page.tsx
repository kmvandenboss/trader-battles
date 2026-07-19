/**
 * /battle/review — deep post-battle analysis of the seeded showcase battle.
 * Server component: reads the fully-computed BattleDetail via the repositories
 * (loadShowcaseBattle) plus the pure review narrative, and passes serializable
 * numeric arrays to the client Recharts components. No scoring/P&L math in UI.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Home, Lightbulb, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadShowcaseBattle } from "@/components/battle/showcase";
import { ComponentBreakdown } from "@/components/battle/component-breakdown";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import { LeagueBadge } from "@/components/battle/league-badge";
import { PairLineChart } from "@/components/battle-review/pair-line-chart";
import { TradeTable } from "@/components/battle-review/trade-table";
import { EventTimeline } from "@/components/battle-review/event-timeline";
import { formatScore } from "@/components/battle/format";

export const metadata: Metadata = {
  title: "Battle Review",
  description:
    "Post-battle analysis — score components, P&L and drawdown over time, trade-by-trade, event timeline, and a competitive coaching read. Simulated demo data.",
};

export default async function BattleReviewPage() {
  const view = await loadShowcaseBattle();
  if (!view) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        No completed battle is available to review.
      </p>
    );
  }

  const { demo, opponent, narrative } = view;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="outline" className="text-muted-foreground">
              Simulated Demo Data
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
            <Link href="/battle/result">
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

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
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
      </div>
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

      {/* Trade table + timeline */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TradeTable
          rows={view.tradeRows}
          demoName={demo.displayName}
          opponentName={opponent.displayName}
        />
        <EventTimeline rows={view.timeline} />
      </div>

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
          <Link href="/battle/result">
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
