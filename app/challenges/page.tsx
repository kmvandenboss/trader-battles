/**
 * /challenges — the v1 direct-challenge hub: send a challenge to a named
 * future window, respond to incoming challenges, and track the scheduled
 * battles they materialize into.
 *
 * Server component: identity resolves through the lib/auth seam; every list
 * is read through the repositories; mutations go through the server actions
 * in ./actions.ts (which call the challengeService). No scoring/rating math
 * anywhere on this page.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getRepositories } from "@/lib/data/repositories";
import { getCurrentIdentity } from "@/lib/auth/currentUser";
import type { Challenge } from "@/lib/data/schema";
import type {
  ScheduledBattle,
  TraderWithProfile,
} from "@/lib/data/repositories/types";
import { LeagueBadge } from "@/components/battle/league-badge";
import { TraderAvatar } from "@/components/battle/trader-avatar";
import {
  BATTLE_WINDOW_LABELS,
  MARKET_LABELS,
  formatDate,
  formatLeague,
  formatUtcWindow,
} from "@/components/battle/format";
import {
  ACCOUNT_BRACKETS,
  ACCOUNT_BRACKET_LABELS,
  OPEN_INSTRUMENT_LABEL,
} from "@/components/battle-v1/labels";
import { BattleStatusChip } from "@/components/battle-v1/status-chip";
import {
  CreateChallengeForm,
  type OpponentOption,
} from "@/components/challenges/create-challenge-form";
import {
  IncomingChallengeButtons,
  OutgoingChallengeButtons,
} from "@/components/challenges/challenge-response-buttons";
import { etTodayIso, formatSessionDate } from "@/components/challenges/et-date";
import { BATTLE_WINDOWS, MARKETS } from "@/lib/data/schema";

export const metadata: Metadata = {
  title: "Challenges",
  description:
    "Challenge a specific trader to a named future window. Both trade the same window; the battle settles after it closes.",
};

// Per-user, mutation-driven data — always render fresh.
export const dynamic = "force-dynamic";

/** "Wed, Jul 22, 2026 · Opening Bell · 9:30–11:00 ET" for a challenge. */
function challengeWindowLine(challenge: Challenge): string {
  return `${formatSessionDate(challenge.sessionDate)} · ${BATTLE_WINDOW_LABELS[challenge.battleWindow]}`;
}

function ChallengeMeta({ challenge }: { challenge: Challenge }) {
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      <p>{challengeWindowLine(challenge)}</p>
      <p>
        {challenge.market
          ? MARKET_LABELS[challenge.market]
          : `${OPEN_INSTRUMENT_LABEL} — trader's choice`}
        {" · "}
        {ACCOUNT_BRACKET_LABELS[
          challenge.accountBracket as keyof typeof ACCOUNT_BRACKET_LABELS
        ] ?? challenge.accountBracket}
      </p>
      {challenge.message ? (
        <p className="text-foreground/80 italic">“{challenge.message}”</p>
      ) : null}
    </div>
  );
}

function TraderLine({
  trader,
  accent,
}: {
  trader: TraderWithProfile | undefined;
  accent: "demo" | "opponent";
}) {
  if (!trader) {
    return <p className="text-sm text-muted-foreground">Unknown trader</p>;
  }
  return (
    <Link
      href={`/profile/${trader.user.id}`}
      className="flex items-center gap-2.5"
    >
      <TraderAvatar
        displayName={trader.user.displayName}
        accent={accent}
        size="sm"
      />
      <span className="text-sm font-medium underline-offset-2 hover:text-primary hover:underline">
        {trader.user.displayName}
      </span>
      <LeagueBadge
        league={trader.profile.league}
        division={trader.profile.division}
      />
      <span className="text-xs text-muted-foreground tabular-nums">
        {trader.profile.rating.toLocaleString("en-US")}
      </span>
    </Link>
  );
}

