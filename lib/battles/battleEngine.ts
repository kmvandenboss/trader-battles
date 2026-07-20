/**
 * battleEngine — orchestrates a live battle from provider events to scores.
 *
 * Consumes a deterministic battle script (price tape + raw provider events
 * for both participants), pushes every execution through the SAME ingestion
 * pipeline real integrations will use (lib/executions/processExecutionEvent),
 * derives `BattleMetricsInput` per participant at every step, and calls the
 * authoritative scoring engine (lib/scoring) — the engine NEVER computes
 * scores itself, and neither may the UI.
 *
 * Stepping API (Phase 4's BattleClock/tick loop drives this):
 *   createBattleState(scenarioId, source?) -> initial serializable state
 *   advanceBattle(state, steps)            -> consume next N timeline items
 *   advanceBattleToTime(state, elapsedMs)  -> catch up to a battle clock time
 *   advanceBattleToEnd(state)              -> "finish battle immediately"
 *   getBattleProgress(state)               -> clock/progress for the header
 *
 * Every function returns a NEW state; states are plain JSON-serializable
 * snapshots, so pause/resume/reset and future SSE transport need no engine
 * changes. The timeline comes from an injected `BattleScriptSource`
 * (lib/battles/battleScript.ts) — the mock provider's source is only the
 * demo DEFAULT; a live deployment registers a source built on a real
 * provider's streams and nothing in this file changes.
 */

import {
  calculateBattleScore,
  type BattleMetricsInput,
  type BattleRiskLimits,
  type BattleScoreResult,
  type DisciplineViolation,
  type DisciplineViolationType,
} from "@/lib/scoring/calculateBattleScore";
import {
  calculateRatingChange,
  type RatingChangeResult,
} from "@/lib/ratings/calculateRatingChange";
import {
  createPipelineState,
  derivePipelineMetrics,
  markPipelineToMarket,
  processExecutionEvent,
  type ExecutionPipelineState,
} from "@/lib/executions/processExecutionEvent";
import type {
  BattleType,
  BattleWindow,
  Market,
} from "@/lib/data/schema";
import {
  DRAWDOWN_ALERT_FRACTIONS,
  TIME_REMAINING_MARKERS_MINUTES,
} from "./battleRules";
import {
  getBattleScriptSource,
  registerBattleScriptSource,
  type BattleScript,
  type BattleScriptSource,
} from "./battleScript";
// Demo default only — injected like matchmaking's default queue. The engine
// itself is provider-agnostic; any registered BattleScriptSource works.
import { MOCK_BATTLE_SCRIPT_SOURCE } from "@/lib/integrations/providers/mock/mockEventGenerator";

registerBattleScriptSource(MOCK_BATTLE_SCRIPT_SOURCE);

/** Resolve the (deterministic) script a battle state was created from. */
function scriptFor(state: BattleEngineState): BattleScript {
  return getBattleScriptSource(state.scriptSourceId).getScript(
    state.scenarioId,
  );
}

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export type BattleFeedEventType =
  | "BATTLE_START"
  | "ENTRY"
  | "SCALE_IN"
  | "SCALE_OUT"
  | "EXIT"
  | "LEAD_CHANGE"
  | "DRAWDOWN_ALERT"
  | "DISCIPLINE_PENALTY"
  | "TIME_REMAINING"
  | "COMMENTARY"
  | "BATTLE_END";

export interface BattleFeedEvent {
  id: string;
  sequence: number;
  type: BattleFeedEventType;
  timestampMs: number;
  elapsedMs: number;
  /** null = battle-level event (time markers, commentary, start/end). */
  userId: string | null;
  message: string;
  data: Record<string, string | number | boolean | null>;
}

export interface ParticipantHistoryPoint {
  elapsedMs: number;
  score: number;
  netPnl: number;
  equity: number;
  drawdown: number;
  /** Signed open contracts. */
  position: number;
}

export interface BattleParticipantState {
  userId: string;
  displayName: string;
  firmName: string;
  rating: number;
  accountLabel: string;
  limits: BattleRiskLimits;
  pipeline: ExecutionPipelineState;
  /** Authoritative score at the current clock (server-side computed). */
  score: BattleScoreResult;
  metrics: BattleMetricsInput;
  netPnl: number;
  maxDrawdown: number;
  currentDrawdown: number;
  riskUtilization: number;
  openPosition: number;
  tradeCount: number;
  violationTypesSeen: DisciplineViolationType[];
  drawdownAlertsFired: number[];
  disciplinedCloseCommentaryCount: number;
  history: ParticipantHistoryPoint[];
}

