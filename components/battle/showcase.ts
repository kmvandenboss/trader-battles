/**
 * Showcase-battle loader — assembles a fully serializable view model for the
 * standalone battle result + review screens from the seeded showcase battle
 * (KevinV vs DeltaHunter, battle-189) read through the repositories.
 *
 * IMPORTANT (Rule 4): this module computes NO scores, ratings, or P&L. Every
 * number here was already produced by the scoring/rating/seed layers and is
 * read via `getRepositories()`. The "why you won / lost" bullets, component
 * edges, and coaching prose come from the pure `deriveReviewNarrative` helper
 * (lib/battles/reviewNarrative), never reconstructed in JSX. Chart series are
 * plain numeric arrays so the client chart components stay presentation-only.
 *
 * This is a server-only module (no "use client"): it touches the repositories
 * and hands plain objects to both server and client components.
 */

import type { BattleDetail } from "@/lib/data/repositories/types";
import { getRepositories } from "@/lib/data/repositories";
import {
  deriveReviewNarrative,
  type ReviewNarrative,
} from "@/lib/battles/reviewNarrative";
import type {
  BattleResult,
  Division,
  League,
  Market,
  OrderSide,
} from "@/lib/data/schema";
import {
  BATTLE_WINDOW_LABELS,
  MARKET_LABELS,
  formatDate,
} from "./format";
import type { TraderAccent } from "./trader-avatar";

/** One participant's already-computed final numbers, ready to render. */
export interface ParticipantView {
  userId: string;
  displayName: string;
  firmName: string;
  league: League;
  division: Division;
  accent: TraderAccent;
  won: boolean;
  result: BattleResult;
  finalScore: number;
  components: {
    performance: number;
    riskEfficiency: number;
    discipline: number;
    consistency: number;
  };
  netPnl: number;
  maxDrawdown: number;
  tradeCount: number;
  riskUtilization: number;
  startingRating: number;
  endingRating: number;
  ratingChange: number;
}

/** Two series sharing an x-axis minute (nullable per side, connectNulls). */
export interface PairPoint {
  elapsedMin: number;
  demo: number | null;
  opponent: number | null;
}

/** A single execution fill for the trade-by-trade table. */
export interface TradeRow {
  id: string;
  displayName: string;
  accent: TraderAccent;
  iso: string;
  side: OrderSide;
  quantity: number;
  instrument: Market;
  price: number;
  eventType: string;
}

export type TimelineKind = "start" | "entry" | "exit" | "checkpoint" | "final";

/** A derived, factual moment for the review event timeline. */
export interface TimelineRow {
  id: string;
  iso: string;
  kind: TimelineKind;
  accent: TraderAccent | null;
  text: string;
}

export interface ShowcaseBattleView {
  battleId: string;
  market: Market;
  marketLabel: string;
  windowLabel: string;
  dateLabel: string;
  headline: string;
  startTimestampMs: number;
  durationMin: number;
  demo: ParticipantView;
  opponent: ParticipantView;
  narrative: ReviewNarrative;
  pnlSeries: PairPoint[];
  drawdownSeries: PairPoint[];
  scoreSeries: PairPoint[];
  tradeRows: TradeRow[];
  timeline: TimelineRow[];
}

function toParticipantView(
  detail: BattleDetail,
  which: "demo" | "opponent",
  demoUserId: string,
): ParticipantView {
  const [a, b] = detail.participants;
  const demoSummary = a.trader.user.id === demoUserId ? a : b;
  const oppSummary = a.trader.user.id === demoUserId ? b : a;
  const summary = which === "demo" ? demoSummary : oppSummary;
  const m = summary.metrics;
  return {
    userId: summary.trader.user.id,
    displayName: summary.trader.user.displayName,
    firmName: summary.trader.firm.name,
    league: summary.trader.profile.league,
    division: summary.trader.profile.division,
    accent: which,
    won: summary.participant.result === "WIN",
    result: summary.participant.result,
    finalScore: summary.participant.finalScore,
    components: {
      performance: m.performanceScore,
      riskEfficiency: m.riskEfficiencyScore,
      discipline: m.disciplineScore,
      consistency: m.consistencyScore,
    },
    netPnl: m.netPnl,
    maxDrawdown: m.maximumDrawdown,
    tradeCount: m.tradeCount,
    riskUtilization: m.riskUtilization,
    startingRating: summary.participant.startingRating,
    endingRating: summary.participant.endingRating,
    ratingChange: summary.ratingChange,
  };
}

/** Bucket paired numeric readings by elapsed minute (connectNulls fills gaps). */
function buildPairSeries(
  rows: Array<{ iso: string; isDemo: boolean; value: number }>,
  startMs: number,
): PairPoint[] {
  const byMinute = new Map<number, PairPoint>();
  for (const row of rows) {
    const elapsedMin = Math.round((Date.parse(row.iso) - startMs) / 60_000);
    const point = byMinute.get(elapsedMin) ?? {
      elapsedMin,
      demo: null,
      opponent: null,
    };
    if (row.isDemo) point.demo = row.value;
    else point.opponent = row.value;
    byMinute.set(elapsedMin, point);
  }
  return [...byMinute.values()].sort((x, y) => x.elapsedMin - y.elapsedMin);
}

