"use client";

/**
 * Primary navigation shell. Sticky top bar: wordmark, section links with
 * active state, and the current-user chip (session trader, or the demo
 * fallback with a subtle hint + sign-in affordance). Identity is resolved
 * server-side through the lib/auth seam and passed in as a plain prop —
 * this component never touches the session or repositories. Links collapse
 * to a horizontally scrollable row on small screens.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { signOutAction } from "@/lib/auth/actions";
import {
  NotificationsMenu,
  type HeaderNotification,
} from "@/components/layout/notifications-menu";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The current user (session trader or demo fallback), resolved server-side. */
export interface HeaderUser {
  displayName: string;
  /** e.g. "Gold II · 1,684" — already-formatted league + rating. */
  subtitle: string;
  /** Avatar initials, e.g. "KV". */
  initials: string;
  /** True when a session exists — shows the sign-out control. */
  isAuthenticated: boolean;
  /** True when the chip shows the seeded demo trader, not a signed-in user. */
  isDemoFallback: boolean;
}

interface SiteHeaderProps {
  notifications: HeaderNotification[];
  unreadCount: number;
  user: HeaderUser;
}

export function SiteHeader({
  notifications,
  unreadCount,
  user,
}: SiteHeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 py-3 text-sm font-semibold tracking-wide"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Swords className="size-4" aria-hidden />
          </span>
          <span className="uppercase">
            Trader <span className="text-primary">Battles</span>
          </span>
        </Link>

        <nav
          aria-label="Primary"
          className="scrollbar-none -mb-px flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto"
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3.5 text-sm transition-colors",
                  active
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                {item.comingSoon ? (
                  <span className="rounded-sm border border-border px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                    Soon
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2.5 py-2">
          <NotificationsMenu
            notifications={notifications}
            unreadCount={unreadCount}
          />
          <Link
            href="/profile"
            className="flex items-center gap-2.5 rounded-full transition-opacity hover:opacity-80"
          >
            <div className="hidden text-right leading-tight md:block">
              <p className="text-sm font-medium">
                {user.displayName}
                {user.isDemoFallback ? (
                  <span className="ml-1.5 rounded-sm border border-border px-1 py-px text-[10px] font-normal tracking-wide text-muted-foreground uppercase">
                    Demo user
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">{user.subtitle}</p>
            </div>
            <span
              aria-hidden
              className="flex size-8 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-xs font-semibold text-primary"
            >
              {user.initials}
            </span>
          </Link>
          {user.isAuthenticated ? (
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          ) : (
            <Link
              href="/signin"
              className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
