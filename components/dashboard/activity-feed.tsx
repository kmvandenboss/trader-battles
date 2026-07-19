/**
 * ActivityFeed — a merged, most-recent-first stream of the demo user's
 * notifications and platform-wide completed battles for the dashboard.
 *
 * Pure presentation: items are read server-side through the repositories
 * (notifications + recent battles) and handed down already sorted. Nothing is
 * computed here.
 */

import Link from "next/link";
import {
  Bell,
  ChevronRight,
  Crown,
  Flame,
  Medal,
  Swords,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Market, NotificationType } from "@/lib/data/schema";
import { formatDateTime } from "@/components/battle/format";

export interface NotificationActivity {
  kind: "notification";
  id: string;
  iso: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
}

export interface BattleActivity {
  kind: "battle";
  id: string;
  iso: string;
  winner: string;
  loser: string;
  market: Market;
}

export type ActivityItem = NotificationActivity | BattleActivity;

const NOTIFICATION_ICON: Record<NotificationType, typeof Bell> = {
  MATCH_FOUND: Swords,
  OPPONENT_QUEUED: Swords,
  BATTLE_STARTING: Swords,
  BATTLE_RESULT: Trophy,
  RATING_INCREASED: TrendingUp,
  LEAGUE_PROMOTION: Crown,
  RIVAL_PASSED: Flame,
  NEW_CHALLENGE: Bell,
};

function ActivityRow({ item }: { item: ActivityItem }) {
  if (item.kind === "battle") {
    return (
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-secondary/40 text-muted-foreground"
        >
          <Medal className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-medium">{item.winner}</span>
            <span className="text-muted-foreground"> beat </span>
            <span className="font-medium">{item.loser}</span>
            <span className="text-muted-foreground"> · {item.market}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            {formatDateTime(item.iso)} ET
          </p>
        </div>
      </div>
    );
  }

  const Icon = NOTIFICATION_ICON[item.type];
  const inner = (
    <div className="flex items-start gap-3 px-4 py-3">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border",
          item.read
            ? "border-border/60 bg-secondary/40 text-muted-foreground"
            : "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {item.title}
          {!item.read ? (
            <span
              aria-label="Unread"
              className="size-1.5 rounded-full bg-primary"
            />
          ) : null}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {item.body}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {formatDateTime(item.iso)} ET
        </p>
      </div>
      {item.href ? (
        <ChevronRight
          className="mt-1 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      ) : null}
    </div>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className="block transition-colors hover:bg-secondary/40"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}

interface ActivityFeedProps {
  items: ActivityItem[];
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Recent activity</h2>
        <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
          Simulated
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {items.map((item) => (
          <ActivityRow key={`${item.kind}-${item.id}`} item={item} />
        ))}
      </div>
    </div>
  );
}
