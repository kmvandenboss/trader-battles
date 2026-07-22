/**
 * /battles/[id] — the v1 scheduled-battle page: window details, both
 * participants' import status, the current participant's CSV import card,
 * optional market-bars import, the settle control, and — once settled — the
 * PNL_V1 result.
 *
 * Server component (Rule 4): every number on this page is read from the
 * repositories. The settled presentation renders participant rows persisted
 * by the settlement engine (finalScore, realizedPnl, participationBonus,
 * mark-out fields, ratings) plus the repo-computed ratingChange — the UI
 * computes none of it. The OLD /battle route remains the live demo showcase;
 * this route is the settle-after-the-fact v1 path.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getRepositories } from "@/lib/data/repositories";
import { getCurrentIdentity } from "@/lib/auth/currentUser";
import type {
  BattleDetail,
  ParticipantSummary,
  ScheduledBattleParticipant,
} from "@/lib/data/repositories/types";
import { MARKETS } from "@/lib/data/schema";
import { LeagueBadge } from "@/components/battle/league-badge";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import {
  BATTLE_WINDOW_LABELS,
  MARKET_LABELS,
  formatDate,
  formatUtcWindow,
} from "@/components/battle/format";
import {
  ACCOUNT_BRACKET_LABELS,
  OPEN_INSTRUMENT_LABEL,
} from "@/components/battle-v1/labels";
import { BattleStatusChip } from "@/components/battle-v1/status-chip";
import { VerificationChip } from "@/components/battle-v1/verification-chip";
import {
  SettledPnlResult,
  type SettledParticipantView,
} from "@/components/battle-v1/settled-result";
import { ImportTradesCard } from "@/components/battle-v1/import-trades-card";
import { MarketBarsCard } from "@/components/battle-v1/market-bars-card";
import { SettleCard } from "@/components/battle-v1/settle-card";
import { buildV1BattleReport } from "@/components/battle-v1/report";
import { BattleReportSection } from "@/components/battle-v1/battle-report-section";

export const metadata: Metadata = {
  title: "Battle",
  description:
    "A scheduled head-to-head battle window: import your trades after it closes; the battle settles on in-window realized P&L.",
};

// Per-user, mutation-driven data — always render fresh.
export const dynamic = "force-dynamic";

/** Map a settled participant row + repo-computed rating change to the view.
 * The nullable PNL_V1 columns are always set on a settled PNL_V1 battle
 * (saveSettlement persists them all); `?? 0` only narrows types. */
function toSettledView(
  summary: ParticipantSummary,
  accent: "demo" | "opponent",
): SettledParticipantView {
  const p = summary.participant;
  return {
    displayName: summary.trader.user.displayName,
    league: summary.trader.profile.league,
    division: summary.trader.profile.division,
    accent,
    result: p.result,
    finalScore: p.finalScore,
    realizedPnl: p.realizedPnl ?? 0,
    participationBonus: p.participationBonus ?? 0,
    closedTradeCount: p.closedTradeCount ?? 0,
    grossProfit: p.grossProfit ?? 0,
    grossLoss: p.grossLoss ?? 0,
    markOutPnl: p.markOutPnl ?? 0,
    markOutStatus: p.markOutStatus,
    markOutNote: p.markOutNote,
    startingRating: p.startingRating,
    endingRating: p.endingRating,
    ratingChange: summary.ratingChange,
  };
}