/** Load and shape the seeded showcase battle for the result + review screens. */
export async function loadShowcaseBattle(): Promise<ShowcaseBattleView | null> {
  const { traders, battles } = getRepositories();
  const demoTrader = await traders.getDemoTrader();
  const detail = await battles.getLatestForUser(demoTrader.user.id);
  if (!detail) return null;

  const demoUserId = demoTrader.user.id;
  const demo = toParticipantView(detail, "demo", demoUserId);
  const opponent = toParticipantView(detail, "opponent", demoUserId);

  const [pA, pB] = detail.participants;
  const demoParticipant = pA.trader.user.id === demoUserId ? pA : pB;
  const oppParticipant = pA.trader.user.id === demoUserId ? pB : pA;
  const demoAccountId = demoParticipant.participant.tradingAccountId;
  const demoParticipantId = demoParticipant.participant.id;

  const narrative = deriveReviewNarrative(
    { displayName: demo.displayName, won: demo.won, metrics: demoParticipant.metrics },
    {
      displayName: opponent.displayName,
      won: opponent.won,
      metrics: oppParticipant.metrics,
    },
  );

  const startMs = Date.parse(detail.battle.scheduledStart);
  const endMs = detail.battle.endTime
    ? Date.parse(detail.battle.endTime)
    : startMs;
  const durationMin = Math.round((endMs - startMs) / 60_000);

  // P&L over time (realized) and drawdown over time, per participant.
  const pnlSeries = buildPairSeries(
    detail.accountSnapshots.map((s) => ({
      iso: s.timestamp,
      isDemo: s.tradingAccountId === demoAccountId,
      value: s.realizedPnl,
    })),
    startMs,
  );
  const drawdownSeries = buildPairSeries(
    detail.accountSnapshots.map((s) => ({
      iso: s.timestamp,
      isDemo: s.tradingAccountId === demoAccountId,
      value: s.drawdown,
    })),
    startMs,
  );
  // Battle score progression from the engine's metric timeline.
  const scoreSeries = buildPairSeries(
    detail.metricTimeline.map((m) => ({
      iso: m.timestamp,
      isDemo: m.participantId === demoParticipantId,
      value: m.totalBattleScore,
    })),
    startMs,
  );

  const accentFor = (userId: string): TraderAccent =>
    userId === demoUserId ? "demo" : "opponent";
  const nameFor = (userId: string): string =>
    userId === demoUserId ? demo.displayName : opponent.displayName;

  // Trade-by-trade table: the actual executions (FILL rows).
  const tradeRows: TradeRow[] = detail.executionEvents
    .filter((e) => e.eventType === "FILL")
    .map((e) => ({
      id: e.id,
      displayName: nameFor(e.userId),
      accent: accentFor(e.userId),
      iso: e.occurredAt,
      side: e.side,
      quantity: e.quantity,
      instrument: e.instrument,
      price: e.price,
      eventType: e.eventType,
    }));

  // Event timeline: entries/exits (position events) + score checkpoints.
  const timeline: TimelineRow[] = [];
  timeline.push({
    id: "tl-start",
    iso: detail.battle.scheduledStart,
    kind: "start",
    accent: null,
    text: `Battle opened on ${detail.battle.market} · ${BATTLE_WINDOW_LABELS[detail.battle.battleWindow].split(" · ")[0]}`,
  });
  for (const e of detail.executionEvents) {
    if (e.eventType === "POSITION_OPENED") {
      timeline.push({
        id: `tl-${e.id}`,
        iso: e.occurredAt,
        kind: "entry",
        accent: accentFor(e.userId),
        text: `${nameFor(e.userId)} opened ${e.side === "BUY" ? "long" : "short"} ${e.quantity} ${e.instrument} @ ${e.price.toLocaleString("en-US")}`,
      });
    } else if (e.eventType === "POSITION_CLOSED") {
      timeline.push({
        id: `tl-${e.id}`,
        iso: e.occurredAt,
        kind: "exit",
        accent: accentFor(e.userId),
        text: `${nameFor(e.userId)} closed ${e.quantity} ${e.instrument} @ ${e.price.toLocaleString("en-US")}`,
      });
    }
  }
  // Score checkpoints from paired timeline points (non-final). The last
  // fully-paired point is the final bell even if it lands short of durationMin.
  const pairedPoints = scoreSeries.filter(
    (p) => p.demo !== null && p.opponent !== null,
  );
  const lastPairedMin = pairedPoints.at(-1)?.elapsedMin ?? -1;
  for (const point of scoreSeries) {
    if (point.demo === null || point.opponent === null) continue;
    const isFinal =
      point.elapsedMin >= durationMin || point.elapsedMin === lastPairedMin;
    const leaderName =
      point.demo >= point.opponent ? demo.displayName : opponent.displayName;
    const leaderAccent: TraderAccent =
      point.demo >= point.opponent ? "demo" : "opponent";
    timeline.push({
      id: `tl-check-${point.elapsedMin}`,
      iso: new Date(startMs + point.elapsedMin * 60_000).toISOString(),
      kind: isFinal ? "final" : "checkpoint",
      accent: leaderAccent,
      text: isFinal
        ? `Final bell — ${leaderName} takes the battle ${Math.max(point.demo, point.opponent).toFixed(1)} to ${Math.min(point.demo, point.opponent).toFixed(1)}`
        : `${leaderName} leads on score ${Math.max(point.demo, point.opponent).toFixed(1)} to ${Math.min(point.demo, point.opponent).toFixed(1)}`,
    });
  }
  timeline.sort((x, y) => Date.parse(x.iso) - Date.parse(y.iso));

  const headline = demo.won
    ? `${demo.displayName} defeats ${opponent.displayName}`
    : `${opponent.displayName} defeats ${demo.displayName}`;

  return {
    battleId: detail.battle.id,
    market: detail.battle.market,
    marketLabel: MARKET_LABELS[detail.battle.market],
    windowLabel: BATTLE_WINDOW_LABELS[detail.battle.battleWindow],
    dateLabel: formatDate(detail.battle.scheduledStart),
    headline,
    startTimestampMs: startMs,
    durationMin,
    demo,
    opponent,
    narrative,
    pnlSeries,
    drawdownSeries,
    scoreSeries,
    tradeRows,
    timeline,
  };
}
