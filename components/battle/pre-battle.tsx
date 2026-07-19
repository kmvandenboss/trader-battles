"use client";

/**
 * Pre-battle ready state — the matchup card shown before the session starts.
 * Both traders, their accounts and risk limits (engine-provided), and the
 * start action. Rating movement is framed competitively, never financially.
 */

import { Play, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  BattleEngineState,
  BattleParticipantState,
} from "@/lib/battles/battleEngine";
import { TraderAvatar, type TraderAccent } from "./trader-avatar";
import {
  BATTLE_TYPE_LABELS,
  BATTLE_WINDOW_LABELS,
  MARKET_LABELS,
  formatUsd,
} from "./format";

function MatchupSide({
  participant,
  accent,
  align,
}: {
  participant: BattleParticipantState;
  accent: TraderAccent;
  align: "left" | "right";
}) {
  const alignClass = align === "left" ? "items-start text-left" : "items-end text-right";
  return (
    <div className={`flex flex-1 flex-col gap-2 ${alignClass}`}>
      <TraderAvatar
        displayName={participant.displayName}
        accent={accent}
        size="lg"
      />
      <div>
        <p className="text-lg font-semibold">{participant.displayName}</p>
        <p className="text-xs text-muted-foreground">
          {participant.firmName} · {participant.accountLabel}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          Rating {participant.rating.toLocaleString("en-US")}
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground tabular-nums">
        {formatUsd(participant.limits.permittedRisk)} permitted risk · max{" "}
        {participant.limits.maxContracts} contracts
      </p>
    </div>
  );
}

interface PreBattlePanelProps {
  state: BattleEngineState;
  onStart: () => void;
}

export function PreBattlePanel({ state, onStart }: PreBattlePanelProps) {
  const demo = state.participants[state.demoUserId];
  const opponent = state.participants[state.opponentUserId];

  return (
    <section className="rounded-xl border border-border bg-card px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-center gap-2">
          <Badge variant="outline" className="text-muted-foreground">
            Simulated Demo Data
          </Badge>
          <Badge variant="outline" className="border-primary/30 text-primary">
            Match found
          </Badge>
        </div>

        <div className="mt-6 flex items-center gap-4 sm:gap-8">
          <MatchupSide participant={demo} accent="demo" align="left" />
          <div className="flex flex-col items-center gap-1">
            <span className="flex size-10 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
              <Swords className="size-5" aria-hidden />
            </span>
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              vs
            </span>
          </div>
          <MatchupSide participant={opponent} accent="opponent" align="right" />
        </div>

        <div className="mt-6 rounded-lg border border-border/60 bg-secondary/40 px-4 py-3 text-center text-xs text-muted-foreground">
          {BATTLE_TYPE_LABELS[state.battleType]} ·{" "}
          {MARKET_LABELS[state.market]} ·{" "}
          {BATTLE_WINDOW_LABELS[state.battleWindow]}
          <br />
          Scored on normalized performance — performance, risk efficiency,
          discipline, and consistency. Rating movement is applied at the
          final bell.
        </div>

        <div className="mt-6 flex justify-center">
          <Button size="lg" onClick={onStart}>
            <Play data-icon="inline-start" aria-hidden />
            Start battle
          </Button>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Deterministic simulated session — the same scenario replays
          identically every time.
        </p>
      </div>
    </section>
  );
}
