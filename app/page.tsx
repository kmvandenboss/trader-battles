/**
 * / — Home dashboard. Server component: the current trader's competitive
 * overview (session user via the lib/auth seam, demo fallback otherwise), a
 * Find-a-Battle entry point, the most recent battle, performance insights,
 * and a merged activity feed. Every value is read through getRepositories();
 * nothing is computed in the UI.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Shield,
  Swords,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRepositories } from "@/lib/data/repositories";
import { getCurrentTrader } from "@/lib/auth/currentUser";
import { loadShowcaseBattle } from "@/components/battle/showcase";
import { LeagueBadge } from "@/components/battle/league-badge";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import { StatPill } from "@/components/battle/stat-pill";
import {
  formatLeague,
  formatRatingDelta,
  formatRecord,
  formatScore,
  formatSignedUsd,
  formatStreak,
} from "@/components/battle/format";
import {
  RatingSparkline,
  type SparklinePoint,
} from "@/components/dashboard/rating-sparkline";
import {
  ActivityFeed,
  type ActivityItem,
} from "@/components/dashboard/activity-feed";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Your competitive overview — rating, league, season record, streak, recent battle, and the Find a Battle entry point.",
};

function InsightCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Shield;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        <p className="text-[11px] font-medium tracking-wide uppercase">
          {label}
        </p>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export default async function HomePage() {
  const { traders, leaderboards, notifications, battles } = getRepositories();
  const trader = await getCurrentTrader();
  const profile = trader.profile;
  const standing = await leaderboards.getStanding(trader.user.id);
  const ratingHistory = await traders.getRatingHistory(trader.user.id);
  const showcase = await loadShowcaseBattle();
  // Seeded traders (authUserId null) render the demo-data label; a signed-in
  // real trader must never be labeled as simulated (Rule 1).
  const isSeededTrader = trader.user.authUserId === null;

  // Rating trend sparkline (already-computed newRating values from the seed).
  const sparkline: SparklinePoint[] = ratingHistory.map((entry, index) => ({
    index,
    rating: entry.newRating,
  }));

  // Merged activity feed: the demo user's notifications + platform battles.
  const notes = await notifications.listForUser(trader.user.id);
  const recentBattles = await battles.listRecent(6);
  const activity: ActivityItem[] = [
    ...notes.map(
      (n): ActivityItem => ({
        kind: "notification",
        id: n.id,
        iso: n.createdAt,
        type: n.type,
        title: n.title,
        body: n.body,
        href: n.href,
        read: n.read,
      }),
    ),
    ...recentBattles.map((b): ActivityItem => {
      const winner = b.participants.find((p) => p.participant.result === "WIN");
      const loser = b.participants.find((p) => p.participant.result !== "WIN");
      return {
        kind: "battle",
        id: b.battle.id,
        iso: b.battle.endTime ?? b.battle.scheduledStart,
        winner: winner?.trader.user.displayName ?? "—",
        loser: loser?.trader.user.displayName ?? "—",
        market: b.battle.market,
      };
    }),
  ]
    .sort((a, b) => Date.parse(b.iso) - Date.parse(a.iso))
    .slice(0, 8);

  const topPercent = standing ? 100 - standing.globalPercentile : null;
  const streakTone =
    profile.currentStreak > 0
      ? "positive"
      : profile.currentStreak < 0
        ? "negative"
        : "neutral";

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <TraderAvatar
              displayName={trader.user.displayName}
              accent="demo"
              size="lg"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {trader.user.displayName}
                </h1>
                <LeagueBadge league={profile.league} division={profile.division} />
                {isSeededTrader ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Simulated Demo Data
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatLeague(profile.league, profile.division)} · Primary{" "}
                {profile.primaryMarket}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatPill
                  label="Rating"
                  value={profile.rating.toLocaleString("en-US")}
                />
                <StatPill
                  label="Season"
                  value={formatRecord(profile.seasonWins, profile.seasonLosses)}
                />
                <StatPill
                  label="Streak"
                  value={formatStreak(profile.currentStreak)}
                  tone={streakTone}
                />
                {standing ? (
                  <StatPill
                    label="Global rank"
                    value={`#${standing.globalRank} / ${standing.totalTraders}`}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="lg:w-72 lg:shrink-0">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Season rating trend</span>
              <span className="tabular-nums">
                {ratingHistory.length > 0
                  ? `${ratingHistory[0].previousRating.toLocaleString("en-US")} → ${profile.rating.toLocaleString("en-US")}`
                  : null}
              </span>
            </div>
            {ratingHistory.length > 0 ? (
              <RatingSparkline
                data={sparkline}
                ariaLabel={`Season rating trend from ${ratingHistory[0].previousRating.toLocaleString("en-US")} to ${profile.rating.toLocaleString("en-US")}.`}
              />
            ) : (
              <p className="flex h-16 items-center justify-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground">
                Your rating trend appears after your first battle.
              </p>
            )}
            <Button size="lg" className="mt-3 w-full" asChild>
              <Link href="/matchmaking">
                <Swords data-icon="inline-start" aria-hidden />
                Find a Battle
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Recent battle */}
          {showcase ? (
            <section className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Latest battle</h2>
                <Badge
                  variant="outline"
                  className={
                    showcase.demo.won
                      ? "border-positive/30 text-positive"
                      : "border-negative/30 text-negative"
                  }
                >
                  {showcase.demo.won ? "Win" : "Loss"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <TraderAvatar
                    displayName={showcase.demo.displayName}
                    accent="demo"
                    size="md"
                  />
                  <div>
                    <p className="text-sm font-semibold">
                      {showcase.demo.displayName}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatScore(showcase.demo.finalScore)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-center">
                  {showcase.demo.won ? (
                    <Trophy className="size-4 text-primary" aria-hidden />
                  ) : null}
                  <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                    vs
                  </span>
                </div>
                <div className="flex flex-row-reverse items-center gap-3 text-right">
                  <TraderAvatar
                    displayName={showcase.opponent.displayName}
                    accent="opponent"
                    size="md"
                  />
                  <div>
                    <p className="text-sm font-semibold">
                      {showcase.opponent.displayName}
                    </p>
                    <p className="text-2xl font-semibold tabular-nums">
                      {formatScore(showcase.opponent.finalScore)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <StatPill
                  label="Your net P&L"
                  value={formatSignedUsd(showcase.demo.netPnl)}
                />
                <StatPill
                  label="Rating change"
                  value={`${formatRatingDelta(showcase.demo.ratingChange)} → ${showcase.demo.endingRating.toLocaleString("en-US")}`}
                  tone={
                    showcase.demo.ratingChange > 0
                      ? "positive"
                      : showcase.demo.ratingChange < 0
                        ? "negative"
                        : "neutral"
                  }
                />
                <StatPill
                  label="Market · date"
                  value={`${showcase.market} · ${showcase.dateLabel.split(",")[0]}`}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/battle/result">
                    View result
                    <ArrowRight data-icon="inline-end" aria-hidden />
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/battle/review">Full review</Link>
                </Button>
              </div>
            </section>
          ) : (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold">Latest battle</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                No battles on record yet. Queue up, trade your window, and your
                results will land here.
              </p>
              <Button variant="outline" size="sm" className="mt-4" asChild>
                <Link href="/matchmaking">
                  Find your first battle
                  <ArrowRight data-icon="inline-end" aria-hidden />
                </Link>
              </Button>
            </section>
          )}

          {/* Performance insights */}
          <section>
            <h2 className="mb-3 text-sm font-semibold">Competitive strengths</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <InsightCard
                icon={Shield}
                label="Discipline"
                value={String(profile.disciplineScore)}
                hint="Rules & risk adherence"
              />
              <InsightCard
                icon={Target}
                label="Risk"
                value={String(profile.riskScore)}
                hint="Drawdown efficiency"
              />
              <InsightCard
                icon={TrendingUp}
                label="Performance"
                value={String(profile.performanceScore)}
                hint="Normalized execution"
              />
              <InsightCard
                icon={Trophy}
                label="Standing"
                value={topPercent !== null ? `Top ${topPercent}%` : "—"}
                hint={
                  standing
                    ? `Rank ${standing.globalRank} of ${standing.totalTraders}`
                    : "Global percentile"
                }
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {isSeededTrader
                ? "Component strengths are seed-authored 0–100 skill indicators, not a claim of trading returns."
                : "Component strengths are 0–100 competitive skill indicators (neutral 50 until battles inform them), not a claim of trading returns."}
            </p>
          </section>
        </div>

        {/* Activity feed */}
        <ActivityFeed items={activity} />
      </div>
    </div>
  );
}
