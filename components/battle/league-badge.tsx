/**
 * LeagueBadge — compact league + division chip (e.g. "Gold II").
 *
 * Pure presentation of seed/engine-provided league placement. One restrained
 * tint per league; reused across matchmaking, profiles, and leaderboards.
 */

import type { Division, League } from "@/lib/data/schema";
import { cn } from "@/lib/utils";
import { formatLeague } from "./format";

const LEAGUE_CLASSES: Record<League, string> = {
  BRONZE: "border-orange-400/30 bg-orange-400/10 text-orange-300",
  SILVER: "border-slate-300/30 bg-slate-300/10 text-slate-300",
  GOLD: "border-primary/40 bg-primary/10 text-primary",
  PLATINUM: "border-cyan-300/30 bg-cyan-300/10 text-cyan-200",
  DIAMOND: "border-sky-300/30 bg-sky-300/10 text-sky-300",
  ELITE: "border-violet-300/30 bg-violet-300/10 text-violet-300",
};

interface LeagueBadgeProps {
  league: League;
  division: Division;
  className?: string;
}

export function LeagueBadge({ league, division, className }: LeagueBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center rounded-sm border px-1.5 text-[11px] font-semibold tracking-wide whitespace-nowrap",
        LEAGUE_CLASSES[league],
        className,
      )}
    >
      {formatLeague(league, division)}
    </span>
  );
}
