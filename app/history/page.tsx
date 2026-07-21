/**
 * /history — the demo user's match history. Server component: filters flow
 * through URL search params mapped to BattleHistoryFilter, the page re-queries
 * the BattleRepository, and renders the already-stored per-battle results. The
 * summary strip tallies provided WIN/LOSS rows for display — it computes no
 * scores or ratings.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getRepositories } from "@/lib/data/repositories";
import { getCurrentTrader } from "@/lib/auth/currentUser";
import {
  BATTLE_TYPES,
  BATTLE_WINDOWS,
  MARKETS,
  type BattleType,
  type BattleWindow,
  type Market,
} from "@/lib/data/schema";
import type { BattleHistoryFilter } from "@/lib/data/repositories/types";
import { LeagueBadge } from "@/components/battle/league-badge";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import { StatPill } from "@/components/battle/stat-pill";
import {
  BATTLE_TYPE_LABELS,
  BATTLE_WINDOW_LABELS,
  formatDate,
  formatRatingDelta,
  formatScore,
  formatWinRate,
} from "@/components/battle/format";
import { QueryFilters } from "@/components/filters/query-filters";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Match History",
  description:
    "Every past battle — result, score, rating movement, and a full review. Filterable by result, market, type, window, opponent, and date. Simulated demo data.",
};

interface HistorySearchParams {
  result?: string;
  market?: string;
  battleType?: string;
  battleWindow?: string;
  opponent?: string;
  from?: string;
  to?: string;
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<HistorySearchParams>;
}) {
  const params = await searchParams;
  const { battles } = getRepositories();
  const trader = await getCurrentTrader();
  const demoUserId = trader.user.id;
  // Seeded traders (authUserId null) carry the demo-data label; a signed-in
  // real trader's history must never be labeled simulated (Rule 1).
  const isSeededTrader = trader.user.authUserId === null;

  // Full (unfiltered) list drives the opponent filter options.
  const allBattles = await battles.listForUser(demoUserId);
  const opponentOptions = [
    ...new Map(
      allBattles.map((b) => {
        const opp = b.participants.find(
          (p) => p.trader.user.id !== demoUserId,
        )!;
        return [opp.trader.user.id, opp.trader.user.displayName] as const;
      }),
    ),
  ]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Validate params.
  const result =
    params.result === "WIN" || params.result === "LOSS"
      ? params.result
      : undefined;
  const market = MARKETS.includes(params.market as Market)
    ? (params.market as Market)
    : undefined;
  const battleType = BATTLE_TYPES.includes(params.battleType as BattleType)
    ? (params.battleType as BattleType)
    : undefined;
  const battleWindow = BATTLE_WINDOWS.includes(
    params.battleWindow as BattleWindow,
  )
    ? (params.battleWindow as BattleWindow)
    : undefined;
  const opponentUserId = opponentOptions.some((o) => o.value === params.opponent)
    ? params.opponent
    : undefined;
  const from = params.from || undefined;
  const to = params.to || undefined;

  const filter: BattleHistoryFilter = {
    result,
    market,
    battleType,
    battleWindow,
    opponentUserId,
    from,
    to,
  };
  const rows = await battles.listForUser(demoUserId, filter);

  // Summary strip — tally already-stored results (no scoring math).
  const wins = rows.filter((b) => b.battle.winnerId === demoUserId).length;
  const losses = rows.length - wins;
  const winRate = rows.length > 0 ? wins / rows.length : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Match history
            </h1>
            {isSeededTrader ? (
              <Badge variant="outline" className="text-muted-foreground">
                Simulated Demo Data
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Every battle {trader.user.displayName} has completed this
            season. Open any battle for the full review.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatPill label="Battles" value={String(rows.length)} />
          <StatPill label="Record" value={`${wins}–${losses}`} />
          <StatPill
            label="Win rate"
            value={rows.length > 0 ? formatWinRate(winRate) : "—"}
          />
        </div>
      </header>

      <QueryFilters
        fields={[
          {
            paramKey: "result",
            label: "Result",
            options: [
              { value: "WIN", label: "Wins" },
              { value: "LOSS", label: "Losses" },
            ],
            allLabel: "All results",
          },
          {
            paramKey: "market",
            label: "Market",
            options: MARKETS.map((m) => ({ value: m, label: m })),
            allLabel: "All markets",
          },
          {
            paramKey: "battleType",
            label: "Type",
            options: BATTLE_TYPES.map((t) => ({
              value: t,
              label: BATTLE_TYPE_LABELS[t].replace(" Battle", ""),
            })),
            allLabel: "All types",
          },
          {
            paramKey: "battleWindow",
            label: "Window",
            options: BATTLE_WINDOWS.map((w) => ({
              value: w,
              label: BATTLE_WINDOW_LABELS[w].split(" · ")[0],
            })),
            allLabel: "All windows",
          },
          {
            paramKey: "opponent",
            label: "Opponent",
            options: opponentOptions,
            allLabel: "All opponents",
          },
        ]}
        dateRange={{ fromKey: "from", toKey: "to", label: "Date" }}
      />

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        {rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {allBattles.length === 0
              ? "No battles yet. Once you compete, every battle lands here with its full review."
              : "No battles match these filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Opponent</th>
                  <th className="px-4 py-2 font-medium">Market</th>
                  <th className="px-4 py-2 text-center font-medium">Result</th>
                  <th className="px-4 py-2 text-right font-medium">Score</th>
                  <th className="px-4 py-2 text-right font-medium">Rating</th>
                  <th className="px-4 py-2 text-right font-medium">Review</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((summary) => {
                  const [a, b] = summary.participants;
                  const self = a.trader.user.id === demoUserId ? a : b;
                  const opp = a.trader.user.id === demoUserId ? b : a;
                  const won = self.participant.result === "WIN";
                  return (
                    <tr
                      key={summary.battle.id}
                      className="border-b border-border/40 transition-colors last:border-0 hover:bg-secondary/30"
                    >
                      <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatDate(summary.battle.scheduledStart)}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/profile/${opp.trader.user.id}`}
                          className="flex items-center gap-2.5"
                        >
                          <TraderAvatar
                            displayName={opp.trader.user.displayName}
                            accent="opponent"
                            size="sm"
                          />
                          <span className="font-medium underline-offset-2 hover:text-primary hover:underline">
                            {opp.trader.user.displayName}
                          </span>
                          <LeagueBadge
                            league={opp.trader.profile.league}
                            division={opp.trader.profile.division}
                          />
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {summary.battle.market}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={cn(
                            "inline-block w-12 rounded-sm border px-1 py-0.5 text-[11px] font-semibold",
                            won
                              ? "border-positive/30 text-positive"
                              : "border-negative/30 text-negative",
                          )}
                        >
                          {won ? "Win" : "Loss"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {formatScore(self.participant.finalScore)}
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          – {formatScore(opp.participant.finalScore)}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 text-right font-medium tabular-nums",
                          self.ratingChange > 0
                            ? "text-positive"
                            : self.ratingChange < 0
                              ? "text-negative"
                              : "text-muted-foreground",
                        )}
                      >
                        {formatRatingDelta(self.ratingChange)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/battle/review?battle=${summary.battle.id}`}>
                            Review
                          </Link>
                        </Button>
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
