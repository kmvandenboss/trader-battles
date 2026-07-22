/**
 * V1 battle-report assembler — shapes the persisted telemetry of a SETTLED
 * PNL_V1 (CSV-import) battle into a serializable view model for the detailed
 * report + replay on /battles/[id]. Analogous to components/battle/showcase.ts
 * but for the settle-after-the-fact v1 path (which the demo review redirects
 * away from).
 *
 * IMPORTANT (Rule 4): this module computes NO authoritative scores, ratings,
 * or P&L. Every number is read from an already-settled BattleDetail (the
 * settlement/scoring/rating engines produced them and persisted them via
 * BattleRepository.saveSettlement). The PNL_V1 running score, mark-to-market
 * equity, drawdown and 4-factor components are all read verbatim off the
 * persisted metricTimeline / accountSnapshots / final metric snapshots.
 *
 * FRAMING: PNL_V1 (realized P&L + capped participation bonus) DECIDES the
 * battle. The 4-factor component scores are carried for INSIGHT ONLY and do
 * not affect the result. No gambling language, no profitability claims.
 *
 * Server-only (no "use client"): it hands plain serializable objects to the
 * client replay component and server-rendered charts/tables.
 */

import type { BattleDetail } from "@/lib/data/repositories/types";
import type {
  BattleResult,
  Division,
  League,
  Market,
  VerificationStatus,
} from "@/lib/data/schema";
import {
  buildComponentEdges,
  type ComponentEdge,
  type ComponentKey,
} from "@/lib/battles/reviewNarrative";
import {
  BATTLE_WINDOW_LABELS,
  MARKET_LABELS,
  formatDate,
  formatPoints,
} from "@/components/battle/format";
import type {
  PairPoint,
  TimelineRow,
  TradeRow,
} from "@/components/battle/showcase";
import type { TraderAccent } from "@/components/battle/trader-avatar";

/** Final 4-factor component scores (0-100), carried for insight only. */
export interface FourFactorComponents {
  performance: number;
  riskEfficiency: number;
  discipline: number;
  consistency: number;
}

/** One participant's already-settled numbers, ready to render. */
export interface V1ParticipantReport {
  userId: string;
  displayName: string;
  league: League;
  division: Division;
  accent: TraderAccent;
  result: BattleResult;
  won: boolean;
  /** Headline PNL_V1 score (dollars-points): realized + mark-out + bonus. */
  finalScore: number;
  realizedPnl: number;
  participationBonus: number;
  markOutPnl: number;
  markOutStatus: string | null;
  markOutNote: string | null;
  closedTradeCount: number;
  grossProfit: number;
  /** Stored POSITIVE (dollars lost). */
  grossLoss: number;
  startingRating: number;
  endingRating: number;
  ratingChange: number;
  /** Final 4-factor components (insight only — do not decide the battle). */
  components: FourFactorComponents;
}

/** One 4-factor component's paired progression over the window. */
export interface FourFactorSeries {
  key: ComponentKey;
  label: string;
  data: PairPoint[];
}

export interface V1BattleReport {
  /**
   * False when the settled battle carries no intra-window telemetry (no
   * account snapshots and no non-final metric rows) — the page then skips the
   * detailed section and shows the aggregate SettledPnlResult only.
   */
  hasTelemetry: boolean;
  meta: {
    battleId: string;
    marketLabel: string;
    marketTicker: string;
    windowLabel: string;
    dateLabel: string;
    startTimestampMs: number;
    durationMin: number;
    verificationStatus: VerificationStatus;
    winnerName: string | null;
    decidedBy: string | null;
    resolutionDetail: string | null;
  };
  self: V1ParticipantReport;
  opponent: V1ParticipantReport;
  /** PNL_V1 running score (dollars-points) per side over the window. */
  scoreSeries: PairPoint[];
  /** Mark-to-market P&L (equity: realized + unrealized) per side. */
  pnlSeries: PairPoint[];
  /** Instantaneous drawdown per side. */
  drawdownSeries: PairPoint[];
  /** One paired series per 4-factor component (insight only). */
  fourFactorSeries: FourFactorSeries[];
  /** Final 4-factor edges for ComponentBreakdown (insight only). */
  componentEdges: ComponentEdge[];
  tradeRows: TradeRow[];
  timeline: TimelineRow[];
}

const FOUR_FACTORS: Array<{
  key: ComponentKey;
  label: string;
  field:
    | "performanceScore"
    | "riskEfficiencyScore"
    | "disciplineScore"
    | "consistencyScore";
}> = [
  { key: "performance", label: "Performance", field: "performanceScore" },
  { key: "riskEfficiency", label: "Risk efficiency", field: "riskEfficiencyScore" },
  { key: "discipline", label: "Discipline", field: "disciplineScore" },
  { key: "consistency", label: "Consistency", field: "consistencyScore" },
];

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

/** The FILL instrument used most often — derives the market when unpinned. */
function deriveMarket(detail: BattleDetail): Market | null {
  if (detail.battle.market) return detail.battle.market;
  const first = detail.executionEvents[0];
  return first ? first.instrument : null;
}

