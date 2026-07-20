"use client";

/**
 * TraderScorecard — one side of the head-to-head panel.
 *
 * Renders ONLY engine-computed values: the total battle score, the four
 * component scores, P&L / drawdown / trade stats, discipline violations, and
 * risk utilization all arrive pre-computed on `BattleParticipantState`.
 */

import { CheckCircle2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BattleParticipantState } from "@/lib/battles/battleEngine";
import { AnimatedNumber } from "./animated-number";
import { StatPill } from "./stat-pill";
import { TRADER_COLORS, TraderAvatar, type TraderAccent } from "./trader-avatar";
import { formatPosition, formatSignedUsd, formatUsd } from "./format";

interface ComponentBarProps {
  label: string;
  /** Engine-computed component score, 0–100. */
  score: number;
  color: string;
}

function ComponentBar({ label, score, color }: ComponentBarProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.min(100, score)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[11px] font-medium tabular-nums">
        {score.toFixed(1)}
      </span>
    </div>
  );
}

interface TraderScorecardProps {
  participant: BattleParticipantState;
  accent: TraderAccent;
  isLeader: boolean;
}

export function TraderScorecard({
  participant,
  accent,
  isLeader,
}: TraderScorecardProps) {
  const color = TRADER_COLORS[accent];
  const { score } = participant;
  const violations = score.components.discipline.violations;
  const riskPct = Math.round(participant.riskUtilization * 100);

  return (
    <article
      className={cn(
        "relative rounded-xl border bg-card p-4 transition-colors",
        isLeader ? "border-primary/50" : "border-border",
      )}
    >
      {isLeader ? (
        <span className="absolute -top-2.5 right-4 rounded-sm border border-primary/50 bg-background px-1.5 py-px text-[10px] font-semibold tracking-widest text-primary uppercase">
          Leading
        </span>
      ) : null}

      {/* Identity + total score */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <TraderAvatar
            displayName={participant.displayName}
            accent={accent}
            size="lg"
          />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {participant.displayName}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {participant.accountLabel}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              Rating {participant.rating.toLocaleString("en-US")}
            </p>
          </div>
        </div>
        <div className="text-right">
          <AnimatedNumber
            value={score.total}
            decimals={1}
            className="text-3xl font-semibold tracking-tight"
          />
          <p className="text-[10px] tracking-wide text-muted-foreground uppercase">
            Battle score
          </p>
        </div>
      </div>

      {/* Component bars */}
      <div className="mt-4 space-y-1.5">
        <ComponentBar
          label="Performance"
          score={score.components.performance.score}
          color={color}
        />
        <ComponentBar
          label="Risk efficiency"
          score={score.components.riskEfficiency.score}
          color={color}
        />
        <ComponentBar
          label="Discipline"
          score={score.components.discipline.score}
          color={color}
        />
        <ComponentBar
          label="Consistency"
          score={score.components.consistency.score}
          color={color}
        />
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatPill
          label="Net P&L"
          value={formatSignedUsd(participant.netPnl)}
          tone={
            participant.netPnl > 0
              ? "positive"
              : participant.netPnl < 0
                ? "negative"
                : "neutral"
          }
        />
        <StatPill
          label="Max drawdown"
          value={formatUsd(participant.maxDrawdown)}
        />
        <StatPill label="Trades" value={String(participant.tradeCount)} />
        <StatPill
          label="Position"
          value={formatPosition(participant.openPosition)}
        />
      </div>

      {/* Discipline status */}
      <div className="mt-3 flex items-center gap-1.5 text-xs">
        {violations.length === 0 ? (
          <>
            <CheckCircle2 className="size-3.5 text-positive" aria-hidden />
            <span className="text-muted-foreground">
              Discipline clean — no rule violations
            </span>
          </>
        ) : (
          <>
            <TriangleAlert className="size-3.5 text-negative" aria-hidden />
            <span className="text-negative">
              {violations.length}{" "}
              {violations.length === 1 ? "violation" : "violations"}
              <span className="tabular-nums">
                {" "}
                (−{score.components.discipline.totalPenalty} discipline)
              </span>
            </span>
            <span className="truncate text-muted-foreground">
              · {violations.map((v) => v.label).join(", ")}
            </span>
          </>
        )}
      </div>

      {/* Risk utilization meter */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-[10px] tracking-wide text-muted-foreground uppercase">
          <span>Risk utilization</span>
          <span className="tabular-nums">
            {riskPct}% of {formatUsd(participant.limits.permittedRisk)}{" "}
            permitted risk
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              riskPct >= 80
                ? "bg-negative"
                : riskPct >= 50
                  ? "bg-primary"
                  : "bg-positive",
            )}
            style={{ width: `${Math.min(100, riskPct)}%` }}
          />
        </div>
      </div>
    </article>
  );
}
