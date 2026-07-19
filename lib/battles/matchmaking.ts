/**
 * matchmaking — deterministic opponent search with an expanding rating window.
 *
 * Per the product brief ("Matchmaking Logic"): search starts tight around the
 * player's rating and widens over time (±50 -> ±100 -> ±175 points), filtered
 * by market, battle window, battle type, and account compatibility. The demo
 * queue is an authored, deterministic subset of the seed roster, so KevinV's
 * default search always resolves to DeltaHunter — his scripted rival.
 *
 * FUTURE MATCHMAKING FACTORS (plug-in points marked in `scoreCandidate`):
 *   - recent performance / form (last-10 win rate, score trend)
 *   - experience level (battles completed)
 *   - prop-firm rules compatibility (drawdown style, contract caps)
 *   - account size normalization beyond permitted-risk scaling
 *   - geographic / session-time restrictions
 *   - rivalry history (rematch pull like KevinV vs DeltaHunter)
 *   - suspected smurf accounts (rating vs performance mismatch detection)
 *   - match-completion reliability (abandon rate)
 *
 * Pure functions — deterministic for a given request + elapsed time.
 */

import type { BattleType, BattleWindow, Market } from "@/lib/data/schema";
import { ROSTER, userIdFor, type RosterEntry } from "@/lib/data/seed/roster";

// ---------------------------------------------------------------------------
// Rating window expansion
// ---------------------------------------------------------------------------

export interface RatingWindowStage {
  /** Search stays in this stage until this much time has elapsed. */
  untilMs: number;
  /** Maximum |rating difference| accepted during this stage. */
  windowPoints: number;
  statusMessage: string;
}

/** Brief-spec stages: 0-10s ±50, 10-20s ±100, then ±175. */
export const DEFAULT_RATING_STAGES: RatingWindowStage[] = [
  {
    untilMs: 10_000,
    windowPoints: 50,
    statusMessage: "Searching within ±50 rating points…",
  },
  {
    untilMs: 20_000,
    windowPoints: 100,
    statusMessage: "Expanding search to ±100 rating points…",
  },
  {
    untilMs: Number.POSITIVE_INFINITY,
    windowPoints: 175,
    statusMessage: "Widening the net — ±175 rating points…",
  },
];

/** Shortened stages for live demos (same windows, faster expansion). */
export const DEMO_RATING_STAGES: RatingWindowStage[] = [
  { ...DEFAULT_RATING_STAGES[0], untilMs: 3_000 },
  { ...DEFAULT_RATING_STAGES[1], untilMs: 6_000 },
  { ...DEFAULT_RATING_STAGES[2] },
];

export function getRatingWindow(
  elapsedMs: number,
  stages: RatingWindowStage[] = DEFAULT_RATING_STAGES,
): RatingWindowStage {
  for (const stage of stages) {
    if (elapsedMs < stage.untilMs) return stage;
  }
  return stages[stages.length - 1];
}

// ---------------------------------------------------------------------------
// Queue & request shapes
// ---------------------------------------------------------------------------

export interface MatchmakingRequest {
  userId: string;
  rating: number;
  market: Market;
  battleWindow: BattleWindow;
  battleType: BattleType;
}

export interface MatchCandidate {
  userId: string;
  displayName: string;
  rating: number;
  primaryMarket: Market;
  secondaryMarkets: Market[];
  firmSlug: string;
  battleStyle: RosterEntry["battleStyle"];
}

/**
 * The authored demo queue: which roster traders are "searching right now".
 * Deterministic on purpose — DeltaHunter is always queued (scripted rival),
 * and with default settings he is KevinV's closest queued NQ opponent.
 * A production queue would obviously be a live table, not a constant.
 */
const DEMO_QUEUE_ROSTER_IDS = [
  "deltahunter", // 1712 NQ — KevinV's closest queued NQ trader (+28)
  "disciplineddan", // 1652 NQ (-32)
  "nqnomad", // 1731 NQ (+47)
  "morningbellmason", // 1618 NQ (-66; needs the ±100 window)
  "trendtitan", // 1815 NQ (+131; needs the ±175 window)
  "fadetheopen", // 1503 ES
  "macromiles", // 1477 CL
  "scalpsurgeon", // 1978 MNQ
  "rangerider", // 2005 GC
] as const;

export function getDemoQueue(): MatchCandidate[] {
  const queued = new Set<string>(DEMO_QUEUE_ROSTER_IDS);
  return ROSTER.filter((entry) => queued.has(entry.id)).map((entry) => ({
    userId: userIdFor(entry.id),
    displayName: entry.displayName,
    rating: entry.targetRating,
    primaryMarket: entry.primaryMarket,
    secondaryMarkets: entry.secondaryMarkets,
    firmSlug: entry.firmSlug,
    battleStyle: entry.battleStyle,
  }));
}

// ---------------------------------------------------------------------------
// Candidate scoring & search
// ---------------------------------------------------------------------------

function tradesMarket(candidate: MatchCandidate, market: Market): boolean {
  return (
    candidate.primaryMarket === market ||
    candidate.secondaryMarkets.includes(market)
  );
}

/**
 * Lower is better. Rating proximity dominates today; future factors adjust
 * this cost.
 */
