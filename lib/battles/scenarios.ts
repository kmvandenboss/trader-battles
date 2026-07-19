/**
 * scenarios — the Demo Controls scenario registry.
 *
 * Presenter-facing metadata for the three deterministic demo scenarios
 * required by the product brief. The actual activity scripts live with the
 * mock provider (lib/integrations/providers/mock/scenarioDefinitions.ts) —
 * this registry is what the Demo Controls dropdown and the battle runner
 * consume to list and select them.
 */

import {
  MOCK_SCENARIOS,
  SCENARIO_IDS,
  isScenarioId,
  type ScenarioId,
} from "@/lib/integrations/providers/mock/scenarioDefinitions";
import {
  DEMO_PARTICIPANT,
  OPPONENT_PARTICIPANT,
} from "@/lib/integrations/providers/mock/mockEventGenerator";

export type { ScenarioId };
export { SCENARIO_IDS, isScenarioId };

export interface ScenarioListing {
  id: ScenarioId;
  title: string;
  description: string;
  /** PRNG seed the scenario replays from (shown in Demo Controls). */
  seed: number;
  expectedWinnerUserId: string;
  expectedWinnerName: string;
}

export const DEFAULT_SCENARIO_ID: ScenarioId = "discipline-beats-raw-profit";

export const SCENARIOS: ScenarioListing[] = SCENARIO_IDS.map((id) => {
  const def = MOCK_SCENARIOS[id];
  const winner =
    def.expectedWinner === "demo" ? DEMO_PARTICIPANT : OPPONENT_PARTICIPANT;
  return {
    id,
    title: def.title,
    description: def.description,
    seed: def.seed,
    expectedWinnerUserId: winner.userId,
    expectedWinnerName: winner.displayName,
  };
});

export function getScenarioListing(id: ScenarioId): ScenarioListing {
  const listing = SCENARIOS.find((scenario) => scenario.id === id);
  if (!listing) throw new Error(`unknown scenario "${id}"`);
  return listing;
}
