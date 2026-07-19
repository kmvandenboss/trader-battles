/**
 * mockEventGenerator — deterministic battle-activity generation.
 *
 * Turns an authored scenario definition into a full battle script:
 *   - a realistic per-minute NQ price path (seeded mulberry32 jitter between
 *     authored anchors, snapped to the 0.25 tick — NEVER unseeded randomness),
 *   - raw provider execution events (orders + fills, commissions, contract
 *     symbols) for BOTH participants,
 *   - one intentionally re-delivered fill per battle, so the pipeline's
 *     deduplication stage is exercised on every demo run.
 *
 * Raw events are emitted in the provider-adapter shape (`RawExecutionRecord`)
 * and MUST go through lib/executions/processExecutionEvent — the battle
 * engine cannot tell this activity apart from a future real provider's.
 *
 * Price ticks are market data, not executions: real integrations also source
 * quotes separately from fills, so the tape rides alongside the event stream
 * in the script timeline.
 */

import { mulberry32, randInt, type SeededRng } from "@/lib/data/seed/rng";
import type { Market } from "@/lib/data/schema";
import {
  BATTLE_WINDOW_DURATIONS_MS,
  BATTLE_WINDOW_START_UTC,
  COMMISSION_PER_SIDE,
  MFFU_50K_RAPID,
  TRADEIFY_50K_ADVANCED,
  severeDrawdownThresholdFor,
  type AccountRuleSet,
} from "@/lib/battles/battleRules";
import type { RawExecutionRecord } from "@/lib/integrations/types";
import type {
  BattlePricePoint,
  BattleScript,
  BattleScriptParticipant,
  BattleScriptSource,
  BattleScriptTimelineItem,
} from "@/lib/battles/battleScript";
import {
  getMockScenario,
  isScenarioId,
  type MockScenarioDefinition,
  type ParticipantKey,
  type PlannedTrade,
  type ScenarioId,
} from "./scenarioDefinitions";

// ---------------------------------------------------------------------------
// Script shapes — the provider-agnostic contract from lib/battles/battleScript
// (aliased so existing mock-side call sites keep their names).
// ---------------------------------------------------------------------------

export type ScriptParticipant = BattleScriptParticipant;
export type PricePoint = BattlePricePoint;
export type ScriptTimelineItem = BattleScriptTimelineItem;
export type MockBattleScript = BattleScript;

// ---------------------------------------------------------------------------
// Demo participants (specs locked by CLAUDE.md; accounts match the seed)
// ---------------------------------------------------------------------------

function buildParticipant(
  key: ParticipantKey,
  userId: string,
  displayName: string,
  firmName: string,
  rating: number,
  account: AccountRuleSet,
): ScriptParticipant {
  return {
    key,
    userId,
    displayName,
    firmName,
    rating,
    accountId: account.externalAccountId,
    accountLabel: account.accountLabel,
    limits: account.limits,
    severeDrawdownThreshold: severeDrawdownThresholdFor(account.limits),
  };
}

export const DEMO_PARTICIPANT = buildParticipant(
  "demo",
  "user-kevinv",
  "KevinV",
  "MFFU",
  1684,
  MFFU_50K_RAPID,
);

export const OPPONENT_PARTICIPANT = buildParticipant(
  "opponent",
  "user-deltahunter",
  "DeltaHunter",
  "Tradeify",
  1712,
  TRADEIFY_50K_ADVANCED,
);

// ---------------------------------------------------------------------------
// Price path
// ---------------------------------------------------------------------------

const TICK_SIZE = 0.25;
/** Max seeded jitter (points) applied between anchors; zero AT anchors. */
const MAX_JITTER_POINTS = 1.0;

function snapToTick(price: number): number {
  return Math.round(price / TICK_SIZE) * TICK_SIZE;
}

/**
 * Build the per-minute tape: exact at every anchor, linear interpolation plus
 * seeded, hump-shaped jitter in between (so fills at anchored minutes match
 * the authored economics exactly).
 */