function scoreCandidate(
  request: MatchmakingRequest,
  candidate: MatchCandidate,
): number {
  let cost = Math.abs(candidate.rating - request.rating);
  // Prefer opponents whose PRIMARY market matches the requested market.
  if (candidate.primaryMarket !== request.market) cost += 25;
  // FUTURE: recent form — bump cost for mismatched hot/cold streaks.
  // FUTURE: experience level — protect new traders from veterans.
  // FUTURE: prop-firm rules — only match compatible drawdown/contract rules.
  // FUTURE: account size — normalize beyond permitted-risk scaling.
  // FUTURE: geography/session — respect regional session restrictions.
  // FUTURE: rivalry history — small cost REDUCTION for compelling rematches.
  // FUTURE: smurf detection — exclude flagged accounts entirely.
  // FUTURE: completion reliability — penalize frequent abandoners.
  return cost;
}

export type MatchmakingStatus =
  | {
      state: "SEARCHING";
      elapsedMs: number;
      windowPoints: number;
      statusMessage: string;
    }
  | {
      state: "MATCHED";
      elapsedMs: number;
      windowPoints: number;
      opponent: MatchCandidate;
    };

/**
 * Deterministic search: given elapsed queue time, return the best available
 * opponent inside the current rating window, or a SEARCHING status.
 * Candidates must trade the requested market; battle window and battle type
 * are accepted by all demo-queue members (see FUTURE notes above for where
 * stricter filters plug in).
 */
export function searchForOpponent(
  request: MatchmakingRequest,
  elapsedMs: number,
  queue: MatchCandidate[] = getDemoQueue(),
  stages: RatingWindowStage[] = DEFAULT_RATING_STAGES,
): MatchmakingStatus {
  const stage = getRatingWindow(elapsedMs, stages);
  const eligible = queue
    .filter((candidate) => candidate.userId !== request.userId)
    .filter((candidate) => tradesMarket(candidate, request.market))
    .filter(
      (candidate) =>
        Math.abs(candidate.rating - request.rating) <= stage.windowPoints,
    );

  if (eligible.length === 0) {
    return {
      state: "SEARCHING",
      elapsedMs,
      windowPoints: stage.windowPoints,
      statusMessage: stage.statusMessage,
    };
  }

  const best = [...eligible].sort((a, b) => {
    const costDiff = scoreCandidate(request, a) - scoreCandidate(request, b);
    if (costDiff !== 0) return costDiff;
    return a.userId.localeCompare(b.userId); // deterministic tie-break
  })[0];

  return {
    state: "MATCHED",
    elapsedMs,
    windowPoints: stage.windowPoints,
    opponent: best,
  };
}

// ---------------------------------------------------------------------------
// Matchmaking plan (what the Phase 4 UI plays back)
// ---------------------------------------------------------------------------

export interface MatchmakingTick {
  atMs: number;
  windowPoints: number;
  message: string;
}

export interface MatchmakingPlan {
  request: MatchmakingRequest;
  ticks: MatchmakingTick[];
  matchedAtMs: number;
  opponent: MatchCandidate;
}

/** Minimum searching time before the demo reveals a match (presentation pacing). */
export const DEMO_MIN_SEARCH_MS = 4_000;

/**
 * Precompute the full searching-state sequence for the UI: cycling status
 * messages, window expansions, and the deterministic match. Uses the demo
 * stage timings so a presentation is not stuck waiting, but holds the reveal
 * for a few seconds so the searching state reads as a real queue.
 */
export function createMatchmakingPlan(
  request: MatchmakingRequest,
  queue: MatchCandidate[] = getDemoQueue(),
  stages: RatingWindowStage[] = DEMO_RATING_STAGES,
  minSearchMs: number = DEMO_MIN_SEARCH_MS,
): MatchmakingPlan {
  const probeStepMs = 500;
  const ticks: MatchmakingTick[] = [
    {
      atMs: 0,
      windowPoints: stages[0].windowPoints,
      message: `Searching for opponents near rating ${request.rating.toLocaleString("en-US")}…`,
    },
  ];

  let matched: Extract<MatchmakingStatus, { state: "MATCHED" }> | null = null;
  let lastWindow = stages[0].windowPoints;
  for (let atMs = probeStepMs; atMs <= 60_000; atMs += probeStepMs) {
    const status = searchForOpponent(request, atMs, queue, stages);
    if (status.windowPoints !== lastWindow) {
      lastWindow = status.windowPoints;
      ticks.push({
        atMs,
        windowPoints: status.windowPoints,
        message:
          status.state === "SEARCHING"
            ? status.statusMessage
            : getRatingWindow(atMs, stages).statusMessage,
      });
    }
    if (status.state === "MATCHED" && atMs >= minSearchMs) {
      matched = status;
      break;
    }
  }

  if (!matched) {
    throw new Error(
      "matchmaking: demo queue produced no opponent within 60s — queue authoring error",
    );
  }

  ticks.push({
    atMs: matched.elapsedMs,
    windowPoints: matched.windowPoints,
    message: `Opponent found — verifying account status…`,
  });

  return {
    request,
    ticks,
    matchedAtMs: matched.elapsedMs,
    opponent: matched.opponent,
  };
}
