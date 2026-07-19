import type { Metadata } from "next";
import { LiveBattleScreen } from "@/components/battle/live-battle-screen";

export const metadata: Metadata = {
  title: "Live Battle",
  description:
    "Head-to-head live battle — normalized battle scores, intraday chart, event feed, and commentary. Simulated demo data.",
};

export default function BattlePage() {
  return <LiveBattleScreen />;
}