export interface BattleParticipantResult {
  userId: string;
  displayName: string;
  firmName: string;
  result: "WIN" | "LOSS" | "DRAW";
  finalScore: BattleScoreResult;
  metrics: BattleMetricsInput;
  netPnl: number;
  maxDrawdown: number;
  tradeCount: number;
  riskUtilization: number;
  violations: DisciplineViolation[];
  ratingChange: RatingChangeResult;
  /** "Why you won / lost" bullets for the result screen. */
  reasons: string[];
}

export interface BattleFinalResult {
  battleId: string;
  /** Script id within its source (demo: one of the three scenario ids). */
  scenarioId: string;
  /** null on a draw. */
  winnerUserId: string | null;
  headline: string;
  leadChanges: number;
  participants: [BattleParticipantResult, BattleParticipantResult];
}

export interface ProjectedRatingSide {
  userId: string;
  displayName: string;
  /** Provisional outcome if the battle ended at the current clock. */
  result: "WIN" | "LOSS" | "DRAW";
  change: number;
  newRating: number;
}

/**
 * Engine-computed projection of the rating movement *if the battle ended now*.
 * Uses the same authoritative `calculateRatingChange` as the final result, with
 * `completionRatio` = fraction of the battle elapsed, so the projected movement
 * grows toward the true value as the clock runs. The UI only displays this — it
 * never computes rating math (Rule 4). `null` once the battle is COMPLETED
 * (the real `finalResult` supersedes it).
 */
export interface BattleRatingProjection {
  /** 0–1 fraction of the battle elapsed; movement scales with this. */
  completionRatio: number;
  /** True when scores are effectively level — no meaningful projection yet. */
  tied: boolean;
  demo: ProjectedRatingSide;
  opponent: ProjectedRatingSide;
}

export interface BattleEngineState {
  /** Script id within its source (demo: one of the three scenario ids). */
  scenarioId: string;
  /** Which registered BattleScriptSource supplies the timeline ("mock"). */
  scriptSourceId: string;
  battleId: string;
  market: Market;
  battleType: BattleType;
  battleWindow: BattleWindow;
  startTimestampMs: number;
  durationMs: number;
  status: "LIVE" | "COMPLETED";
  /** Next timeline index to consume (the script is re-derived per call). */
  cursor: number;
  /** Elapsed battle time in ms. */
  clockMs: number;
  demoUserId: string;
  opponentUserId: string;
  participants: Record<string, BattleParticipantState>;
  /** Current battle-score leader (with hysteresis; null before separation). */
  leaderUserId: string | null;
  /** Current net-P&L leader (tracked for narrative/analysis). */
  pnlLeaderUserId: string | null;
  leadChanges: number;
  feed: BattleFeedEvent[];
  feedSequence: number;
  timeMarkersFired: number[];
  commentaryCheckpointsFired: number[];
  finalResult: BattleFinalResult | null;
  /** Pre-final "rating on the line" projection; null once COMPLETED. */
  projection: BattleRatingProjection | null;
}

// ---------------------------------------------------------------------------
// Formatting helpers (feed strings only — no scoring math here)
// ---------------------------------------------------------------------------

