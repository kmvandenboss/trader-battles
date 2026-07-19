"use client";

/**
 * NotificationsMenu — the header bell + unread badge + dropdown. Data is fetched
 * server-side in the root layout (repositories are server-only) and passed down
 * as a plain serializable list, so this client component never touches a
 * repository. Radix Popover gives keyboard dismissal + focus management.
 */

import Link from "next/link";
import { Popover } from "radix-ui";
import {
  Bell,
  Crown,
  Flame,
  Swords,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "@/lib/data/schema";
import { formatDateTime } from "@/components/battle/format";
import { cn } from "@/lib/utils";

export interface HeaderNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

const NOTIFICATION_ICON: Record<NotificationType, LucideIcon> = {
  MATCH_FOUND: Swords,
  OPPONENT_QUEUED: Swords,
  BATTLE_STARTING: Swords,
  BATTLE_RESULT: Trophy,
  RATING_INCREASED: TrendingUp,
  LEAGUE_PROMOTION: Crown,
  RIVAL_PASSED: Flame,
  NEW_CHALLENGE: Bell,
};

function NotificationBody({ item }: { item: HeaderNotification }) {
  const Icon = NOTIFICATION_ICON[item.type];
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
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
          <span className="truncate">{item.title}</span>
          {!item.read ? (
            <span
              aria-label="Unread"
              className="size-1.5 shrink-0 rounded-full bg-primary"
            />
          ) : null}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{item.body}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
          {formatDateTime(item.createdAt)} ET
        </p>
      </div>
    </div>
  );
}

interface NotificationsMenuProps {
  notifications: HeaderNotification[];
  unreadCount: number;
}

export function NotificationsMenu({
  notifications,
  unreadCount,
}: NotificationsMenuProps) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          className="relative flex size-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none aria-expanded:bg-muted aria-expanded:text-foreground"
        >
          <Bell className="size-4" aria-hidden />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums">
              {unreadCount}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
              {unreadCount > 0 ? `${unreadCount} unread` : "All read"}
            </span>
          </div>
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No notifications.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-border/40 overflow-y-auto">
              {notifications.map((item) => (
                <li key={item.id}>
                  {item.href ? (
                    <Popover.Close asChild>
                      <Link
                        href={item.href}
                        className="block transition-colors hover:bg-secondary/40"
                      >
                        <NotificationBody item={item} />
                      </Link>
                    </Popover.Close>
                  ) : (
                    <NotificationBody item={item} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