export function buildV1BattleReport(
  detail: BattleDetail,
  selfUserId: string,
): V1BattleReport {
  const [a, b] = detail.participants;
  const selfSummary = a.trader.user.id === selfUserId ? a : b;
  const oppSummary = a.trader.user.id === selfUserId ? b : a;

  const selfAccountId = selfSummary.participant.tradingAccountId;
  const selfParticipantId = selfSummary.participant.id;
  const selfId = selfSummary.trader.user.id;

  const startMs = Date.parse(detail.battle.scheduledStart);
  const endIso = detail.battle.endTime ?? detail.battle.scheduledEnd;
  const endMs = endIso ? Date.parse(endIso) : startMs;
  const durationMin = Math.max(1, Math.round((endMs - startMs) / 60_000));

  const market = deriveMarket(detail);
  const marketLabel = market ? MARKET_LABELS[market] : "Open instrument";
  const marketTicker = market ?? "—";

  const winnerName = detail.battle.winnerId
    ? (detail.participants.find(
        (p) => p.participant.userId === detail.battle.winnerId,
      )?.trader.user.displayName ?? null)
    : null;

  const toParticipant = (
    summary: typeof selfSummary,
    accent: TraderAccent,
  ): V1ParticipantReport => {
    const p = summary.participant;
    const m = summary.metrics;
    return {
      userId: summary.trader.user.id,
      displayName: summary.trader.user.displayName,
      league: summary.trader.profile.league,
      division: summary.trader.profile.division,
      accent,
      result: p.result,
      won: p.result === "WIN",
      finalScore: p.finalScore,
      realizedPnl: p.realizedPnl ?? 0,
      participationBonus: p.participationBonus ?? 0,
      markOutPnl: p.markOutPnl ?? 0,
      markOutStatus: p.markOutStatus,
      markOutNote: p.markOutNote,
      closedTradeCount: p.closedTradeCount ?? 0,
      grossProfit: p.grossProfit ?? 0,
      grossLoss: p.grossLoss ?? 0,
      startingRating: p.startingRating,
      endingRating: p.endingRating,
      ratingChange: summary.ratingChange,
      components: {
        performance: m.performanceScore,
        riskEfficiency: m.riskEfficiencyScore,
        discipline: m.disciplineScore,
        consistency: m.consistencyScore,
      },
    };
  };

  const self = toParticipant(selfSummary, "demo");
  const opponent = toParticipant(oppSummary, "opponent");

  const meta: V1BattleReport["meta"] = {
    battleId: detail.battle.id,
    marketLabel,
    marketTicker,
    windowLabel: BATTLE_WINDOW_LABELS[detail.battle.battleWindow],
    dateLabel: formatDate(detail.battle.scheduledStart),
    startTimestampMs: startMs,
    durationMin,
    verificationStatus: detail.battle.verificationStatus,
    winnerName,
    decidedBy: detail.battle.decidedBy,
    resolutionDetail: detail.battle.resolutionDetail,
  };

  const hasTelemetry =
    detail.accountSnapshots.length > 0 ||
    detail.metricTimeline.some((m) => !m.isFinal);

  // Final 4-factor edges are available regardless of intra-window telemetry.
  const componentEdges = buildComponentEdges(
    selfSummary.metrics,
    oppSummary.metrics,
  );

  if (!hasTelemetry) {
    return {
      hasTelemetry: false,
      meta,
      self,
      opponent,
      scoreSeries: [],
      pnlSeries: [],
      drawdownSeries: [],
      fourFactorSeries: [],
      componentEdges,
      tradeRows: [],
      timeline: [],
    };
  }

  // PNL_V1 running score (dollars-points) from the metric timeline.
  const scoreSeries = buildPairSeries(
    detail.metricTimeline.map((m) => ({
      iso: m.timestamp,
      isDemo: m.participantId === selfParticipantId,
      value: m.totalBattleScore,
    })),
    startMs,
  );
  // Mark-to-market P&L uses equity (realized + unrealized) so an open
  // position's mark-out is visible, not just closed realized P&L.
  const pnlSeries = buildPairSeries(
    detail.accountSnapshots.map((s) => ({
      iso: s.timestamp,
      isDemo: s.tradingAccountId === selfAccountId,
      value: s.equity,
    })),
    startMs,
  );
  const drawdownSeries = buildPairSeries(
    detail.accountSnapshots.map((s) => ({
      iso: s.timestamp,
      isDemo: s.tradingAccountId === selfAccountId,
      value: s.drawdown,
    })),
    startMs,
  );

  const fourFactorSeries: FourFactorSeries[] = FOUR_FACTORS.map(
    ({ key, label, field }) => ({
      key,
      label,
      data: buildPairSeries(
        detail.metricTimeline.map((m) => ({
          iso: m.timestamp,
          isDemo: m.participantId === selfParticipantId,
          value: m[field],
        })),
        startMs,
      ),
    }),
  );

  const accentFor = (userId: string): TraderAccent =>
    userId === selfId ? "demo" : "opponent";
  const nameFor = (userId: string): string =>
    userId === selfId ? self.displayName : opponent.displayName;

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

  const timeline = buildTimeline(
    detail,
    startMs,
    durationMin,
    scoreSeries,
    self,
    opponent,
    selfId,
    marketTicker,
  );

  return {
    hasTelemetry: true,
    meta,
    self,
    opponent,
    scoreSeries,
    pnlSeries,
    drawdownSeries,
    fourFactorSeries,
    componentEdges,
    tradeRows,
    timeline,
  };
}

