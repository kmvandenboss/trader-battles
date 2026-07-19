/**
 * AchievementGrid — badges/achievements display for profile pages.
 *
 * Pure presentation: it renders already-earned achievements (and, optionally,
 * the full catalog with unearned ones greyed out) read through the
 * AchievementRepository. Each achievement's lucide-react icon *name* is
 * resolved to a component here so the domain data stays framework-free.
 */

import {
  Activity,
  AlarmClock,
  Award,
  CheckCircle,
  Flame,
  Medal,
  Shield,
  Sword,
  Swords,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Achievement,
  AchievementCategory,
} from "@/lib/data/schema";
import type { EarnedAchievement } from "@/lib/data/repositories/types";
import { formatDate } from "@/components/battle/format";

/** Resolve a seed icon name to a lucide component (Award is the fallback). */
const ICON_BY_NAME: Record<string, LucideIcon> = {
  trophy: Trophy,
  swords: Swords,
  sword: Sword,
  flame: Flame,
  medal: Medal,
  shield: Shield,
  "alarm-clock": AlarmClock,
  activity: Activity,
  "trending-up": TrendingUp,
  "check-circle": CheckCircle,
};

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  PARTICIPATION: "Participation",
  DISCIPLINE: "Discipline",
  IMPROVEMENT: "Improvement",
  COMPETITIVE_SUCCESS: "Competitive",
  MARKET_SPECIALIZATION: "Specialization",
};

interface AchievementGridProps {
  earned: EarnedAchievement[];
  /** When provided, unearned catalog entries render locked/greyed. */
  catalog?: Achievement[];
}

export function AchievementGrid({ earned, catalog }: AchievementGridProps) {
  const earnedById = new Map(earned.map((e) => [e.achievement.id, e]));
  const items: Array<{ achievement: Achievement; earnedAt: string | null }> =
    catalog
      ? catalog.map((achievement) => ({
          achievement,
          earnedAt: earnedById.get(achievement.id)?.earnedAt ?? null,
        }))
      : earned.map((e) => ({ achievement: e.achievement, earnedAt: e.earnedAt }));

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No achievements earned yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {items.map(({ achievement, earnedAt }) => {
        const Icon = ICON_BY_NAME[achievement.icon] ?? Award;
        const unlocked = earnedAt !== null;
        return (
          <div
            key={achievement.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3",
              unlocked
                ? "border-border bg-card"
                : "border-border/50 bg-secondary/20 opacity-60",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border",
                unlocked
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-secondary/40 text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">
                  {achievement.name}
                </p>
                <span className="shrink-0 rounded-sm border border-border/60 px-1 py-px text-[10px] tracking-wide text-muted-foreground uppercase">
                  {CATEGORY_LABELS[achievement.category]}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {achievement.description}
              </p>
              <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                {unlocked ? `Earned ${formatDate(earnedAt)}` : "Locked"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
