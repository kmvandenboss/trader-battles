"use client";

/**
 * Battle-end overlay — winner, final scores, component breakdown, rating
 * changes, and the engine's "why you won / lost" reasons. Everything shown
 * comes from `finalResult` (scores from lib/scoring, rating movement from
 * lib/ratings, both computed inside the engine).
 */

import Link from "next/link";
import { Trophy, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  BattleFinalResult,
  BattleParticipantResult,
} from "@/lib/battles/battleEngine";
import { TraderAvatar, type TraderAccent } from "./trader-avatar";
import {
  formatRatingDelta,
  formatSignedUsd,
  formatUsd,
} from "./format";

const COMPONENT_ROWS = [
  { key: "performance", label: "Performance" },
  { key: "riskEfficiency", label: "Risk efficiency" },
  { key: "discipline", label: "Discipline" },
  { key: "consistency", label: "Consistency" },
] as const;

function ratingTone(change: number): string {
  if (change > 0) return "text-positive";
  if (change < 0) return "text-negative";
  return "text-foreground";
}

function FinalSide({
  result,
  accent,
  won,
}: {
  result: BattleParticipantResult;
  accent: TraderAccent;
  won: boolean;
}) {
  return (
    <div
      className={cn(
        "flex-1 rounded-lg border p-3 text-center",
        won ? "border-primary/50 bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-center justify-center gap-2">
        <TraderAvatar displayName={result.displayName} accent={accent} size="sm" />
        <p className="text-sm font-semibold">{result.displayName}</p>
        {won ? (
          <Trophy className="size-3.5 text-primary" aria-hidden />
        ) : null}
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
        {result.finalScore.total.toFixed(1)}
      </p>
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
        Final score · {result.result}
      </p>
      <p className={cn("mt-1 text-sm font-semibold tabular-nums", ratingTone(result.ratingChange.change))}>
        {formatRatingDelta(result.ratingChange.change)} rating
        <span className="ml-1 font-normal text-muted-foreground">
          → {result.ratingChange.newRating.toLocaleString("en-US")}
        </span>
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
        {formatSignedUsd(result.netPnl)} net ·{" "}
        {formatUsd(result.maxDrawdown)} max DD · {result.tradeCount} trades
      </p>
    </div>
  );
}

interface BattleEndOverlayProps {
  finalResult: BattleFinalResult;
  demoUserId: string;
  onClose: () => void;
}

export function BattleEndOverlay({
  finalResult,
  demoUserId,
  onClose,
}: BattleEndOverlayProps) {
  const [first, second] = finalResult.participants;
  const demoResult = first.userId === demoUserId ? first : second;
  const opponentResult = first.userId === demoUserId ? second : first;
  const accentFor = (r: BattleParticipantResult): TraderAccent =>
    r.userId === demoUserId ? "demo" : "opponent";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Battle result"
      className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-5 shadow-2xl shadow-black/50 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Badge variant="outline" className="text-muted-foreground">
              Final · Simulated Demo Data
            </Badge>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">
              {finalResult.headline}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {finalResult.leadChanges}{" "}
              {finalResult.leadChanges === 1 ? "lead change" : "lead changes"}{" "}
              · Battle {finalResult.battleId}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Close result overlay"
          >
            <X aria-hidden />
          </Button>
        </div>

        {/* Finals */}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <FinalSide
            result={demoResult}
            accent={accentFor(demoResult)}
            won={demoResult.result === "WIN"}
          />
          <FinalSide
            result={opponentResult}
            accent={accentFor(opponentResult)}
            won={opponentResult.result === "WIN"}
          />
        </div>

        {/* Component breakdown */}
        <div className="mt-4 rounded-lg border border-border/60 bg-secondary/30 p-3">
          <p className="mb-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Component breakdown
          </p>
          <div className="space-y-1.5">
            {COMPONENT_ROWS.map(({ key, label }) => {
              const demoValue = demoResult.finalScore.components[key].score;
              const oppValue = opponentResult.finalScore.components[key].score;
              return (
                <div
                  key={key}
                  className="grid grid-cols-[3.5rem_1fr_6.5rem_1fr_3.5rem] items-center gap-2 text-xs"
                >
                  <span
                    className={cn(
                      "text-right font-medium tabular-nums",
                      demoValue >= oppValue
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {demoValue.toFixed(1)}
                  </span>
                  <div className="flex h-1.5 justify-end overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, demoValue)}%`,
                        backgroundColor: "var(--chart-1)",
                      }}
                    />
                  </div>
                  <span className="text-center text-[11px] text-muted-foreground">
                    {label}
                  </span>
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, oppValue)}%`,
                        backgroundColor: "var(--chart-2)",
                      }}
                    />
                  </div>
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      oppValue > demoValue
                        ? "text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {oppValue.toFixed(1)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Why you won / lost */}
        <div className="mt-4">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Why {demoResult.displayName}{" "}
            {demoResult.result === "WIN"
              ? "won"
              : demoResult.result === "LOSS"
                ? "lost"
                : "drew"}
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-foreground/90">
            {demoResult.reasons.map((reason) => (
              <li key={reason} className="flex gap-2">
                <span aria-hidden className="text-primary">
                  •
                </span>
                <span className="tabular-nums">{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link href="/battle/result">View full result</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/battle/review">Full review</Link>
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Review final board
          </Button>
        </div>
      </div>
    </div>
  );
}
