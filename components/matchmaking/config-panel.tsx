"use client";

/**
 * ConfigPanel — the pre-queue battle configuration screen.
 *
 * Market / battle window / battle type selection plus the simulated account
 * card. Market availability comes from the matchmaking engine (computed
 * server-side via searchForOpponent) — the UI never decides who is matchable.
 * Account limits render straight from lib/battles/battleRules constants.
 */

import { Radar, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MFFU_50K_RAPID } from "@/lib/battles/battleRules";
import {
  BATTLE_TYPES,
  BATTLE_WINDOWS,
  MARKETS,
  type Market,
} from "@/lib/data/schema";
import {
  BATTLE_TYPE_LABELS,
  BATTLE_WINDOW_LABELS,
  MARKET_LABELS,
  formatLeague,
  formatRecord,
  formatStreak,
  formatUsd,
} from "@/components/battle/format";
import { LeagueBadge } from "@/components/battle/league-badge";
import { StatPill } from "@/components/battle/stat-pill";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import type { BattleConfig, MatchmakingTraderCard } from "./types";

interface OptionButtonProps {
  label: string;
  sublabel?: string;
  selected: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onSelect: () => void;
}

function OptionButton({
  label,
  sublabel,
  selected,
  disabled,
  disabledReason,
  onSelect,
}: OptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      title={disabled ? disabledReason : undefined}
      className={cn(
        "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
        selected
          ? "border-primary/60 bg-primary/10 text-foreground"
          : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
        disabled && "cursor-not-allowed opacity-45 hover:text-muted-foreground",
      )}
    >
      <span className="block font-medium">{label}</span>
      {sublabel ? (
        <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
          {sublabel}
        </span>
      ) : null}
    </button>
  );
}

interface ConfigPanelProps {
  demo: MatchmakingTraderCard;
  /** Engine-computed: markets with at least one matchable opponent queued. */
  marketAvailability: Record<Market, boolean>;
  config: BattleConfig;
  /** Inline queue error (e.g. the engine found no opponent for this config). */
  errorMessage?: string | null;
  onChange: (config: BattleConfig) => void;
  onSearch: () => void;
}

export function ConfigPanel({
  demo,
  marketAvailability,
  config,
  errorMessage = null,
  onChange,
  onSearch,
}: ConfigPanelProps) {
  const account = MFFU_50K_RAPID;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Battle configuration */}
      <section className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Find a Battle</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pick your market and session, then queue for a 1-on-1 opponent
              near your rating.
            </p>
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Market
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MARKETS.map((market) => {
              const available = marketAvailability[market];
              return (
                <OptionButton
                  key={market}
                  label={MARKET_LABELS[market]}
                  sublabel={available ? undefined : "No opponents queued"}
                  selected={config.market === market}
                  disabled={!available}
                  disabledReason="No demo-queue opponents near your rating trade this market."
                  onSelect={() => onChange({ ...config, market })}
                />
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Battle window
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BATTLE_WINDOWS.map((battleWindow) => {
              const enabled = battleWindow === "OPENING_BELL";
              return (
                <OptionButton
                  key={battleWindow}
                  label={BATTLE_WINDOW_LABELS[battleWindow].split(" · ")[0]}
                  sublabel={
                    BATTLE_WINDOW_LABELS[battleWindow].split(" · ")[1] +
                    (enabled ? "" : " · full launch")
                  }
                  selected={config.battleWindow === battleWindow}
                  disabled={!enabled}
                  disabledReason="Demo battles run the Opening Bell session."
                  onSelect={() => onChange({ ...config, battleWindow })}
                />
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Battle type
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {BATTLE_TYPES.map((battleType) => {
              const enabled = battleType === "LIVE_PERFORMANCE";
              return (
                <OptionButton
                  key={battleType}
                  label={BATTLE_TYPE_LABELS[battleType]}
                  sublabel={enabled ? "Both trade the live session" : "Coming at full launch"}
                  selected={config.battleType === battleType}
                  disabled={!enabled}
                  disabledReason="Only Live Performance battles are available in the demo."
                  onSelect={() => onChange({ ...config, battleType })}
                />
              );
            })}
          </div>
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onSearch}>
            <Radar data-icon="inline-start" aria-hidden />
            Find a Battle
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Scored on normalized performance — rating movement is applied at
            the final bell.
          </p>
        </div>
        {errorMessage ? (
          <p className="mt-3 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative" role="status">
            {errorMessage}
          </p>
        ) : null}
      </section>

      {/* Trader + simulated account */}
      <aside className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <TraderAvatar displayName={demo.displayName} accent="demo" size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">
                {demo.displayName}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatLeague(demo.league, demo.division)}
              </p>
            </div>
            <LeagueBadge
              league={demo.league}
              division={demo.division}
              className="ml-auto"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <StatPill
              label="Rating"
              value={demo.rating.toLocaleString("en-US")}
            />
            <StatPill
              label="Season"
              value={formatRecord(demo.seasonWins, demo.seasonLosses)}
            />
            <StatPill label="Streak" value={formatStreak(demo.currentStreak)} />
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">{account.accountLabel}</h2>
            <Badge
              variant="outline"
              className="ml-auto text-[10px] text-muted-foreground"
            >
              Simulated Account
            </Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-positive/30 bg-positive/10 px-1.5 py-0.5 text-[10px] font-medium text-positive">
              <span className="size-1.5 rounded-full bg-positive" aria-hidden />
              Connected (Simulated)
            </span>
            <span className="text-[11px] text-muted-foreground">
              {account.externalAccountId}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Simulated demo account — not connected to any real account.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <StatPill
              label="Starting balance"
              value={formatUsd(account.startingBalance)}
            />
            <StatPill
              label="Permitted risk"
              value={formatUsd(account.limits.permittedRisk)}
            />
            <StatPill
              label="Daily drawdown remaining"
              value={formatUsd(account.limits.dailyLossLimit)}
            />
            <StatPill
              label="Max contracts"
              value={String(account.limits.maxContracts)}
            />
          </div>
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            Breaching account limits during a battle costs discipline points —
            staying inside them is how disciplined traders beat bigger gross
            P&amp;L.
          </p>
        </section>
      </aside>
    </div>
  );
}
