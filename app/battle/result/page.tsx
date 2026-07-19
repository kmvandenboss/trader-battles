/**
 * /battle/result — standalone battle completion screen for the seeded showcase
 * battle (KevinV vs DeltaHunter). Server component: reads the fully-computed
 * result via the repositories (loadShowcaseBattle) and the pure review
 * narrative. No scores, ratings, or P&L are computed in the UI.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Home, Swords, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { loadBattleView, loadShowcaseBattle } from "@/components/battle/showcase";
import { FinalScorecard } from "@/components/battle/final-scorecard";
import { ComponentBreakdown } from "@/components/battle/component-breakdown";
import { formatRatingDelta } from "@/components/battle/format";

export const metadata: Metadata = {
  title: "Battle Result",
  description:
    "Head-to-head battle completion — final normalized scores, rating movement, and why the winner took it. Simulated demo data.",
};

export default async function BattleResultPage({
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
        No completed battle is available to show.
      </p>
    );
  }

  const { demo, opponent, narrative } = view;
  const reviewHref = `/battle/review?battle=${view.battleId}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Headline */}
      <section className="rounded-xl border border-border bg-card px-5 py-8 text-center sm:px-8">
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline" className="text-muted-foreground">
            Simulated Demo Data
          </Badge>
          <Badge variant="outline" className="border-primary/30 text-primary">
            Final
          </Badge>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Trophy className="size-6 text-primary" aria-hidden />
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {view.headline}
          </h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {view.marketLabel.split(" · ")[0]} · {view.windowLabel.split(" · ")[0]}{" "}
          · {view.dateLabel}
        </p>

        {/* Score cards */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <FinalScorecard participant={demo} emphasis />
          <FinalScorecard participant={opponent} emphasis />
        </div>

        {/* Rating emphasis for the demo user */}
        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
          <span className="text-muted-foreground">{demo.displayName} rating</span>
          <span className="font-semibold tabular-nums">
            {demo.startingRating.toLocaleString("en-US")}
          </span>
          <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
          <span className="font-semibold tabular-nums">
            {demo.endingRating.toLocaleString("en-US")}
          </span>
          <span
            className={
              demo.ratingChange > 0
                ? "font-semibold text-positive tabular-nums"
                : demo.ratingChange < 0
                  ? "font-semibold text-negative tabular-nums"
                  : "font-semibold tabular-nums"
            }
          >
            ({formatRatingDelta(demo.ratingChange)})
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Rating movement reflects competitive standing only — not money won or
          lost.
        </p>
      </section>

      {/* Component breakdown */}
      <ComponentBreakdown
        edges={narrative.componentEdges}
        demoName={demo.displayName}
        opponentName={opponent.displayName}
        weightsNote="Weighted model — Performance 40% · Risk 25% · Discipline 20% · Consistency 15%."
      />

      {/* Why the demo user won */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">
          Why {demo.displayName} {demo.won ? "won" : "lost"}
        </h2>
        <ul className="mt-2.5 space-y-1.5 text-sm text-foreground/90">
          {narrative.reasons.map((reason) => (
            <li key={reason} className="flex gap-2">
              <span aria-hidden className="mt-0.5 text-primary">
                •
              </span>
              <span className="tabular-nums">{reason}</span>
            </li>
          ))}
        </ul>
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
          <Link href={reviewHref}>
            Full review
            <ArrowRight data-icon="inline-end" aria-hidden />
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
