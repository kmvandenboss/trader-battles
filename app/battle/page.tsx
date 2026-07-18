import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export const metadata: Metadata = { title: "Battle" };

export default function BattlePage() {
  return (
    <PagePlaceholder
      title="Battle"
      description="Matchmaking and the live head-to-head battle screen — scorecards, intraday chart, event feed, and commentary."
    />
  );
}