export function buildPricePath(
  rng: SeededRng,
  anchors: readonly (readonly [number, number])[],
  totalMinutes: number,
  startTimestampMs: number,
): PricePoint[] {
  const sorted = [...anchors].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i][0] === sorted[i - 1][0]) {
      throw new Error(
        `scenario tape error: duplicate anchor at minute ${sorted[i][0]}`,
      );
    }
  }
  if (sorted[0][0] !== 0) sorted.unshift([0, sorted[0][1]]);
  const last = sorted[sorted.length - 1];
  if (last[0] > totalMinutes) {
    throw new Error(
      `scenario tape error: anchor minute ${last[0]} beyond battle end ${totalMinutes}`,
    );
  }
  if (last[0] < totalMinutes) sorted.push([totalMinutes, last[1]]);

  const path: PricePoint[] = [];
  let segment = 0;
  for (let minute = 0; minute <= totalMinutes; minute++) {
    while (segment < sorted.length - 2 && sorted[segment + 1][0] <= minute) {
      segment++;
    }
    const [m0, p0] = sorted[segment];
    const [m1, p1] = sorted[Math.min(segment + 1, sorted.length - 1)];
    let price: number;
    if (minute === m0 || m1 === m0) {
      price = p0;
    } else if (minute === m1) {
      price = p1;
    } else {
      const fraction = (minute - m0) / (m1 - m0);
      const base = p0 + (p1 - p0) * fraction;
      // Hump-shaped amplitude: zero at both anchors, max mid-segment.
      const amplitude = MAX_JITTER_POINTS * 4 * fraction * (1 - fraction);
      price = snapToTick(base + (rng() * 2 - 1) * amplitude);
    }
    path.push({
      minute,
      timestampMs: startTimestampMs + minute * 60_000,
      price,
    });
  }
  return path;
}

// ---------------------------------------------------------------------------
// Execution events
// ---------------------------------------------------------------------------

/** Mock provider ships dated contract symbols to exercise normalization. */
function contractSymbolFor(market: Market): string {
  return `${market}U6`; // September 2026 contract
}

function isoAt(timestampMs: number): string {
  return new Date(timestampMs).toISOString();
}

interface TradeLeg {
  legLabel: "entry" | "exit";
  side: "BUY" | "SELL";
  minute: number;
}