function fmtSignedUsd(value: number): string {
  const sign = value < 0 ? "-" : "+";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function fmtUsd(value: number): string {
  return `$${Math.abs(Math.round(value)).toLocaleString("en-US")}`;
}

const VIOLATION_PHRASES: Record<DisciplineViolationType, string> = {
  CONTRACT_LIMIT_EXCEEDED: "a contract-limit penalty",
  EXCESSIVE_CONTRACT_SIZE: "an oversized-position penalty",
  REVENGE_SIZING: "a rapid size-up penalty",
  OVERTRADING: "an overtrading penalty",
  DAILY_LOSS_VIOLATION: "a daily-loss-limit penalty",
};

/** Minimum score gap before the leader flips (prevents feed flapping). */
const LEAD_HYSTERESIS_POINTS = 0.75;

// ---------------------------------------------------------------------------
// State construction
// ---------------------------------------------------------------------------

function computeScore(
  pipeline: ExecutionPipelineState,
  limits: BattleRiskLimits,
  elapsedMs: number,
): { metrics: BattleMetricsInput; score: BattleScoreResult } {
  const metrics = derivePipelineMetrics(
    pipeline,
    limits,
    Math.max(elapsedMs, 60_000),
  );
  // The ONLY score source in the entire battle flow: lib/scoring.
  return { metrics, score: calculateBattleScore(metrics) };
}

export function createBattleState(
  scenarioId: string,
  source: BattleScriptSource = MOCK_BATTLE_SCRIPT_SOURCE,
): BattleEngineState {
  registerBattleScriptSource(source);
  const script = source.getScript(scenarioId);
  const participants: Record<string, BattleParticipantState> = {};
  for (const scripted of script.participants) {
    const pipeline = createPipelineState(script.market, {
      severeDrawdownThreshold: scripted.severeDrawdownThreshold,
    });
    const { metrics, score } = computeScore(pipeline, scripted.limits, 0);
    participants[scripted.userId] = {
      userId: scripted.userId,
      displayName: scripted.displayName,
      firmName: scripted.firmName,
      rating: scripted.rating,
      accountLabel: scripted.accountLabel,
      limits: scripted.limits,
      pipeline,
      score,
      metrics,
      netPnl: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      riskUtilization: 0,
      openPosition: 0,
      tradeCount: 0,
      violationTypesSeen: [],
      drawdownAlertsFired: [],
      disciplinedCloseCommentaryCount: 0,
      history: [],
    };
  }

  const [demo, opponent] = script.participants;
  const state: BattleEngineState = {
    scenarioId,
    scriptSourceId: source.id,
    battleId: script.battleId,
    market: script.market,
    battleType: script.battleType,
    battleWindow: script.battleWindow,
    startTimestampMs: script.startTimestampMs,
    durationMs: script.durationMs,
    status: "LIVE",
    cursor: 0,
    clockMs: 0,
    demoUserId: demo.userId,
    opponentUserId: opponent.userId,
    participants,
    leaderUserId: null,
    pnlLeaderUserId: null,
    leadChanges: 0,
    feed: [],
    feedSequence: 0,
    timeMarkersFired: [],
    commentaryCheckpointsFired: [],
    finalResult: null,
    projection: null,
  };

  pushFeed(state, "BATTLE_START", script.startTimestampMs, null, {
    message: `Battle live: ${demo.displayName} vs ${opponent.displayName} — ${script.market}, ${Math.round(script.durationMs / 60_000)} minutes. Simulated demo data.`,
    data: { scenarioId },
  });
  pushFeed(state, "COMMENTARY", script.startTimestampMs, null, {
    message: `Both traders start flat. Normalized scoring is live — performance, risk efficiency, discipline, and consistency all count.`,
    data: {},
  });
  computeProjection(state);
  return state;
}

// ---------------------------------------------------------------------------
// Feed helpers (mutate the working draft — public API stays pure)
// ---------------------------------------------------------------------------

function pushFeed(
  state: BattleEngineState,
  type: BattleFeedEventType,
  timestampMs: number,
  userId: string | null,
  entry: {
    message: string;
    data: Record<string, string | number | boolean | null>;
  },
): void {
  state.feedSequence += 1;
  state.feed.push({
    id: `${state.battleId}-feed-${state.feedSequence}`,
    sequence: state.feedSequence,
    type,
    timestampMs,
    elapsedMs: Math.max(0, timestampMs - state.startTimestampMs),
    userId,
    message: entry.message,
    data: entry.data,
  });
}

function otherUserId(state: BattleEngineState, userId: string): string {
  return userId === state.demoUserId ? state.opponentUserId : state.demoUserId;
}

// ---------------------------------------------------------------------------
// Step checks
// ---------------------------------------------------------------------------

function refreshDerived(participant: BattleParticipantState): void {
  const ledger = participant.pipeline.ledger;
  participant.netPnl = ledger.equity;
  participant.maxDrawdown = ledger.maxDrawdown;
  participant.currentDrawdown =
    Math.round((ledger.peakEquity - ledger.equity) * 100) / 100;
  participant.riskUtilization =
    participant.limits.permittedRisk > 0
      ? Math.min(
          1,
          Math.round(
            (ledger.maxDrawdown / participant.limits.permittedRisk) * 100,
          ) / 100,
        )
      : 0;
  participant.openPosition = ledger.open
    ? ledger.open.side === "LONG"
      ? ledger.open.quantity
      : -ledger.open.quantity
    : 0;
  participant.tradeCount = ledger.trades.length;
}

function rescore(
  participant: BattleParticipantState,
  elapsedMs: number,
): void {
  const { metrics, score } = computeScore(
    participant.pipeline,
    participant.limits,
    elapsedMs,
  );
  participant.metrics = metrics;
  participant.score = score;
  refreshDerived(participant);
}

function checkViolations(
  state: BattleEngineState,
  participant: BattleParticipantState,
  timestampMs: number,
): void {
  const current = participant.score.components.discipline.violations;
  for (const violation of current) {
    if (participant.violationTypesSeen.includes(violation.type)) continue;
    participant.violationTypesSeen.push(violation.type);
    pushFeed(state, "DISCIPLINE_PENALTY", timestampMs, participant.userId, {
      message: `${participant.displayName} received ${VIOLATION_PHRASES[violation.type]} (-${violation.penalty} discipline).`,
      data: { violationType: violation.type, penalty: violation.penalty },
    });
    pushFeed(state, "COMMENTARY", timestampMs, participant.userId, {
      message: `${violation.detail} Discipline penalties are weighing on ${participant.displayName}'s score.`,
      data: { violationType: violation.type },
    });
  }
}

function checkDrawdownAlerts(
  state: BattleEngineState,
  participant: BattleParticipantState,
  timestampMs: number,
): void {
  for (const fraction of DRAWDOWN_ALERT_FRACTIONS) {
    if (participant.drawdownAlertsFired.includes(fraction)) continue;
    const threshold = participant.limits.permittedRisk * fraction;
    if (participant.currentDrawdown >= threshold) {
      participant.drawdownAlertsFired.push(fraction);
      pushFeed(state, "DRAWDOWN_ALERT", timestampMs, participant.userId, {
        message: `${participant.displayName}'s drawdown increased to ${fmtUsd(participant.currentDrawdown)} (${Math.round(fraction * 100)}% of permitted risk).`,
        data: {
          drawdown: participant.currentDrawdown,
          fraction,
        },
      });
    }
  }
}

function leadReason(
  leader: BattleParticipantState,
  trailer: BattleParticipantState,
): string {
  if (leader.maxDrawdown < trailer.maxDrawdown) return "with lower drawdown";
  if (
    leader.score.components.discipline.score >
    trailer.score.components.discipline.score
  ) {
    return "on cleaner discipline";
  }
  if (leader.netPnl > trailer.netPnl) return "on stronger P&L";
  return "on overall efficiency";
}

function checkLeadChange(
  state: BattleEngineState,
  timestampMs: number,
): void {
  const demo = state.participants[state.demoUserId];
  const opponent = state.participants[state.opponentUserId];

  // Net-P&L leader (analysis only — score decides the battle).
  const pnlGap = demo.netPnl - opponent.netPnl;
  if (Math.abs(pnlGap) > 1) {
    state.pnlLeaderUserId = pnlGap > 0 ? demo.userId : opponent.userId;
  }

  const gap = demo.score.total - opponent.score.total;
  if (Math.abs(gap) < LEAD_HYSTERESIS_POINTS) return;
  const leaderId = gap > 0 ? demo.userId : opponent.userId;
  if (leaderId === state.leaderUserId) return;

  const leader = state.participants[leaderId];
  const trailer = state.participants[otherUserId(state, leaderId)];
  const isChange = state.leaderUserId !== null;
  state.leaderUserId = leaderId;
  if (isChange) state.leadChanges += 1;

  pushFeed(state, "LEAD_CHANGE", timestampMs, leaderId, {
    message: isChange
      ? `${leader.displayName} took the lead.`
      : `${leader.displayName} leads early.`,
    data: {
      leaderScore: leader.score.total,
      trailerScore: trailer.score.total,
    },
  });
  pushFeed(state, "COMMENTARY", timestampMs, leaderId, {
    message: `${leader.displayName} has taken the lead ${leadReason(leader, trailer)} (${leader.score.total.toFixed(1)} vs ${trailer.score.total.toFixed(1)}).`,
    data: {},
  });
}

function checkTimeMarkers(
  state: BattleEngineState,
  timestampMs: number,
): void {
  const remainingMinutes = (state.durationMs - state.clockMs) / 60_000;
  for (const marker of TIME_REMAINING_MARKERS_MINUTES) {
    if (marker * 60_000 >= state.durationMs) continue;
    if (state.timeMarkersFired.includes(marker)) continue;
    if (remainingMinutes <= marker && remainingMinutes > 0) {
      state.timeMarkersFired.push(marker);
      pushFeed(state, "TIME_REMAINING", timestampMs, null, {
        message: `${marker} minutes remaining.`,
        data: { minutesRemaining: marker },
      });
    }
  }
}

/** Interpretive commentary at fixed checkpoints (every 30 elapsed minutes). */
function checkCommentaryCheckpoints(
  state: BattleEngineState,
  timestampMs: number,
): void {
  const elapsedMinutes = Math.floor(state.clockMs / 60_000);
  const checkpoint = Math.floor(elapsedMinutes / 30) * 30;
  if (checkpoint <= 0 || checkpoint >= state.durationMs / 60_000) return;
  if (state.commentaryCheckpointsFired.includes(checkpoint)) return;
  if (elapsedMinutes < checkpoint) return;
  state.commentaryCheckpointsFired.push(checkpoint);

  const demo = state.participants[state.demoUserId];
  const opponent = state.participants[state.opponentUserId];
  const gap = Math.abs(demo.score.total - opponent.score.total);
  const leader = demo.score.total >= opponent.score.total ? demo : opponent;
  const trailer = leader === demo ? opponent : demo;

  let message: string;
  if (trailer.netPnl > leader.netPnl + 1) {
    message = `${trailer.displayName} has generated more gross profit but is using substantially more risk — ${leader.displayName} leads on normalized score.`;
  } else if (gap < 3) {
    message = `The battle remains close (${leader.score.total.toFixed(1)} vs ${trailer.score.total.toFixed(1)}). A major drawdown could decide the result.`;
  } else {
    message = `${leader.displayName} leads ${leader.score.total.toFixed(1)} to ${trailer.score.total.toFixed(1)} — controlled drawdown and clean execution are paying.`;
  }
  pushFeed(state, "COMMENTARY", timestampMs, null, {
    message,
    data: { checkpointMinute: checkpoint },
  });
}

// ---------------------------------------------------------------------------
// Timeline item application
// ---------------------------------------------------------------------------

function applyPriceItem(
  state: BattleEngineState,
  timestampMs: number,
  price: number,
): void {
  state.clockMs = Math.min(
    state.durationMs,
    Math.max(state.clockMs, timestampMs - state.startTimestampMs),
  );
  for (const userId of [state.demoUserId, state.opponentUserId]) {
    const participant = state.participants[userId];
    participant.pipeline = markPipelineToMarket(
      participant.pipeline,
      price,
      timestampMs,
    );
    rescore(participant, state.clockMs);
    participant.history.push({
      elapsedMs: state.clockMs,
      score: participant.score.total,
      netPnl: participant.netPnl,
      equity: participant.pipeline.ledger.equity,
      drawdown: participant.currentDrawdown,
      position: participant.openPosition,
    });
    checkDrawdownAlerts(state, participant, timestampMs);
    checkViolations(state, participant, timestampMs);
  }
  checkLeadChange(state, timestampMs);
  checkTimeMarkers(state, timestampMs);
  checkCommentaryCheckpoints(state, timestampMs);
}

function positionPhrase(position: number): string {
  if (position === 0) return "flat";
  const side = position > 0 ? "long" : "short";
  return `${side} ${Math.abs(position)}`;
}

function applyExecutionItem(
  state: BattleEngineState,
  timestampMs: number,
  record: unknown,
  userId: string,
): void {
  const participant = state.participants[userId];
  const positionBefore = participant.openPosition;
  const result = processExecutionEvent(participant.pipeline, record);
  participant.pipeline = result.state;
  if (result.outcome === "REJECTED" || result.outcome === "DUPLICATE") {
    // Rejected events never reach the ledger; duplicates were applied once
    // already. Pipeline counters keep the audit trail — nothing to score.
    return;
  }
  state.clockMs = Math.min(
    state.durationMs,
    Math.max(state.clockMs, timestampMs - state.startTimestampMs),
  );
  if (result.outcome === "RECORDED") return; // orders etc. — no fill

  rescore(participant, state.clockMs);
  const positionAfter = participant.openPosition;
  const price = result.event?.price ?? 0;

  if (positionBefore === 0 && positionAfter !== 0) {
    pushFeed(state, "ENTRY", timestampMs, userId, {
      message: `${participant.displayName} entered ${positionPhrase(positionAfter)} ${state.market} @ ${price}.`,
      data: { position: positionAfter, price },
    });
  } else if (Math.abs(positionAfter) > Math.abs(positionBefore)) {
    pushFeed(state, "SCALE_IN", timestampMs, userId, {
      message: `${participant.displayName} added — now ${positionPhrase(positionAfter)} ${state.market} @ ${price}.`,
      data: { position: positionAfter, price },
    });
  } else if (positionAfter !== 0) {
    pushFeed(state, "SCALE_OUT", timestampMs, userId, {
      message: `${participant.displayName} reduced to ${positionPhrase(positionAfter)} ${state.market} @ ${price}.`,
      data: { position: positionAfter, price },
    });
  } else {
    const trades = participant.pipeline.ledger.trades;
    const closed = trades[trades.length - 1];
    const realized = closed ? closed.realizedPnl : 0;
    pushFeed(state, "EXIT", timestampMs, userId, {
      message: `${participant.displayName} closed for ${fmtSignedUsd(realized)}.`,
      data: { realizedPnl: realized, price },
    });
    // Brief-style commentary: rewarded for closing green without sizing up.
    if (
      closed &&
      realized > 0 &&
      trades.length >= 2 &&
      closed.size <= trades[trades.length - 2].size &&
      participant.disciplinedCloseCommentaryCount < 2
    ) {
      participant.disciplinedCloseCommentaryCount += 1;
      pushFeed(state, "COMMENTARY", timestampMs, userId, {
        message: `${participant.displayName}'s score improved after closing a profitable trade without increasing size.`,
        data: {},
      });
    }
  }

  checkViolations(state, participant, timestampMs);
  checkDrawdownAlerts(state, participant, timestampMs);
  checkLeadChange(state, timestampMs);
}

// ---------------------------------------------------------------------------
// Pre-final rating projection
// ---------------------------------------------------------------------------

/**
 * Recompute `state.projection` — what the rating change WOULD be if the battle
 * ended at the current clock. Cleared once COMPLETED (finalResult takes over).
 * Every number comes from the authoritative `calculateRatingChange`; nothing
 * here (and nothing in the UI) invents rating math.
 */
function computeProjection(state: BattleEngineState): void {
  if (state.status === "COMPLETED") {
    state.projection = null;
    return;
  }
  const demo = state.participants[state.demoUserId];
  const opponent = state.participants[state.opponentUserId];
  const completionRatio = Math.min(1, state.clockMs / state.durationMs);
  const gap = demo.score.total - opponent.score.total;
  const tied = Math.abs(gap) < LEAD_HYSTERESIS_POINTS;
  const demoResult: "WIN" | "LOSS" | "DRAW" =
    tied ? "DRAW" : gap > 0 ? "WIN" : "LOSS";
  const opponentResult: "WIN" | "LOSS" | "DRAW" =
    demoResult === "WIN" ? "LOSS" : demoResult === "LOSS" ? "WIN" : "DRAW";

  const projectSide = (
    self: BattleParticipantState,
    other: BattleParticipantState,
    result: "WIN" | "LOSS" | "DRAW",
  ): ProjectedRatingSide => {
    const rc = calculateRatingChange({
      playerRating: self.rating,
      opponentRating: other.rating,
      playerScore: self.score.total,
      opponentScore: other.score.total,
      result,
      completionRatio,
      playerViolationCount: self.score.components.discipline.violations.length,
    });
    return {
      userId: self.userId,
      displayName: self.displayName,
      result,
      change: rc.change,
      newRating: rc.newRating,
    };
  };

  state.projection = {
    completionRatio,
    tied,
    demo: projectSide(demo, opponent, demoResult),
    opponent: projectSide(opponent, demo, opponentResult),
  };
}

// ---------------------------------------------------------------------------
// Finalization
// ---------------------------------------------------------------------------

function buildReasons(
  self: BattleParticipantState,
  other: BattleParticipantState,
  won: boolean,
): string[] {
  const reasons: string[] = [];
  const selfScore = self.score;
  const otherScore = other.score;

  if (won && other.netPnl > self.netPnl) {
    reasons.push(
      `Won with less raw P&L (${fmtSignedUsd(self.netPnl)} vs ${fmtSignedUsd(other.netPnl)}) — normalized scoring rewarded efficiency over gross dollars.`,
    );
  }
  if (!won && self.netPnl > other.netPnl) {
    reasons.push(
      `Out-earned the opponent on net P&L (${fmtSignedUsd(self.netPnl)} vs ${fmtSignedUsd(other.netPnl)}) but gave the edge back through drawdown and penalties.`,
    );
  }
  if (self.maxDrawdown !== other.maxDrawdown) {
    reasons.push(
      `Max drawdown ${fmtUsd(self.maxDrawdown)} (${Math.round(self.riskUtilization * 100)}% of permitted risk) vs opponent's ${fmtUsd(other.maxDrawdown)}.`,
    );
  }
  const componentPairs: Array<[string, number, number]> = [
    [
      "Performance",
      selfScore.components.performance.score,
      otherScore.components.performance.score,
    ],
    [
      "Risk efficiency",
      selfScore.components.riskEfficiency.score,
      otherScore.components.riskEfficiency.score,
    ],
    [
      "Discipline",
      selfScore.components.discipline.score,
      otherScore.components.discipline.score,
    ],
    [
      "Consistency",
      selfScore.components.consistency.score,
      otherScore.components.consistency.score,
    ],
  ];
  for (const [label, selfValue, otherValue] of componentPairs) {
    const diff = selfValue - otherValue;
    if (Math.abs(diff) >= 5 && (diff > 0) === won) {
      reasons.push(
        `${label}: ${selfValue.toFixed(1)} vs ${otherValue.toFixed(1)}.`,
      );
    }
  }
  const violations = selfScore.components.discipline.violations;
  if (violations.length === 0 && otherScore.components.discipline.violations.length > 0) {
    reasons.push(
      `Zero rule violations while the opponent took ${otherScore.components.discipline.violations.length}.`,
    );
  } else if (violations.length > 0) {
    reasons.push(
      `Discipline penalties: ${violations.map((v) => v.label.toLowerCase()).join(", ")} (-${selfScore.components.discipline.totalPenalty} points).`,
    );
  }
  return reasons.slice(0, 5);
}

function finalize(state: BattleEngineState, timestampMs: number): void {
  if (state.finalResult) return;
  state.clockMs = state.durationMs;

  const demo = state.participants[state.demoUserId];
  const opponent = state.participants[state.opponentUserId];
  for (const participant of [demo, opponent]) {
    rescore(participant, state.durationMs);
    checkViolations(state, participant, timestampMs);
  }
  checkLeadChange(state, timestampMs);

  const gap = demo.score.total - opponent.score.total;
  const isDraw = Math.abs(gap) < 0.005;
  const winner = isDraw ? null : gap > 0 ? demo : opponent;
  const loser = winner === null ? null : winner === demo ? opponent : demo;

  const resultFor = (p: BattleParticipantState): "WIN" | "LOSS" | "DRAW" =>
    isDraw ? "DRAW" : p === winner ? "WIN" : "LOSS";

  const buildParticipantResult = (
    self: BattleParticipantState,
    other: BattleParticipantState,
  ): BattleParticipantResult => {
    const result = resultFor(self);
    const ratingChange = calculateRatingChange({
      playerRating: self.rating,
      opponentRating: other.rating,
      playerScore: self.score.total,
      opponentScore: other.score.total,
      result,
      completionRatio: 1,
      playerViolationCount:
        self.score.components.discipline.violations.length,
    });
    return {
      userId: self.userId,
      displayName: self.displayName,
      firmName: self.firmName,
      result,
      finalScore: self.score,
      metrics: self.metrics,
      netPnl: self.netPnl,
      maxDrawdown: self.maxDrawdown,
      tradeCount: self.tradeCount,
      riskUtilization: self.riskUtilization,
      violations: self.score.components.discipline.violations,
      ratingChange,
      reasons: buildReasons(self, other, result === "WIN"),
    };
  };

  const headline = isDraw
    ? `Final: ${demo.displayName} ${demo.score.total.toFixed(1)} — ${opponent.displayName} ${opponent.score.total.toFixed(1)}. Draw.`
    : `Final: ${winner!.displayName} ${winner!.score.total.toFixed(1)} defeats ${loser!.displayName} ${loser!.score.total.toFixed(1)}.`;

  state.finalResult = {
    battleId: state.battleId,
    scenarioId: state.scenarioId,
    winnerUserId: winner?.userId ?? null,
    headline,
    leadChanges: state.leadChanges,
    participants: [
      buildParticipantResult(demo, opponent),
      buildParticipantResult(opponent, demo),
    ],
  };
  state.status = "COMPLETED";

  pushFeed(state, "BATTLE_END", timestampMs, winner?.userId ?? null, {
    message: headline,
    data: {
      winnerUserId: winner?.userId ?? null,
      demoScore: demo.score.total,
      opponentScore: opponent.score.total,
    },
  });
  if (winner && loser) {
    pushFeed(state, "COMMENTARY", timestampMs, winner.userId, {
      message:
        loser.netPnl > winner.netPnl
          ? `${loser.displayName} made more gross dollars, but ${winner.displayName}'s lower drawdown and cleaner discipline won the battle — that is the whole point of normalized scoring.`
          : `${winner.displayName} closes it out: better numbers across the board with risk under control.`,
      data: {},
    });
  }
}

// ---------------------------------------------------------------------------
// Stepping API (drives the Live Battle screen's tick loop in Phase 4)
// ---------------------------------------------------------------------------

function cloneState(state: BattleEngineState): BattleEngineState {
  return structuredClone(state);
}

/** Consume up to `steps` timeline items. Finalizes when the script ends. */
export function advanceBattle(
  state: BattleEngineState,
  steps = 1,
): BattleEngineState {
  if (state.status === "COMPLETED" || steps <= 0) return state;
  const script = scriptFor(state);
  const next = cloneState(state);
  let consumed = 0;
  while (consumed < steps && next.cursor < script.timeline.length) {
    const item = script.timeline[next.cursor];
    next.cursor += 1;
    consumed += 1;
    if (item.kind === "PRICE") {
      applyPriceItem(next, item.timestampMs, item.price);
    } else {
      const participant = script.participants.find(
        (p) => p.key === item.participantKey,
      );
      if (participant) {
        applyExecutionItem(
          next,
          item.timestampMs,
          item.record,
          participant.userId,
        );
      }
    }
  }
  if (next.cursor >= script.timeline.length) {
    finalize(next, next.startTimestampMs + next.durationMs);
  }
  computeProjection(next);
  return next;
}

/** Catch the battle up to a battle-clock time (ms since battle start). */
export function advanceBattleToTime(
  state: BattleEngineState,
  elapsedMs: number,
): BattleEngineState {
  if (state.status === "COMPLETED") return state;
  const script = scriptFor(state);
  const targetTimestampMs =
    state.startTimestampMs + Math.min(elapsedMs, state.durationMs);
  let steps = 0;
  for (let i = state.cursor; i < script.timeline.length; i++) {
    if (script.timeline[i].timestampMs > targetTimestampMs) break;
    steps += 1;
  }
  const next = steps > 0 ? advanceBattle(state, steps) : cloneState(state);
  if (elapsedMs >= state.durationMs && next.status !== "COMPLETED") {
    finalize(next, next.startTimestampMs + next.durationMs);
  }
  computeProjection(next);
  return next;
}

/** Demo Controls "Finish battle immediately". */
export function advanceBattleToEnd(
  state: BattleEngineState,
): BattleEngineState {
  return advanceBattleToTime(state, state.durationMs);
}

export interface BattleProgress {
  elapsedMs: number;
  durationMs: number;
  remainingMs: number;
  fractionComplete: number;
  itemsProcessed: number;
  totalItems: number;
  status: "LIVE" | "COMPLETED";
}

export function getBattleProgress(state: BattleEngineState): BattleProgress {
  const script = scriptFor(state);
  return {
    elapsedMs: state.clockMs,
    durationMs: state.durationMs,
    remainingMs: Math.max(0, state.durationMs - state.clockMs),
    fractionComplete: Math.min(1, state.clockMs / state.durationMs),
    itemsProcessed: state.cursor,
    totalItems: script.timeline.length,
    status: state.status,
  };
}

/** Feed entries after a sequence number (incremental UI reads). */
export function getFeedSince(
  state: BattleEngineState,
  afterSequence: number,
): BattleFeedEvent[] {
  return state.feed.filter((event) => event.sequence > afterSequence);
}