function ScheduledBattleCard({
  scheduled,
  selfId,
  traderById,
}: {
  scheduled: ScheduledBattle;
  selfId: string;
  traderById: Map<string, TraderWithProfile>;
}) {
  const { battle, participants } = scheduled;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <BattleStatusChip status={battle.status} />
          <p className="text-sm font-medium">
            {BATTLE_WINDOW_LABELS[battle.battleWindow]} ·{" "}
            {formatDate(battle.scheduledStart)}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/battles/${battle.id}`}>Open battle</Link>
        </Button>
      </div>
      {battle.scheduledEnd ? (
        <p className="mt-1 text-[11px] text-muted-foreground/70 tabular-nums">
          {formatUtcWindow(battle.scheduledStart, battle.scheduledEnd)}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
        {participants.map(({ participant }) => (
          <TraderLine
            key={participant.id}
            trader={traderById.get(participant.userId)}
            accent={participant.userId === selfId ? "demo" : "opponent"}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
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
    </div>
  );
}

const CHALLENGE_STATUS_LABEL: Record<Challenge["status"], string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export default async function ChallengesPage() {
  const repos = getRepositories();
  const identity = await getCurrentIdentity();
  const selfId = identity.trader.user.id;

  const [allTraders, challengeLists, scheduledBattles] = await Promise.all([
    repos.traders.list(),
    repos.challenges.listForUser(selfId),
    repos.battles.listScheduledForUser(selfId),
  ]);

  const traderById = new Map(allTraders.map((t) => [t.user.id, t]));
  // A challenge counterpart may not be in the default list (e.g. a signed-up
  // trader) — fetch any missing ids individually.
  const involvedIds = new Set<string>();
  for (const c of [...challengeLists.incoming, ...challengeLists.outgoing]) {
    involvedIds.add(c.challengerUserId);
    involvedIds.add(c.opponentUserId);
  }
  for (const b of scheduledBattles) {
    for (const p of b.participants) involvedIds.add(p.participant.userId);
  }
  for (const id of involvedIds) {
    if (!traderById.has(id)) {
      const trader = await repos.traders.getById(id);
      if (trader) traderById.set(id, trader);
    }
  }

  const incomingPending = challengeLists.incoming.filter(
    (c) => c.status === "PENDING",
  );
  const outgoingPending = challengeLists.outgoing.filter(
    (c) => c.status === "PENDING",
  );
  const recentResponded = [
    ...challengeLists.incoming,
    ...challengeLists.outgoing,
  ]
    .filter((c) => c.status !== "PENDING")
    .sort((a, b) =>
      (b.respondedAt ?? b.createdAt).localeCompare(a.respondedAt ?? a.createdAt),
    )
    .slice(0, 6);

  const opponents: OpponentOption[] = allTraders
    .filter((t) => t.user.id !== selfId)
    .map((t) => ({
      userId: t.user.id,
      label: `${t.user.displayName} · ${t.profile.rating.toLocaleString("en-US")} · ${formatLeague(t.profile.league, t.profile.division)}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const isEphemeralDemo = !process.env.DATABASE_URL;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Challenges</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Challenge a specific trader to a named future window. You both trade
          that same window on your own accounts; the battle settles after it
          closes from each side&apos;s imported trades.
        </p>
        {isEphemeralDemo ? (
          <p className="mt-1 text-xs text-muted-foreground/70">
            This zero-database demo holds challenges and scheduled battles in
            memory — they reset when the server restarts.
          </p>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Incoming
            </h2>
            {incomingPending.length === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                No incoming challenges. When another trader challenges you, it
                lands here to accept or decline.
              </p>
            ) : (
              incomingPending.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <TraderLine
                        trader={traderById.get(c.challengerUserId)}
                        accent="opponent"
                      />
                      <ChallengeMeta challenge={c} />
                    </div>
                    <IncomingChallengeButtons challengeId={c.id} />
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Outgoing
            </h2>
            {outgoingPending.length === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                No outgoing challenges. Send one with the form — it stays here
                until your opponent responds.
              </p>
            ) : (
              outgoingPending.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <TraderLine
                        trader={traderById.get(c.opponentUserId)}
                        accent="opponent"
                      />
                      <ChallengeMeta challenge={c} />
                    </div>
                    <OutgoingChallengeButtons challengeId={c.id} />
                  </div>
                </div>
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Scheduled battles
            </h2>
            {scheduledBattles.length === 0 ? (
              <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                No scheduled battles yet. Accepting a challenge schedules the
                battle window for both traders.
              </p>
            ) : (
              scheduledBattles.map((b) => (
                <ScheduledBattleCard
                  key={b.battle.id}
                  scheduled={b}
                  selfId={selfId}
                  traderById={traderById}
                />
              ))
            )}
          </section>

          {recentResponded.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Recent responses
              </h2>
              <ul className="divide-y divide-border/40 rounded-xl border border-border bg-card">
                {recentResponded.map((c) => {
                  const counterpartId =
                    c.challengerUserId === selfId
                      ? c.opponentUserId
                      : c.challengerUserId;
                  const counterpart = traderById.get(counterpartId);
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {c.challengerUserId === selfId ? "To" : "From"}{" "}
                        <span className="font-medium text-foreground">
                          {counterpart?.user.displayName ?? "Unknown trader"}
                        </span>{" "}
                        · {challengeWindowLine(c)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {CHALLENGE_STATUS_LABEL[c.status]}
                        </span>
                        {c.status === "ACCEPTED" && c.battleId ? (
                          <Link
                            href={`/battles/${c.battleId}`}
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            View battle
                          </Link>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <aside>
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">Create a challenge</h2>
            <p className="mt-1 mb-4 text-xs text-muted-foreground">
              Name the session and window up front — both of you trade that
              exact window. Rating moves with the result.
            </p>
            <CreateChallengeForm
              opponents={opponents}
              windows={BATTLE_WINDOWS.map((w) => ({
                value: w,
                label: BATTLE_WINDOW_LABELS[w],
              }))}
              markets={MARKETS.map((m) => ({
                value: m,
                label: MARKET_LABELS[m],
              }))}
              brackets={ACCOUNT_BRACKETS.map((b) => ({
                value: b,
                label: ACCOUNT_BRACKET_LABELS[b],
              }))}
              minSessionDate={etTodayIso()}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