function buildTradeEvents(
  scenario: MockScenarioDefinition,
  participant: ScriptParticipant,
  trade: PlannedTrade,
  tradeIndex: number,
  priceAtMinute: Map<number, number>,
  startTimestampMs: number,
  rng: SeededRng,
): ScriptTimelineItem[] {
  const legs: TradeLeg[] = [
    {
      legLabel: "entry",
      side: trade.direction === "LONG" ? "BUY" : "SELL",
      minute: trade.entryMinute,
    },
    {
      legLabel: "exit",
      side: trade.direction === "LONG" ? "SELL" : "BUY",
      minute: trade.exitMinute,
    },
  ];

  const items: ScriptTimelineItem[] = [];
  for (const leg of legs) {
    const price = priceAtMinute.get(leg.minute);
    if (price === undefined) {
      throw new Error(
        `scenario error: trade ${tradeIndex} (${participant.key}) ${leg.legLabel} minute ${leg.minute} is not a tape anchor`,
      );
    }
    const fillTimestampMs = startTimestampMs + leg.minute * 60_000;
    const orderTimestampMs = fillTimestampMs - randInt(rng, 8, 40) * 1000;
    const idBase = `${scenario.id}:${participant.key}:t${tradeIndex}:${leg.legLabel}`;
    const symbol = contractSymbolFor(scenario.market);

    const orderRecord: RawExecutionRecord = {
      providerEventId: `${idBase}:order`,
      sourceProvider: "mock",
      accountId: participant.accountId,
      instrument: symbol,
      side: leg.side,
      quantity: trade.quantity,
      price,
      commission: 0,
      occurredAt: isoAt(orderTimestampMs),
      eventType: "ORDER_SUBMITTED",
      verificationStatus: "SIMULATED",
      rawPayload: { simulated: true, scenario: scenario.id, leg: leg.legLabel },
    };
    const fillRecord: RawExecutionRecord = {
      providerEventId: `${idBase}:fill`,
      sourceProvider: "mock",
      accountId: participant.accountId,
      instrument: symbol,
      side: leg.side,
      quantity: trade.quantity,
      price,
      commission: Math.round(COMMISSION_PER_SIDE * trade.quantity * 100) / 100,
      occurredAt: isoAt(fillTimestampMs),
      eventType: "FILL",
      verificationStatus: "SIMULATED",
      rawPayload: { simulated: true, scenario: scenario.id, leg: leg.legLabel },
    };

    items.push(
      {
        kind: "EXECUTION",
        timestampMs: orderTimestampMs,
        participantKey: participant.key,
        record: orderRecord,
      },
      {
        kind: "EXECUTION",
        timestampMs: fillTimestampMs,
        participantKey: participant.key,
        record: fillRecord,
      },
    );
  }
  return items;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Memoized scripts: the Phase 4 tick loop resolves the script roughly every
 * second, and generation is fully deterministic per scenario id, so building
 * each scenario once per process is safe. Scripts are treated as immutable
 * by every consumer (the engine clones only its own state).
 */
const scriptCache = new Map<ScenarioId, MockBattleScript>();

/**
 * Generate the full deterministic battle script for a scenario. Same
 * scenario id -> byte-identical script, every time.
 */
export function generateBattleScript(scenarioId: ScenarioId): MockBattleScript {
  const cached = scriptCache.get(scenarioId);
  if (cached) return cached;
  const scenario = getMockScenario(scenarioId);
  const rng = mulberry32(scenario.seed);

  const durationMs = BATTLE_WINDOW_DURATIONS_MS[scenario.battleWindow];
  const totalMinutes = Math.round(durationMs / 60_000);
  const startTimestampMs = Date.parse(
    `${scenario.sessionDate}T${BATTLE_WINDOW_START_UTC[scenario.battleWindow]}.000Z`,
  );

  const pricePath = buildPricePath(
    rng,
    scenario.anchors,
    totalMinutes,
    startTimestampMs,
  );
  const priceAtMinute = new Map(pricePath.map((p) => [p.minute, p.price]));

  const participants: readonly [ScriptParticipant, ScriptParticipant] = [
    DEMO_PARTICIPANT,
    OPPONENT_PARTICIPANT,
  ];
  const byKey: Record<ParticipantKey, ScriptParticipant> = {
    demo: DEMO_PARTICIPANT,
    opponent: OPPONENT_PARTICIPANT,
  };

  const timeline: ScriptTimelineItem[] = pricePath.map((point) => ({
    kind: "PRICE" as const,
    timestampMs: point.timestampMs,
    price: point.price,
  }));

  scenario.trades.forEach((trade, index) => {
    timeline.push(
      ...buildTradeEvents(
        scenario,
        byKey[trade.participant],
        trade,
        index,
        priceAtMinute,
        startTimestampMs,
        rng,
      ),
    );
  });

  // Re-deliver the demo participant's first exit fill 30s later (duplicate
  // providerEventId) — providers do this in real life; dedupe must drop it.
  const firstExitFill = timeline.find(
    (item): item is Extract<ScriptTimelineItem, { kind: "EXECUTION" }> =>
      item.kind === "EXECUTION" &&
      item.participantKey === "demo" &&
      item.record.eventType === "FILL" &&
      item.record.providerEventId.includes(":exit:"),
  );
  if (firstExitFill) {
    timeline.push({
      kind: "EXECUTION",
      timestampMs: firstExitFill.timestampMs + 30_000,
      participantKey: "demo",
      record: { ...firstExitFill.record },
    });
  }

  timeline.sort((a, b) => {
    if (a.timestampMs !== b.timestampMs) return a.timestampMs - b.timestampMs;
    // Price ticks first so fills at a minute boundary mark against that tick.
    if (a.kind !== b.kind) return a.kind === "PRICE" ? -1 : 1;
    if (a.kind === "EXECUTION" && b.kind === "EXECUTION") {
      return a.record.providerEventId.localeCompare(b.record.providerEventId);
    }
    return 0;
  });

  const script: MockBattleScript = {
    scenarioId,
    battleId: `battle-live-${scenarioId}`,
    market: scenario.market,
    battleType: scenario.battleType,
    battleWindow: scenario.battleWindow,
    startTimestampMs,
    durationMs,
    participants,
    pricePath,
    timeline,
    expectedWinnerUserId: byKey[scenario.expectedWinner].userId,
  };
  scriptCache.set(scenarioId, script);
  return script;
}

/**
 * The demo's `BattleScriptSource` — what the battle engine points at by
 * default. A real integration registers its own source built on a live
 * quote + execution transport instead (see lib/battles/battleScript.ts).
 */
export const MOCK_BATTLE_SCRIPT_SOURCE: BattleScriptSource = {
  id: "mock",
  getScript(scriptId: string): MockBattleScript {
    if (!isScenarioId(scriptId)) {
      throw new Error(`mock script source: unknown scenario "${scriptId}"`);
    }
    return generateBattleScript(scriptId);
  },
};