/**
 * Build the event timeline from FILL-only imports. CSV fills carry no
 * POSITION_OPENED/POSITION_CLOSED events, so entries/exits are DERIVED by
 * tracking each user's running signed position: a fill from a flat position
 * opens; a fill that returns the position to flat closes; a same-direction
 * fill scales in; an opposite-direction fill that stays non-zero reduces.
 * Score-lead checkpoints + the final buzzer come from the running PNL_V1 score.
 */
function buildTimeline(
  detail: BattleDetail,
  startMs: number,
  durationMin: number,
  scoreSeries: PairPoint[],
  self: V1ParticipantReport,
  opponent: V1ParticipantReport,
  selfId: string,
  marketTicker: string,
): TimelineRow[] {
  const timeline: TimelineRow[] = [];
  const accentFor = (userId: string): TraderAccent =>
    userId === selfId ? "demo" : "opponent";
  const nameFor = (userId: string): string =>
    userId === selfId ? self.displayName : opponent.displayName;

  timeline.push({
    id: "tl-start",
    iso: detail.battle.scheduledStart,
    kind: "start",
    accent: null,
    text: `Window opened · ${marketTicker} · ${
      BATTLE_WINDOW_LABELS[detail.battle.battleWindow].split(" · ")[0]
    }`,
  });

  // Derive entries/exits by tracking each user's running signed position.
  const positionByUser = new Map<string, number>();
  const fills = detail.executionEvents
    .filter((e) => e.eventType === "FILL")
    .slice()
    .sort((x, y) => Date.parse(x.occurredAt) - Date.parse(y.occurredAt));

  for (const e of fills) {
    const before = positionByUser.get(e.userId) ?? 0;
    const delta = e.side === "BUY" ? e.quantity : -e.quantity;
    const after = before + delta;
    positionByUser.set(e.userId, after);

    const price = e.price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    let kind: "entry" | "exit";
    let verb: string;
    if (before === 0) {
      kind = "entry";
      verb = `opened ${delta > 0 ? "long" : "short"} ${Math.abs(delta)}`;
    } else if (after === 0) {
      kind = "exit";
      verb = `closed ${Math.abs(delta)}`;
    } else if (Math.abs(after) > Math.abs(before)) {
      kind = "entry";
      verb = `added ${Math.abs(delta)} (${after > 0 ? "long" : "short"} ${Math.abs(after)})`;
    } else {
      kind = "exit";
      verb = `reduced ${Math.abs(delta)} (${after > 0 ? "long" : "short"} ${Math.abs(after)})`;
    }
    timeline.push({
      id: `tl-${e.id}`,
      iso: e.occurredAt,
      kind,
      accent: accentFor(e.userId),
      text: `${nameFor(e.userId)} ${verb} ${e.instrument} @ ${price}`,
    });
  }

  // Score-lead checkpoints from paired running-score points. Downsample to a
  // ~30-minute cadence so the timeline stays readable, plus the final buzzer.
  const paired = scoreSeries.filter(
    (p) => p.demo !== null && p.opponent !== null,
  );
  const lastPairedMin = paired.at(-1)?.elapsedMin ?? -1;
  for (const point of paired) {
    if (point.demo === null || point.opponent === null) continue;
    const isFinal =
      point.elapsedMin >= durationMin || point.elapsedMin === lastPairedMin;
    const isCheckpoint =
      point.elapsedMin > 0 && point.elapsedMin % 30 === 0;
    if (!isFinal && !isCheckpoint) continue;
    const demoLeads = point.demo >= point.opponent;
    const leaderName = demoLeads ? self.displayName : opponent.displayName;
    const leaderAccent: TraderAccent = demoLeads ? "demo" : "opponent";
    const hi = Math.max(point.demo, point.opponent);
    const lo = Math.min(point.demo, point.opponent);
    timeline.push({
      id: `tl-check-${point.elapsedMin}`,
      iso: new Date(startMs + point.elapsedMin * 60_000).toISOString(),
      kind: isFinal ? "final" : "checkpoint",
      accent: leaderAccent,
      text: isFinal
        ? `Final buzzer — ${leaderName} settles it ${formatPoints(hi)} to ${formatPoints(lo)}`
        : `${leaderName} leads on running score ${formatPoints(hi)} to ${formatPoints(lo)}`,
    });
  }

  timeline.sort((x, y) => Date.parse(x.iso) - Date.parse(y.iso));
  return timeline;
}
