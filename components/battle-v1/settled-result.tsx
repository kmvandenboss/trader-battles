/**
 * SettledPnlResult — the settled PNL_V1 battle presentation for
 * /battles/[id]: winner banner, tiebreaker-cascade explanation, and one
 * breakdown card per participant.
 *
 * Pure presentation (Rule 4): EVERY number here — realized P&L, mark-out
 * P&L, participation bonus, headline score, gross profit/loss, ratings and
 * the rating delta — was computed by the settlement/scoring/rating engines
 * server-side, persisted by BattleRepository.saveSettlement, and read back
 * through the repositories. This module renders repo values verbatim and
 * computes nothing. `resolutionDetail` and `markOutNote` are engine-written
 * strings displayed word-for-word.
 */

import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  BattleResult,
  Division,
  League,
  VerificationStatus,
} from "@/lib/data/schema";
import { LeagueBadge } from "@/components/battle/league-badge";
import { TraderAvatar, type TraderAccent } from "@/components/battle/trader-avatar";
import {
  formatPoints,
  formatRatingDelta,
  formatSignedUsdExact,
  formatUsdExact,
} from "@/components/battle/format";
import { DECIDED_BY_COPY } from "./labels";
import { VerificationChip } from "./verification-chip";

/** One participant's settled values, copied verbatim from the repo rows. */
export interface SettledParticipantView {
  displayName: string;
  league: League;
  division: Division;
  accent: TraderAccent;
  result: BattleResult;
  /** Headline PNL_V1 points (participant.finalScore). */
  finalScore: number;
  realizedPnl: number;
  participationBonus: number;
  closedTradeCount: number;
  grossProfit: number;
  /** Stored POSITIVE (dollars lost). */
  grossLoss: number;
  markOutPnl: number;
  markOutStatus: string | null;
  markOutNote: string | null;
  startingRating: number;
  endingRating: number;
  /** Repo-computed (ParticipantSummary.ratingChange) — not derived here. */
  ratingChange: number;
}

export interface SettledPnlResultProps {
  /** Null on a draw. */
  winnerName: string | null;
  /** battle.decidedBy — the persisted tiebreaker-cascade stage. */
  decidedBy: string | null;
  /** battle.resolutionDetail — engine explanation, rendered verbatim. */
  resolutionDetail: string | null;
  verificationStatus: VerificationStatus;
  participants: [SettledParticipantView, SettledParticipantView];
}

function pnlTone(value: number): string {
  if (value > 0) return "text-positive";
  if (value < 0) return "text-negative";
  return "text-foreground";
}

function ratingTone(change: number): string {
  if (change > 0) return "text-positive";
  if (change < 0) return "text-negative";
  return "text-muted-foreground";
}

function ValueRow({
  label,
  value,
  valueClass,
  hint,
}: {
  label: string;
  value: string;
  valueClass?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {hint ? (
          <p className="text-[10px] leading-snug text-muted-foreground/70">
            {hint}
          </p>
        ) : null}
      </div>
      <p className={cn("shrink-0 text-sm font-semibold tabular-nums", valueClass)}>
        {value}
      </p>
    </div>
  );
}

function ParticipantCard({ p }: { p: SettledParticipantView }) {
  const won = p.result === "WIN";
  return (
    <div
      className={cn(
        "flex-1 rounded-xl border p-4",
        won ? "border-primary/50 bg-primary/5" : "border-border bg-card",
      )}
    >
      <div className="flex items-center gap-2.5">
        <TraderAvatar displayName={p.displayName} accent={p.accent} size="sm" />
        <p className="text-sm font-semibold">{p.displayName}</p>
        {won ? <Trophy className="size-3.5 text-primary" aria-hidden /> : null}
        <LeagueBadge league={p.league} division={p.division} className="ml-auto" />
      </div>

      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
        {formatPoints(p.finalScore)}
      </p>
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
        Final score · {p.result}
      </p>

      <div className="mt-3 divide-y divide-border/40 border-t border-border/40">
        <ValueRow
          label="Realized P&L (in window)"
          value={formatSignedUsdExact(p.realizedPnl)}
          valueClass={pnlTone(p.realizedPnl)}
        />
        {p.markOutStatus && p.markOutStatus !== "NONE" ? (
          <ValueRow
            label={
              p.markOutStatus === "EXCLUDED_NO_MARK"
                ? "Mark-out P&L (excluded — no mark)"
                : "Mark-out P&L (open at the buzzer)"
            }
            value={formatSignedUsdExact(p.markOutPnl)}
            valueClass={pnlTone(p.markOutPnl)}
            hint={p.markOutNote ?? undefined}
          />
        ) : null}
        <ValueRow
          label="Participation bonus"
          value={`+${formatPoints(p.participationBonus)}`}
          hint="+5 per closed trade, capped at +15"
        />
        <ValueRow label="Closed trades" value={String(p.closedTradeCount)} />
        <ValueRow
          label="Gross profit / gross loss"
          value={`${formatUsdExact(p.grossProfit)} / ${formatUsdExact(p.grossLoss)}`}
        />
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <p className="text-xs text-muted-foreground">Rating</p>
          <p className="shrink-0 text-sm tabular-nums">
            <span className="text-muted-foreground">
              {p.startingRating.toLocaleString("en-US")} →{" "}
            </span>
            <span className="font-semibold">
              {p.endingRating.toLocaleString("en-US")}
            </span>
            <span
              className={cn(
                "ml-1.5 rounded-sm border border-border/60 px-1 py-px text-[11px] font-semibold",
                ratingTone(p.ratingChange),
              )}
            >
              {formatRatingDelta(p.ratingChange)}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export function SettledPnlResult({
  winnerName,
  decidedBy,
  resolutionDetail,
  verificationStatus,
  participants,
}: SettledPnlResultProps) {
  const decidedCopy = decidedBy
    ? (DECIDED_BY_COPY[decidedBy] ?? decidedBy)
    : null;
  const anyMarkOut = participants.some(
    (p) => p.markOutStatus && p.markOutStatus !== "NONE",
  );

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 text-center">
        <div className="flex items-center justify-center gap-2">
          {winnerName ? (
            <>
              <Trophy className="size-4 text-primary" aria-hidden />
              <h2 className="text-xl font-semibold tracking-tight">
                {winnerName} wins the battle
              </h2>
            </>
          ) : (
            <h2 className="text-xl font-semibold tracking-tight">
              Battle drawn
            </h2>
          )}
        </div>
        {decidedCopy ? (
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            {decidedCopy}
          </p>
        ) : null}
        {resolutionDetail ? (
          <p className="mx-auto mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground/80">
            {resolutionDetail}
          </p>
        ) : null}
        <div className="mt-3 flex justify-center">
          <VerificationChip status={verificationStatus} />
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <ParticipantCard p={participants[0]} />
        <ParticipantCard p={participants[1]} />
      </div>

      {anyMarkOut ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Battle P&amp;L can differ from account P&amp;L: positions still open
          at the window close are marked out at a hypothetical buzzer price
          rather than the trader&apos;s actual later exit.
        </p>
      ) : null}
    </section>
  );
}
