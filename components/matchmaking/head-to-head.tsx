"use client";

/**
 * HeadToHead — pre-battle comparison of the matched traders.
 *
 * Renders seed-provided profile data (ratings, records, streaks, component
 * strengths) side by side, then hands off into the existing Live Battle
 * screen via /battle?scenario=… — the demo scenario picker only chooses which
 * deterministic script the battle engine replays.
 */

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, RotateCcw, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEFAULT_SCENARIO_ID,
  SCENARIOS,
  getScenarioListing,
  isScenarioId,
  type ScenarioId,
} from "@/lib/battles/scenarios";
import {
  BATTLE_STYLE_LABELS,
  MARKET_LABELS,
  formatRecord,
  formatStreak,
} from "@/components/battle/format";
import { LeagueBadge } from "@/components/battle/league-badge";
import {
  TRADER_COLORS,
  TraderAvatar,
  type TraderAccent,
} from "@/components/battle/trader-avatar";
import type { MatchmakingTraderCard } from "./types";

function TraderColumn({
  trader,
  accent,
  align,
}: {
  trader: MatchmakingTraderCard;
  accent: TraderAccent;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col gap-2",
        align === "left" ? "items-start text-left" : "items-end text-right",
      )}
    >
      <TraderAvatar displayName={trader.displayName} accent={accent} size="lg" />
      <div>
        <p className="text-lg font-semibold">{trader.displayName}</p>
        <p className="text-xs text-muted-foreground">
          {trader.firmName}
          {trader.accountLabel ? ` · ${trader.accountLabel}` : ""}
        </p>
      </div>
      <div
        className={cn(
          "flex items-center gap-2",
          align === "right" && "flex-row-reverse",
        )}
      >
        <LeagueBadge league={trader.league} division={trader.division} />
        <span className="text-sm font-semibold tabular-nums">
          {trader.rating.toLocaleString("en-US")}
        </span>
      </div>
    </div>
  );
}

/** One label row with the two traders' seed-provided values. */
function CompareRow({
  label,
  left,
  right,
}: {
  label: string;
  left: string;
  right: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-1.5 text-sm">
      <span className="text-left font-medium tabular-nums">{left}</span>
      <span className="text-center text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-right font-medium tabular-nums">{right}</span>
    </div>
  );
}

/** Mirrored center-out bars for a seed-provided component strength (0–100). */
function StrengthRow({
  label,
  demoValue,
  opponentValue,
}: {
  label: string;
  demoValue: number;
  opponentValue: number;
}) {
  return (
    <div className="grid grid-cols-[2rem_1fr_auto_1fr_2rem] items-center gap-2 py-1">
      <span className="text-left text-xs font-medium tabular-nums">
        {demoValue}
      </span>
      <div className="flex h-1.5 justify-end overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, demoValue)}%`,
            backgroundColor: TRADER_COLORS.demo,
          }}
        />
      </div>
      <span className="w-24 text-center text-[11px] tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, opponentValue)}%`,
            backgroundColor: TRADER_COLORS.opponent,
          }}
        />
      </div>
      <span className="text-right text-xs font-medium tabular-nums">
        {opponentValue}
      </span>
    </div>
  );
}

interface HeadToHeadProps {
  demo: MatchmakingTraderCard;
  opponent: MatchmakingTraderCard;
  /** True when the engine's scripted demo battle features this opponent. */
  battlePlayable: boolean;
  /** Display name of the battle engine's scripted opponent (DeltaHunter). */
  scriptedRivalName: string;
  onNewSearch: () => void;
}

export function HeadToHead({
  demo,
  opponent,
  battlePlayable,
  scriptedRivalName,
  onNewSearch,
}: HeadToHeadProps) {
  const [scenarioId, setScenarioId] = useState<ScenarioId>(DEFAULT_SCENARIO_ID);
  const scenario = getScenarioListing(scenarioId);

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

        {/* Identities */}
        <div className="mt-6 flex items-start gap-4 sm:gap-8">
          <TraderColumn trader={demo} accent="demo" align="left" />
          <div className="flex flex-col items-center gap-1 self-center">
            <span className="flex size-10 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
              <Swords className="size-5" aria-hidden />
            </span>
            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
              vs
            </span>
          </div>
          <TraderColumn trader={opponent} accent="opponent" align="right" />
        </div>

        {/* Season comparison */}
        <div className="mt-6 divide-y divide-border/60 rounded-lg border border-border/60 bg-secondary/30 px-4 py-1">
          <CompareRow
            label="Season record"
            left={formatRecord(demo.seasonWins, demo.seasonLosses)}
            right={formatRecord(opponent.seasonWins, opponent.seasonLosses)}
          />
          <CompareRow
            label="Streak"
            left={formatStreak(demo.currentStreak)}
            right={formatStreak(opponent.currentStreak)}
          />
          <CompareRow
            label="Battle style"
            left={BATTLE_STYLE_LABELS[demo.battleStyle]}
            right={BATTLE_STYLE_LABELS[opponent.battleStyle]}
          />
          <CompareRow
            label="Primary market"
            left={MARKET_LABELS[demo.primaryMarket].split(" · ")[0]}
            right={MARKET_LABELS[opponent.primaryMarket].split(" · ")[0]}
          />
        </div>

        {/* Component strengths (seed profile data) */}
        <div className="mt-4 rounded-lg border border-border/60 bg-secondary/30 px-4 py-2">
          <StrengthRow
            label="Discipline"
            demoValue={demo.disciplineScore}
            opponentValue={opponent.disciplineScore}
          />
          <StrengthRow
            label="Risk"
            demoValue={demo.riskScore}
            opponentValue={opponent.riskScore}
          />
          <StrengthRow
            label="Performance"
            demoValue={demo.performanceScore}
            opponentValue={opponent.performanceScore}
          />
        </div>

        {/* Battle hand-off */}
        {battlePlayable ? (
          <>
            <div className="mt-5 rounded-lg border border-border/60 bg-secondary/30 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="matchup-scenario"
                  className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
                >
                  Demo scenario
                </label>
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Presenter pick
                </Badge>
                <div className="relative min-w-56 flex-1">
                  <select
                    id="matchup-scenario"
                    value={scenarioId}
                    onChange={(event) => {
                      if (isScenarioId(event.target.value)) {
                        setScenarioId(event.target.value);
                      }
                    }}
                    className="w-full appearance-none rounded-md border border-input bg-secondary px-2.5 py-1.5 pr-8 text-xs text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {SCENARIOS.map((listing) => (
                      <option key={listing.id} value={listing.id}>
                        {listing.title}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  />
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                {scenario.description}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link href={`/battle?scenario=${scenarioId}`}>
                  <Swords data-icon="inline-start" aria-hidden />
                  Enter Battle
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={onNewSearch}>
                <RotateCcw data-icon="inline-start" aria-hidden />
                New search
              </Button>
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Rating movement is applied at the final bell — a competitive
              standing, nothing more.
            </p>
          </>
        ) : (
          <div className="mt-6 rounded-lg border border-border/60 bg-secondary/30 px-4 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              The demo&apos;s live battle scripts follow the{" "}
              <span className="text-foreground">
                {demo.displayName} vs {scriptedRivalName}
              </span>{" "}
              rivalry. Queue on NQ with the default settings to play the full
              battle against this build&apos;s scripted opponent.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={onNewSearch}
            >
              <RotateCcw data-icon="inline-start" aria-hidden />
              New search
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
