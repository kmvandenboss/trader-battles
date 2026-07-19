"use client";

/**
 * OpponentReveal — the match-found moment. A brief, tasteful card animation
 * for the opponent the matchmaking engine selected, then an automatic (or
 * manual) hand-off into the head-to-head comparison. Pure presentation.
 */

import { useEffect } from "react";
import { ArrowRight, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BATTLE_STYLE_LABELS,
  marketTicker,
} from "@/components/battle/format";
import { LeagueBadge } from "@/components/battle/league-badge";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import type { MatchmakingTraderCard } from "./types";

/** Fixed hold before auto-advancing to the head-to-head (deterministic). */
const AUTO_CONTINUE_MS = 2_600;

interface OpponentRevealProps {
  opponent: MatchmakingTraderCard;
  onContinue: () => void;
}

export function OpponentReveal({ opponent, onContinue }: OpponentRevealProps) {
  useEffect(() => {
    const id = window.setTimeout(onContinue, AUTO_CONTINUE_MS);
    return () => window.clearTimeout(id);
  }, [onContinue]);

  return (
    <section className="rounded-xl border border-border bg-card px-5 py-12 sm:px-8">
      <div className="animate-in fade-in zoom-in-95 mx-auto flex max-w-md flex-col items-center text-center duration-500">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-widest text-primary uppercase">
          <Swords className="size-3.5" aria-hidden />
          Opponent found
        </span>

        <TraderAvatar
          displayName={opponent.displayName}
          accent="opponent"
          size="lg"
          className="mt-5 size-16 text-base"
        />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {opponent.displayName}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <LeagueBadge league={opponent.league} division={opponent.division} />
          <span className="text-sm text-muted-foreground tabular-nums">
            Rating {opponent.rating.toLocaleString("en-US")}
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {opponent.firmName}
          {opponent.accountLabel ? ` · ${opponent.accountLabel}` : ""} ·{" "}
          {BATTLE_STYLE_LABELS[opponent.battleStyle]} ·{" "}
          {marketTicker(opponent.primaryMarket)} primary
        </p>

        <Badge variant="outline" className="mt-4 text-[10px] text-muted-foreground">
          Simulated Demo Data
        </Badge>

        <Button size="sm" variant="outline" className="mt-6" onClick={onContinue}>
          View matchup
          <ArrowRight data-icon="inline-end" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
