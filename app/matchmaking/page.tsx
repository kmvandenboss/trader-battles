/**
 * /matchmaking — Find a Battle.
 *
 * Server component: reads trader profiles for the demo user and every
 * demo-queue candidate through the repositories, asks the matchmaking engine
 * which markets are matchable, and reads the scripted battle opponent's
 * identity from the mock provider's participant roster. The client flow
 * (MatchmakingFlow) then plays back an engine-precomputed MatchmakingPlan —
 * no matchmaking logic in the UI.
 */

import type { Metadata } from "next";
import {
  DEMO_RATING_STAGES,
  getDemoQueue,
  searchForOpponent,
} from "@/lib/battles/matchmaking";
// The scripted-battle participant roster, same source lib/battles/scenarios
// consumes. Identity metadata only — no engine/scoring code runs here.
import { OPPONENT_PARTICIPANT } from "@/lib/integrations/providers/mock/mockEventGenerator";
import { getRepositories } from "@/lib/data/repositories";
import { MARKETS, type Market } from "@/lib/data/schema";
import { MatchmakingFlow } from "@/components/matchmaking/matchmaking-flow";
import type { MatchmakingTraderCard } from "@/components/matchmaking/types";

export const metadata: Metadata = {
  title: "Find a Battle",
  description:
    "Queue for a 1-on-1 battle against a trader near your rating — market, session window, and simulated account rules. Simulated demo data.",
};

/** Assemble the serializable profile card for one trader via repositories. */
async function buildTraderCard(
  userId: string,
): Promise<MatchmakingTraderCard | null> {
  const { traders } = getRepositories();
  const trader = await traders.getById(userId);
  if (!trader) return null;
  const accounts = await traders.getAccounts(userId);
  return {
    userId: trader.user.id,
    displayName: trader.user.displayName,
    rating: trader.profile.rating,
    league: trader.profile.league,
    division: trader.profile.division,
    firmName: trader.firm.name,
    accountLabel: accounts[0]?.metadata.planName ?? null,
    battleStyle: trader.profile.battleStyle,
    primaryMarket: trader.profile.primaryMarket,
    secondaryMarkets: trader.profile.secondaryMarkets,
    seasonWins: trader.profile.seasonWins,
    seasonLosses: trader.profile.seasonLosses,
    currentStreak: trader.profile.currentStreak,
    disciplineScore: trader.profile.disciplineScore,
    riskScore: trader.profile.riskScore,
    performanceScore: trader.profile.performanceScore,
  };
}

export default async function MatchmakingPage() {
  const { traders } = getRepositories();
  const demoTrader = await traders.getDemoTrader();
  const demoCard = await buildTraderCard(demoTrader.user.id);
  if (!demoCard) throw new Error("matchmaking: demo trader profile missing");

  // Profile cards for everyone in the engine's demo queue.
  const queue = getDemoQueue();
  const queueTraders: Record<string, MatchmakingTraderCard> = {};
  for (const candidate of queue) {
    const card = await buildTraderCard(candidate.userId);
    if (card) queueTraders[card.userId] = card;
  }

  // Engine-computed matchability per market (probe well past the final
  // rating-window stage so the answer reflects the widest search).
  const probeElapsedMs = 600_000;
  const marketAvailability = Object.fromEntries(
    MARKETS.map((market) => [
      market,
      searchForOpponent(
        {
          userId: demoCard.userId,
          rating: demoCard.rating,
          market,
          battleWindow: "OPENING_BELL",
          battleType: "LIVE_PERFORMANCE",
        },
        probeElapsedMs,
        queue,
        DEMO_RATING_STAGES,
      ).state === "MATCHED",
    ]),
  ) as Record<Market, boolean>;

  return (
    <MatchmakingFlow
      demo={demoCard}
      queueTraders={queueTraders}
      marketAvailability={marketAvailability}
      scriptedOpponentUserId={OPPONENT_PARTICIPANT.userId}
      scriptedOpponentName={OPPONENT_PARTICIPANT.displayName}
    />
  );
}
