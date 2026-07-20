/**
 * TraderProfileView — the shared profile screen rendered by both /profile (the
 * demo user) and /profile/[userId] (any seeded trader), fed a serializable
 * ProfileViewModel built server-side in profile.ts.
 *
 * Pure presentation. Every number was already computed by the scoring/rating/
 * seed layers; skill indicators are framed explicitly as competitive skill
 * signals, never as trading returns or profitability.
 */

import Link from "next/link";
import { Shield, Target, TrendingUp, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { LeagueBadge } from "@/components/battle/league-badge";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import { StatPill } from "@/components/battle/stat-pill";
import {
  BATTLE_STYLE_LABELS,
  formatRatingDelta,
  formatRecord,
  formatScore,
  formatStreak,
  marketTicker,
} from "@/components/battle/format";
import {
  RatingHistoryChart,
} from "@/components/profile/rating-history-chart";
import { AchievementGrid } from "@/components/profile/achievement-grid";
import type { ProfileViewModel } from "@/components/profile/profile";

function SkillCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Shield;
  label: string;
  value: number;
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

export function TraderProfileView({ view }: { view: ProfileViewModel }) {
  const streakTone =
    view.currentStreak > 0
      ? "positive"
      : view.currentStreak < 0
        ? "negative"
        : "neutral";
  const topPercent =
    view.standing !== null ? 100 - view.standing.globalPercentile : null;

  const ratingTrendLabel = `Season rating trend from ${view.seasonStartRating.toLocaleString(
    "en-US",
  )} to ${view.rating.toLocaleString("en-US")}, season high ${view.seasonHighRating.toLocaleString(
    "en-US",
  )}.`;

  return (
    <div className="space-y-6">
      {/* Identity header */}
      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <TraderAvatar
              displayName={view.displayName}
              accent="demo"
              size="lg"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {view.displayName}
                </h1>
                <LeagueBadge league={view.league} division={view.division} />
                {view.isDemoUser ? (
                  <Badge className="text-[10px]">You</Badge>
                ) : null}
                <Badge variant="outline" className="text-muted-foreground">
                  Simulated Demo Data
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {BATTLE_STYLE_LABELS[view.styleLabel]} style
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Primary {marketTicker(view.primaryMarket)}
                {view.secondaryMarkets.length > 0
                  ? ` · Secondary ${view.secondaryMarkets.join(", ")}`
                  : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <StatPill
                  label="Rating"
                  value={view.rating.toLocaleString("en-US")}
                />
                <StatPill
                  label="Season"
                  value={formatRecord(view.seasonWins, view.seasonLosses)}
                />
                <StatPill
                  label="Lifetime"
                  value={formatRecord(view.lifetimeWins, view.lifetimeLosses)}
                />
                <StatPill
                  label="Streak"
                  value={formatStreak(view.currentStreak)}
                  tone={streakTone}
                />
                <StatPill
                  label="Best streak"
                  value={`${view.bestWinStreak}W`}
                />
              </div>
            </div>
          </div>

          {view.standing ? (
            <div className="grid shrink-0 grid-cols-3 gap-2 lg:w-72">
              <StatPill
                label="Global"
                value={`#${view.standing.globalRank}`}
                className="text-center"
              />
              <StatPill
                label="Percentile"
                value={topPercent !== null ? `Top ${topPercent}%` : "—"}
                className="text-center"
              />
              <StatPill
                label={`${view.primaryMarket} rank`}
                value={`#${view.standing.marketRank}`}
                className="text-center"
              />
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Rating trend */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Season rating trend</h2>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {view.seasonStartRating.toLocaleString("en-US")} →{" "}
                {view.rating.toLocaleString("en-US")} · high{" "}
                {view.seasonHighRating.toLocaleString("en-US")}
              </span>
            </div>
            <RatingHistoryChart
              data={view.ratingHistory}
              ariaLabel={ratingTrendLabel}
            />
          </section>

          {/* Skill indicators */}
          <section>
            <h2 className="mb-3 text-sm font-semibold">
              Competitive skill indicators
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <SkillCard
                icon={Shield}
                label="Discipline"
                value={view.disciplineScore}
                hint="Rules & risk adherence"
              />
              <SkillCard
                icon={Target}
                label="Risk"
                value={view.riskScore}
                hint="Drawdown efficiency"
              />
              <SkillCard
                icon={TrendingUp}
                label="Performance"
                value={view.performanceScore}
                hint="Normalized execution"
              />
              <SkillCard
                icon={Trophy}
                label="Standing"
                value={view.rating}
                hint="Current rating"
              />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              These are seed-authored 0–100 competitive skill signals — how a
              trader competes, not a claim of trading returns or profitability.
            </p>
          </section>

          {/* Recent battles */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <h2 className="text-sm font-semibold">Recent battles</h2>
              <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                Simulated
              </span>
            </div>
            {view.recentBattles.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                No battles recorded yet.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {view.recentBattles.map((row) => {
                  const won = row.result === "WIN";
                  return (
                    <li
                      key={row.battleId}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span
                        className={cn(
                          "w-10 shrink-0 rounded-sm border px-1 py-0.5 text-center text-[11px] font-semibold",
                          won
                            ? "border-positive/30 text-positive"
                            : row.result === "LOSS"
                              ? "border-negative/30 text-negative"
                              : "border-border text-muted-foreground",
                        )}
                      >
                        {row.result === "DRAW" ? "Draw" : won ? "Win" : "Loss"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          <span className="text-muted-foreground">vs </span>
                          <Link
                            href={`/profile/${row.opponentUserId}`}
                            className="font-medium underline-offset-2 hover:text-primary hover:underline"
                          >
                            {row.opponentName}
                          </Link>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {row.dateLabel} · {row.market}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tabular-nums">
                          {formatScore(row.selfScore)}
                          <span className="text-muted-foreground">
                            {" "}
                            – {formatScore(row.opponentScore)}
                          </span>
                        </p>
                        <p
                          className={cn(
                            "text-[11px] font-medium tabular-nums",
                            row.ratingChange > 0
                              ? "text-positive"
                              : row.ratingChange < 0
                                ? "text-negative"
                                : "text-muted-foreground",
                          )}
                        >
                          {formatRatingDelta(row.ratingChange)}
                        </p>
                      </div>
                      <Link
                        href={`/battle/review?battle=${row.battleId}`}
                        className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Review
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Achievements */}
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Achievements</h2>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {view.earnedAchievements.length}/{view.catalog.length}
            </span>
          </div>
          <AchievementGrid
            earned={view.earnedAchievements}
            catalog={view.catalog}
          />
        </section>
      </div>
    </div>
  );
}
