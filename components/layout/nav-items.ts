export interface NavItem {
  label: string;
  href: string;
  /** Marks routes that exist in the shell but are not built yet. */
  comingSoon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Find a Battle", href: "/matchmaking" },
  { label: "Challenges", href: "/challenges" },
  { label: "Live Battle", href: "/battle" },
  { label: "Leaderboards", href: "/leaderboards" },
  { label: "Match History", href: "/history" },
  { label: "Profile", href: "/profile" },
  { label: "Leagues", href: "/leagues" },
  { label: "Scoring", href: "/scoring" },
  { label: "Integrations", href: "/integrations", comingSoon: true },
];
