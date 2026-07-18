import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Leaderboards" };

export default function LeaderboardsPage() {
  return (
    <PagePlaceholder
      title="Leaderboards"
      description="Global, league, market, and firm rankings across the season."
    />
  );
}