function ParticipantCard({
  entry,
  isSelf,
  importedCount,
}: {
  entry: ScheduledBattleParticipant;
  isSelf: boolean;
  importedCount: number;
}) {
  const { participant, trader } = entry;
  return (
    <div className="flex-1 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <TraderAvatar
          displayName={trader.user.displayName}
          accent={isSelf ? "demo" : "opponent"}
          size="sm"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {trader.user.displayName}
            {isSelf ? (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                (you)
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Rating at scheduling: {participant.startingRating.toLocaleString("en-US")}
          </p>
        </div>
        <LeagueBadge
          league={trader.profile.league}
          division={trader.profile.division}
          className="ml-auto"
        />
      </div>
      <p className="mt-3 text-xs">
        {importedCount > 0 ? (
          <span className="text-positive">
            {importedCount} execution{importedCount === 1 ? "" : "s"} imported
          </span>
        ) : (
          <span className="text-muted-foreground">Awaiting import</span>
        )}
      </p>
    </div>
  );
}

export default async function BattlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repos = getRepositories();
  const scheduled = await repos.battles.getScheduledById(id);
  if (!scheduled) notFound();

  const identity = await getCurrentIdentity();
  const selfId = identity.trader.user.id;
  const { battle } = scheduled;
  const isParticipant = scheduled.participants.some(
    (p) => p.participant.userId === selfId,
  );

  // Self first when the viewer is a participant.
  const orderedParticipants = [...scheduled.participants].sort((a, b) => {
    const aSelf = a.participant.userId === selfId ? 0 : 1;
    const bSelf = b.participant.userId === selfId ? 0 : 1;
    return aSelf - bSelf;
  });

  const importedCounts = await Promise.all(
    orderedParticipants.map(async (p) => {
      const events = await repos.battles.listImportedExecutions(
        id,
        p.participant.userId,
      );
      return events.length;
    }),
  );

  const isCompleted = battle.status === "COMPLETED";
  const isPnlV1 = battle.scoringMode === "PNL_V1";
  const detail: BattleDetail | null =
    isCompleted ? await repos.battles.getById(id) : null;

  const canAct =
    isParticipant &&
    (battle.status === "SCHEDULED" || battle.status === "SETTLING");

  const [nameA, nameB] = scheduled.participants.map(
    (p) => p.trader.user.displayName,
  );

  let settledViews: [SettledParticipantView, SettledParticipantView] | null =
    null;
  if (detail && isPnlV1) {
    const ordered = [...detail.participants].sort((a, b) => {
      const aSelf = a.participant.userId === selfId ? 0 : 1;
      const bSelf = b.participant.userId === selfId ? 0 : 1;
      return aSelf - bSelf;
    });
    settledViews = [
      toSettledView(ordered[0], "demo"),
      toSettledView(ordered[1], "opponent"),
    ];
  }

  // Detailed report + replay for settled PNL_V1 battles carrying telemetry.
  // Self-first ordering mirrors settledViews; spectators default to the first
  // participant. buildV1BattleReport computes nothing — it shapes persisted
  // telemetry read from the repositories (Rule 4).
  const report =
    detail && isPnlV1
      ? buildV1BattleReport(
          detail,
          isParticipant ? selfId : detail.participants[0].trader.user.id,
        )
      : null;
  const winnerName = battle.winnerId
    ? (scheduled.participants.find(
        (p) => p.participant.userId === battle.winnerId,
      )?.trader.user.displayName ?? null)
    : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {nameA} vs {nameB}
          </h1>
          <BattleStatusChip status={battle.status} />
          <VerificationChip status={battle.verificationStatus} />
        </div>
        <p className="text-sm text-muted-foreground">
          {BATTLE_WINDOW_LABELS[battle.battleWindow]} ·{" "}
          {formatDate(battle.scheduledStart)}
          {" · "}
          {battle.market
            ? MARKET_LABELS[battle.market]
            : `${OPEN_INSTRUMENT_LABEL} — each trader's choice`}
          {battle.accountBracket
            ? ` · ${
                ACCOUNT_BRACKET_LABELS[
                  battle.accountBracket as keyof typeof ACCOUNT_BRACKET_LABELS
                ] ?? battle.accountBracket
              }`
            : ""}
        </p>
        {battle.scheduledEnd ? (
          <p className="text-[11px] text-muted-foreground/70 tabular-nums">
            Window (UTC): {formatUtcWindow(battle.scheduledStart, battle.scheduledEnd)}
          </p>
        ) : null}
      </header>

      {settledViews ? (
        <SettledPnlResult
          winnerName={winnerName}
          decidedBy={battle.decidedBy}
          resolutionDetail={battle.resolutionDetail}
          verificationStatus={battle.verificationStatus}
          participants={settledViews}
        />
      ) : (
        <div className="flex flex-col gap-4 md:flex-row">
          {orderedParticipants.map((p, index) => (
            <ParticipantCard
              key={p.participant.id}
              entry={p}
              isSelf={p.participant.userId === selfId}
              importedCount={importedCounts[index]}
            />
          ))}
        </div>
      )}

      {report && report.hasTelemetry ? (
        <BattleReportSection report={report} />
      ) : null}

      {isCompleted && !isPnlV1 && isParticipant ? (
        <section className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            This battle was scored under the 4-factor model.
          </p>
          <Button variant="outline" size="sm" className="mt-3" asChild>
            <Link href={`/battle/review?battle=${battle.id}`}>
              Open the full review
            </Link>
          </Button>
        </section>
      ) : null}

      {canAct ? (
        <>
          <ImportTradesCard battleId={battle.id} />
          <MarketBarsCard
            battleId={battle.id}
            markets={MARKETS.map((m) => ({ value: m, label: MARKET_LABELS[m] }))}
          />
          <SettleCard battleId={battle.id} />
        </>
      ) : null}

      {!isParticipant && !isCompleted ? (
        <p className="text-xs text-muted-foreground">
          You are viewing this scheduled battle as a spectator — only its
          participants can import trades or settle it.
        </p>
      ) : null}
    </div>
  );
}
