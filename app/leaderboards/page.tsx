/**
 * /leaderboards — season rankings. Server component: filters flow purely
 * through URL search params (?league&market), the page re-queries the
 * LeaderboardRepository, and renders the already-computed ranks/win rates.
 * Nothing (rank, win rate, standing) is computed in the UI.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { getRepositories } from "@/lib/data/repositories";
import { getCurrentTrader } from "@/lib/auth/currentUser";
import {
  LEAGUES,
  MARKETS,
  type League,
  type Market,
} from "@/lib/data/schema";
import { LeagueBadge } from "@/components/battle/league-badge";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import { StatPill } from "@/components/battle/stat-pill";
import {
  LEAGUE_LABELS,
  formatRecord,
  formatStreak,
  formatWinRate,
} from "@/components/battle/format";
import { QueryFilters } from "@/components/filters/query-filters";
import { DATA_SOURCE_NOTE } from "@/components/battle-v1/labels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Leaderboards",
  description:
    "Global, league, and market rankings across the season — rating, record, win rate, and streak. Includes seeded demo traders.",
};

interface LeaderboardsSearchParams {
  league?: string;
  market?: string;
}

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<LeaderboardsSearchParams>;
}) {
  const params = await searchParams;
  const { leaderboards } = getRepositories();

  // Validate params against known values; ignore anything unrecognized.
  const league = LEAGUES.includes(params.league as League)
    ? (params.league as League)
    : undefined;
  const market = MARKETS.includes(params.market as Market)
    ? (params.market as Market)
    : undefined;

  const trader = await getCurrentTrader();
  const demoUserId = trader.user.id;
  const [{ entries, total }, standing] = await Promise.all([
    leaderboards.query({ league, market }),
    leaderboards.getStanding(demoUserId),
  ]);

  const topPercent =
    standing !== null ? 100 - standing.globalPercentile : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Leaderboards
            </h1>
            <Badge variant="outline" className="text-muted-foreground">
              Demo + self-reported
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Season standings by rating. Ratings reflect competitive
            performance, not money. {DATA_SOURCE_NOTE}
          </p>
        </div>
      </header>

      {/* Your standing */}
      {standing ? (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <TraderAvatar
                displayName={trader.user.displayName}
                accent="demo"
                size="sm"
              />
              <span className="font-semibold">{trader.user.displayName}</span>
              <LeagueBadge
                league={trader.profile.league}
                division={trader.profile.division}
              />
              <span className="text-muted-foreground">— your standing</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatPill
                label="Global rank"
                value={`#${standing.globalRank} / ${standing.totalTraders}`}
              />
              <StatPill
                label="Percentile"
                value={topPercent !== null ? `Top ${topPercent}%` : "—"}
              />
              <StatPill
                label={`${trader.profile.primaryMarket} rank`}
                value={`#${standing.marketRank} / ${standing.marketTraders}`}
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* Filters */}
      <QueryFilters
        fields={[
          {
            paramKey: "league",
            label: "League",
            options: LEAGUES.map((l) => ({
              value: l,
              label: LEAGUE_LABELS[l],
            })),
            allLabel: "All leagues",
          },
          {
            paramKey: "market",
            label: "Market",
            options: MARKETS.map((m) => ({ value: m, label: m })),
            allLabel: "All markets",
          },
        ]}
      />

      {/* Table */}
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            {total} trader{total === 1 ? "" : "s"}
            {league || market ? " (filtered)" : ""}
          </span>
          <span className="tracking-wide uppercase">Demo + self-reported</span>
        </div>

        {entries.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            No traders match these filters. Try widening your selection.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Trader</th>
                  <th className="px-4 py-2 text-right font-medium">Rating</th>
                  <th className="px-4 py-2 text-right font-medium">Record</th>
                  <th className="px-4 py-2 text-right font-medium">Win rate</th>
                  <th className="px-4 py-2 text-right font-medium">Streak</th>
                  <th className="px-4 py-2 font-medium">Market</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const t = entry.trader;
                  const isDemo = t.user.id === demoUserId;
                  const streak = t.profile.currentStreak;
                  return (
                    <tr
                      key={t.user.id}
                      className={cn(
                        "border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/30",
                        isDemo && "bg-primary/5",
                      )}
                    >
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {entry.rank}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/profile/${t.user.id}`}
                          className="flex items-center gap-2.5"
                        >
                          <TraderAvatar
                            displayName={t.user.displayName}
                            accent={isDemo ? "demo" : "opponent"}
                            size="sm"
                          />
                          <span className="font-medium underline-offset-2 hover:text-primary hover:underline">
                            {t.user.displayName}
                          </span>
                          <LeagueBadge
                            league={t.profile.league}
                            division={t.profile.division}
                          />
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {t.profile.rating.toLocaleString("en-US")}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatRecord(
                          t.profile.seasonWins,
                          t.profile.seasonLosses,
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {formatWinRate(entry.winRate)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right tabular-nums",
                          streak > 0
                            ? "text-positive"
                            : streak < 0
                              ? "text-negative"
                              : "text-muted-foreground",
                        )}
                      >
                        {formatStreak(streak)}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {t.profile.primaryMarket}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
