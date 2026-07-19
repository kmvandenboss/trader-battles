"use client";

/**
 * MatchmakingFlow — the client state machine for Find a Battle:
 * config → searching → opponent reveal → head-to-head → /battle hand-off.
 *
 * On "Find a Battle" it asks the matchmaking engine for a complete
 * MatchmakingPlan ONCE (deterministic: ticks, window expansions, opponent)
 * and every later phase is pure playback of that plan. Profile data for the
 * head-to-head arrives pre-fetched from the server page via repositories.
 */

import { useCallback, useState } from "react";
import {
  DEMO_RATING_STAGES,
  createMatchmakingPlan,
  type MatchmakingPlan,
} from "@/lib/battles/matchmaking";
import type { Market } from "@/lib/data/schema";
import { ConfigPanel } from "./config-panel";
import { HeadToHead } from "./head-to-head";
import { OpponentReveal } from "./opponent-reveal";
import { SearchingPanel } from "./searching-panel";
import {
  DEFAULT_BATTLE_CONFIG,
  type BattleConfig,
  type MatchmakingTraderCard,
} from "./types";

type Phase = "config" | "searching" | "reveal" | "matchup";

interface MatchmakingFlowProps {
  demo: MatchmakingTraderCard;
  /** Profile cards for every demo-queue trader, keyed by userId. */
  queueTraders: Record<string, MatchmakingTraderCard>;
  /** Engine-computed per-market matchability for the demo queue. */
  marketAvailability: Record<Market, boolean>;
  /** The battle engine's scripted opponent — the only playable matchup. */
  scriptedOpponentUserId: string;
  scriptedOpponentName: string;
}

export function MatchmakingFlow({
  demo,
  queueTraders,
  marketAvailability,
  scriptedOpponentUserId,
  scriptedOpponentName,
}: MatchmakingFlowProps) {
  const [phase, setPhase] = useState<Phase>("config");
  const [config, setConfig] = useState<BattleConfig>(DEFAULT_BATTLE_CONFIG);
  const [plan, setPlan] = useState<MatchmakingPlan | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const beginSearch = useCallback(() => {
    try {
      // Engine call — the whole search (ticks + opponent) is precomputed here.
      const nextPlan = createMatchmakingPlan(
        {
          userId: demo.userId,
          rating: demo.rating,
          market: config.market,
          battleWindow: config.battleWindow,
          battleType: config.battleType,
        },
        undefined,
        DEMO_RATING_STAGES,
      );
      setSearchError(null);
      setPlan(nextPlan);
      setPhase("searching");
    } catch {
      // Unmatchable markets are disabled in the config panel, so this only
      // guards against queue-authoring drift; surface it instead of failing
      // silently.
      setPlan(null);
      setPhase("config");
      setSearchError("No opponents available for this configuration.");
    }
  }, [demo.userId, demo.rating, config]);

  const cancelSearch = useCallback(() => {
    setPlan(null);
    setPhase("config");
  }, []);

  const changeConfig = useCallback((next: BattleConfig) => {
    setSearchError(null);
    setConfig(next);
  }, []);

  const showReveal = useCallback(() => setPhase("reveal"), []);
  const showMatchup = useCallback(() => setPhase("matchup"), []);

  const opponentCard =
    plan !== null ? (queueTraders[plan.opponent.userId] ?? null) : null;

  if (phase === "searching" && plan) {
    return (
      <SearchingPanel
        plan={plan}
        demo={demo}
        onCancel={cancelSearch}
        onMatched={showReveal}
      />
    );
  }

  if (phase === "reveal" && plan && opponentCard) {
    return <OpponentReveal opponent={opponentCard} onContinue={showMatchup} />;
  }

  if (phase === "matchup" && plan && opponentCard) {
    // Playable only when BOTH the opponent and the queued market match the
    // scripted demo battle (an MNQ queue can also resolve to the scripted
    // rival, but the battle scripts run his NQ Opening Bell session).
    const battlePlayable =
      plan.opponent.userId === scriptedOpponentUserId &&
      plan.request.market === "NQ";
    return (
      <HeadToHead
        demo={demo}
        opponent={opponentCard}
        battlePlayable={battlePlayable}
        scriptedRivalName={scriptedOpponentName}
        onNewSearch={cancelSearch}
      />
    );
  }

  return (
    <ConfigPanel
      demo={demo}
      marketAvailability={marketAvailability}
      config={config}
      errorMessage={searchError}
      onChange={changeConfig}
      onSearch={beginSearch}
    />
  );
}
