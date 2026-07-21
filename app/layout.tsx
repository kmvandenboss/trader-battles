import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DemoNotice } from "@/components/layout/demo-notice";
import { SiteHeader, type HeaderUser } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { getRepositories } from "@/lib/data/repositories";
import { getCurrentIdentity } from "@/lib/auth/currentUser";
import type { HeaderNotification } from "@/components/layout/notifications-menu";
import { formatLeague, initialsFor } from "@/components/battle/format";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Trader Battles",
    template: "%s · Trader Battles",
  },
  description:
    "Competitive 1-on-1 battles for futures traders, scored on normalized performance. Interactive concept demo — all data is simulated.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Identity resolves through the lib/auth seam (session trader, or the
  // seeded demo fallback when unauthenticated / no database). Notifications
  // are read server-side (repositories are server-only) and handed to the
  // client header as a plain serializable list.
  const { notifications } = getRepositories();
  const { trader, isAuthenticated, isDemoFallback } =
    await getCurrentIdentity();
  const notes = await notifications.listForUser(trader.user.id);
  const unreadCount = await notifications.countUnread(trader.user.id);
  const headerNotifications: HeaderNotification[] = notes.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    href: n.href,
    read: n.read,
    createdAt: n.createdAt,
  }));
  const headerUser: HeaderUser = {
    displayName: trader.user.displayName,
    subtitle: `${formatLeague(trader.profile.league, trader.profile.division)} · ${trader.profile.rating.toLocaleString("en-US")}`,
    initials: initialsFor(trader.user.displayName),
    isAuthenticated,
    isDemoFallback,
  };

  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-svh flex-col bg-background text-foreground">
        <DemoNotice />
        <SiteHeader
          notifications={headerNotifications}
          unreadCount={unreadCount}
          user={headerUser}
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
