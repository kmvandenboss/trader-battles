import type { Metadata } from "next";
import { LiveBattleScreen } from "@/components/battle/live-battle-screen";
import { DEFAULT_SCENARIO_ID, isScenarioId } from "@/lib/battles/scenarios";

export const metadata: Metadata = {
  title: "Live Battle",
  description:
    "Head-to-head live battle — normalized battle scores, intraday chart, event feed, and commentary. Simulated demo data.",
};

interface BattlePageProps {
  /** `?scenario=` comes from the matchmaking hand-off; invalid values fall back. */
  searchParams: Promise<{ scenario?: string | string[] }>;
}

export default async function BattlePage({ searchParams }: BattlePageProps) {
  const { scenario } = await searchParams;
  const requested = Array.isArray(scenario) ? scenario[0] : scenario;
  const scenarioId =
    requested !== undefined && isScenarioId(requested)
      ? requested
      : DEFAULT_SCENARIO_ID;
  // Key by scenario so client-side navigation to a different scenario remounts.
  return <LiveBattleScreen key={scenarioId} initialScenarioId={scenarioId} />;
}
