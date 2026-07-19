/**
 * FinalScorecard — a single participant's end-of-battle card for the standalone
 * result + review screens. Mirrors the battle-end overlay's FinalSide styling.
 *
 * Pure presentation: every value comes from an already-computed ParticipantView
 * (see components/battle/showcase.ts). No score/rating math here.
 */

import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParticipantView } from "./showcase";
import { LeagueBadge } from "./league-badge";
import { TraderAvatar } from "./trader-avatar";
import {
  formatRatingDelta,
  formatScore,
  formatSignedUsd,
  formatUsd,
} from "./format";

function ratingTone(change: number): string {
  if (change > 0) return "text-positive";
  if (change < 0) return "text-negative";
  return "text-foreground";
}

interface FinalScorecardProps {
  participant: ParticipantView;
  /** Slightly larger score type for the hero result screen. */
  emphasis?: boolean;
}

export function FinalScorecard({ participant, emphasis }: FinalScorecardProps) {
  const won = participant.won;
  return (
    <div
      className={cn(
        "flex-1 rounded-xl border p-4 text-center",
        won ? "border-primary/50 bg-primary/5" : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-center gap-2">
        <TraderAvatar
          displayName={participant.displayName}
          accent={participant.accent}
          size="sm"
        />
        <p className="text-sm font-semibold">{participant.displayName}</p>
        {won ? <Trophy className="size-3.5 text-primary" aria-hidden /> : null}
      </div>
      <div className="mt-1 flex items-center justify-center gap-2">
        <LeagueBadge
          league={participant.league}
          division={participant.division}
        />
        <span className="text-[11px] text-muted-foreground">
          {participant.firmName}
        </span>
      </div>
      <p
        className={cn(
          "mt-2 font-semibold tabular-nums tracking-tight",
          emphasis ? "text-5xl" : "text-3xl",
        )}
      >
        {formatScore(participant.finalScore)}
      </p>
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
        Final score · {participant.result}
      </p>
      <p
        className={cn(
          "mt-1.5 text-sm font-semibold tabular-nums",
          ratingTone(participant.ratingChange),
        )}
      >
        {formatRatingDelta(participant.ratingChange)} rating
        <span className="ml-1 font-normal text-muted-foreground">
          → {participant.endingRating.toLocaleString("en-US")}
        </span>
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <p className="tabular-nums font-medium">
            {formatSignedUsd(participant.netPnl)}
          </p>
          <p className="text-muted-foreground">Net P&amp;L</p>
        </div>
        <div>
          <p className="tabular-nums font-medium">
            {formatUsd(participant.maxDrawdown)}
          </p>
          <p className="text-muted-foreground">Max DD</p>
        </div>
        <div>
          <p className="tabular-nums font-medium">{participant.tradeCount}</p>
          <p className="text-muted-foreground">Trades</p>
        </div>
      </div>
    </div>
  );
}
