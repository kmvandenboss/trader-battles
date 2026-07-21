/**
 * /leagues — the Bronze→Elite competitive ladder. Server component reading
 * trader counts and the demo user's placement through the repositories. Rating
 * bands come from the shared lib/data/leagues helper; the only arithmetic here
 * is presentational band math and a progress percentage over provided bands —
 * no ratings/scores are computed in the UI.
 */

import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { getRepositories } from "@/lib/data/repositories";
import { getCurrentTrader } from "@/lib/auth/currentUser";
import { LEAGUES, type League } from "@/lib/data/schema";
import {
  DIVISION_SPAN,
  LEAGUE_FLOORS,
  leagueForRating,
} from "@/lib/data/leagues";
import { LeagueBadge } from "@/components/battle/league-badge";
import { LEAGUE_LABELS, formatLeague } from "@/components/battle/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Leagues",
  description:
    "The Bronze-to-Elite ladder — divisions, rating bands, promotion and demotion, and your placement. Simulated demo data.",
};

const DIVISION_ORDER = ["I", "II", "III"] as const; // top to bottom within a league

function bandLabel(
  floor: number,
  divIndex: number,
  isTopDivisionOpen: boolean,
): string {
  const lo = floor + divIndex * DIVISION_SPAN;
  if (isTopDivisionOpen) return `${lo.toLocaleString("en-US")}+`;
  const hi = lo + DIVISION_SPAN - 1;
  return `${lo.toLocaleString("en-US")}–${hi.toLocaleString("en-US")}`;
}

export default async function LeaguesPage() {
  const { traders } = getRepositories();
  const trader = await getCurrentTrader();
  const rating = trader.profile.rating;
  const placement = leagueForRating(rating);

  // Trader population per league (already-stored league assignments).
  const counts = await Promise.all(
    LEAGUES.map(async (l) => [l, (await traders.list({ league: l })).length] as const),
  );
  const countByLeague = new Map<League, number>(counts);

  // Demo user's progress within their current division (presentation math over
  // the provided promotion/demotion bands — not a rating computation).
  const divisionFloor = placement.demotionRating ?? LEAGUE_FLOORS.BRONZE;
  const progressPct = Math.max(
    0,
    Math.min(100, ((rating - divisionFloor) / DIVISION_SPAN) * 100),
  );
  const pointsToPromotion =
    placement.promotionRating !== null
      ? placement.promotionRating - rating
      : null;
  const pointsAboveDemotion =
    placement.demotionRating !== null ? rating - placement.demotionRating : null;

  // Ladder rendered highest league at the top.
  const ladder = [...LEAGUES].reverse();

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Leagues</h1>
          <Badge variant="outline" className="text-muted-foreground">
            Simulated Demo Data
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Six leagues from Bronze to Elite, each split into three divisions
          (III → I). Each league spans 150 rating points; each division 50. Win
          battles to climb; sustained losses can demote. Placement reflects
          competitive rating only.
        </p>
      </header>

      {/* Your placement + progress */}
      <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {trader.user.displayName} — current placement
            </span>
            <LeagueBadge league={placement.league} division={placement.division} />
            <span className="text-sm font-semibold tabular-nums">
              {rating.toLocaleString("en-US")}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {pointsToPromotion !== null ? (
              <span>
                {pointsToPromotion.toLocaleString("en-US")} to promotion
              </span>
            ) : (
              <span>Top division reached</span>
            )}
            {pointsAboveDemotion !== null ? (
              <span>
                {" "}
                · {pointsAboveDemotion.toLocaleString("en-US")} above demotion
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{formatLeague(placement.league, placement.division)}</span>
            {placement.promotionRating !== null ? (
              <span className="tabular-nums">
                {placement.promotionRating.toLocaleString("en-US")}
              </span>
            ) : null}
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={Math.round(progressPct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Division progress toward promotion"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Ladder */}
      <section className="space-y-3">
        {ladder.map((league) => {
          const floor = LEAGUE_FLOORS[league];
          const isCurrentLeague = placement.league === league;
          const population = countByLeague.get(league) ?? 0;
          return (
            <div
              key={league}
              className={cn(
                "rounded-xl border bg-card p-4",
                isCurrentLeague ? "border-primary/40" : "border-border",
              )}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">
                    {LEAGUE_LABELS[league]}
                  </h2>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    floor {floor.toLocaleString("en-US")}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {population} trader{population === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {DIVISION_ORDER.map((division) => {
                  // DIVISION_ORDER is top→bottom; band index is 2,1,0.
                  const divIndex =
                    division === "I" ? 2 : division === "II" ? 1 : 0;
                  const isTopOpen = league === "ELITE" && division === "I";
                  const isCurrent =
                    isCurrentLeague && placement.division === division;
                  return (
                    <div
                      key={division}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-center",
                        isCurrent
                          ? "border-primary/50 bg-primary/10"
                          : "border-border/60 bg-secondary/20",
                      )}
                    >
                      <p className="text-xs font-medium">
                        {LEAGUE_LABELS[league]} {division}
                        {isCurrent ? (
                          <span className="ml-1 text-[10px] font-normal text-primary">
                            (you)
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {bandLabel(floor, divIndex, isTopOpen)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
