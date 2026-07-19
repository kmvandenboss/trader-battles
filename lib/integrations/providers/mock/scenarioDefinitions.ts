/**
 * Mock-provider scenario definitions — the authored demo battle scripts.
 *
 * THE ONLY PLACE demo trading activity is authored. Each scenario is a
 * deterministic script: one shared NQ price tape (anchor points the seeded
 * generator interpolates between) plus both participants' planned trades.
 * Fill prices are read off the tape at anchored minutes, so the authored
 * economics (P&L, drawdown, violations) are exact and replay identically for
 * a given seed.
 *
 * The three scenarios required by docs/PRODUCT_BRIEF.md ("Mock Simulation
 * Requirements") are selectable from Demo Controls via the registry in
 * lib/battles/scenarios.ts.
 *
 * All activity generated from these scripts is SIMULATED demo data.
 */

import type { BattleType, BattleWindow, Market } from "@/lib/data/schema";

export const SCENARIO_IDS = [
  "discipline-beats-raw-profit",
  "comeback-victory",
  "aggression-backfires",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export type ParticipantKey = "demo" | "opponent";

/** A planned round trip. Entry/exit minutes MUST be tape anchor minutes. */
export interface PlannedTrade {
  participant: ParticipantKey;
  direction: "LONG" | "SHORT";
  quantity: number;
  entryMinute: number;
  exitMinute: number;
}

/** [minute, price] — the tape passes exactly through every anchor. */
export type TapeAnchor = readonly [minute: number, price: number];

export interface MockScenarioDefinition {
  id: ScenarioId;
  title: string;
  description: string;
  /** PRNG seed — the ONLY randomness source for this scenario. */
  seed: number;
  market: Market;
  battleType: BattleType;
  battleWindow: BattleWindow;
  /** ISO date the simulated session is timestamped on. */
  sessionDate: string;
  anchors: readonly TapeAnchor[];
  trades: readonly PlannedTrade[];
  expectedWinner: ParticipantKey;
}

// ---------------------------------------------------------------------------
// Scenario 1 — Discipline beats raw profit
// DeltaHunter out-earns KevinV on gross and net P&L but burns far more
// drawdown and takes discipline penalties (revenge size-up, oversized trade).
// KevinV's controlled, lower-risk session wins on normalized score — the
// product's core thesis, mirroring the brief's worked example.
// ---------------------------------------------------------------------------

const DISCIPLINE_BEATS_RAW_PROFIT: MockScenarioDefinition = {
  id: "discipline-beats-raw-profit",
  title: "Discipline beats raw profit",
  description:
    "DeltaHunter earns more gross profit, but heavy drawdown and rule penalties cost him. KevinV wins on normalized score.",
  seed: 0x51c0de01,
  market: "NQ",
  battleType: "LIVE_PERFORMANCE",
  battleWindow: "MIDDAY",
  sessionDate: "2026-07-17",
  anchors: [
    [0, 24610.0],
    [3, 24618.0],
    [4, 24612.25],
    [9, 24607.5],
    [11, 24606.5],
    [15, 24624.0],
    [17, 24622.0],
    [24, 24615.25],
    [27, 24617.0],
    [28, 24610.0],
    [33, 24618.0],
    [41, 24628.0],
    [44, 24626.0],
    [50, 24640.0],
    [52, 24645.0],
    [56, 24653.0],
    [58, 24648.5],
    [60, 24651.5],
    [63, 24648.75],
    [65, 24652.0],
    [73, 24637.75],
    [80, 24658.0],
    [84, 24660.0],
    [87, 24656.75],
    [88, 24653.0],
    [90, 24655.0],
    [93, 24657.5],
    [96, 24660.0],
    [103, 24672.0],
    [110, 24666.25],
    [112, 24673.0],
    [116, 24669.0],
    [120, 24671.0],
  ],
  trades: [
    // KevinV — five controlled trades, one size-up lapse after a loss.
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 4, exitMinute: 17 },
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 27, exitMinute: 41 },
    { participant: "demo", direction: "SHORT", quantity: 1, entryMinute: 52, exitMinute: 60 },
    { participant: "demo", direction: "LONG", quantity: 2, entryMinute: 63, exitMinute: 87 },
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 96, exitMinute: 110 },
    // DeltaHunter — bigger size, bigger swings, revenge size-up + 5-lot trade.
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 3, exitMinute: 11 },
    { participant: "opponent", direction: "LONG", quantity: 2, entryMinute: 15, exitMinute: 24 },
    { participant: "opponent", direction: "LONG", quantity: 3, entryMinute: 28, exitMinute: 44 },
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 50, exitMinute: 58 },
    { participant: "opponent", direction: "LONG", quantity: 2, entryMinute: 65, exitMinute: 80 },
    { participant: "opponent", direction: "LONG", quantity: 5, entryMinute: 84, exitMinute: 90 },
    { participant: "opponent", direction: "LONG", quantity: 2, entryMinute: 93, exitMinute: 112 },
  ],
  expectedWinner: "demo",
};

// ---------------------------------------------------------------------------
// Scenario 2 — Comeback victory
// KevinV loses his first two 2-lot trades and falls well behind. He cuts
// size to a single contract, rebuilds through four disciplined winners, and
// takes the lead late while DeltaHunter fights the trend and fades.
// ---------------------------------------------------------------------------

const COMEBACK_VICTORY: MockScenarioDefinition = {
  id: "comeback-victory",
  title: "Comeback victory",
  description:
    "KevinV falls behind early, reduces risk, and grinds back to win late. DeltaHunter fades after a hot start.",
  seed: 0x51c0de02,
  market: "NQ",
  battleType: "LIVE_PERFORMANCE",
  battleWindow: "MIDDAY",
  sessionDate: "2026-07-17",
  anchors: [
    [0, 24600.0],
    [4, 24602.0],
    [5, 24601.0],
    [9, 24605.0],
    [14, 24592.0],
    [16, 24590.0],
    [20, 24588.0],
    [22, 24592.0],
    [27, 24581.0],
    [30, 24583.0],
    [36, 24578.0],
    [42, 24571.0],
    [50, 24565.0],
    [55, 24562.0],
    [58, 24560.0],
    [65, 24568.0],
    [70, 24574.0],
    [75, 24580.0],
    [79, 24578.0],
    [82, 24585.0],
    [83, 24586.0],
    [90, 24593.0],
    [95, 24598.0],
    [101, 24601.0],
    [105, 24605.0],
    [106, 24606.0],
    [114, 24612.0],
    [117, 24615.0],
    [120, 24613.0],
  ],
  trades: [
    // KevinV — two 2-lot losses, then single-contract recovery.
    { participant: "demo", direction: "LONG", quantity: 2, entryMinute: 5, exitMinute: 14 },
    { participant: "demo", direction: "LONG", quantity: 2, entryMinute: 20, exitMinute: 27 },
    { participant: "demo", direction: "SHORT", quantity: 1, entryMinute: 36, exitMinute: 50 },
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 58, exitMinute: 75 },
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 82, exitMinute: 101 },
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 105, exitMinute: 114 },
    // DeltaHunter — rides the sell-off, then fights the recovery.
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 4, exitMinute: 16 },
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 30, exitMinute: 42 },
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 55, exitMinute: 70 },
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 83, exitMinute: 95 },
    { participant: "opponent", direction: "LONG", quantity: 1, entryMinute: 106, exitMinute: 117 },
  ],
  expectedWinner: "demo",
};

// ---------------------------------------------------------------------------
// Scenario 3 — Aggression backfires
// KevinV sizes up after losses (revenge sizing, twice), briefly holds a big
// P&L lead after a 4-lot winner, then gives it all back on an oversized
// 5-lot trade. DeltaHunter's small, steady session wins on score.
// ---------------------------------------------------------------------------

const AGGRESSION_BACKFIRES: MockScenarioDefinition = {
  id: "aggression-backfires",
  title: "Aggression backfires",
  description:
    "KevinV sizes up after losses, takes discipline penalties, and loses despite briefly holding the P&L lead.",
  seed: 0x51c0de03,
  market: "NQ",
  battleType: "LIVE_PERFORMANCE",
  battleWindow: "MIDDAY",
  sessionDate: "2026-07-17",
  anchors: [
    [0, 24610.0],
    [5, 24610.0],
    [8, 24608.0],
    [12, 24601.0],
    [15, 24598.0],
    [20, 24598.0],
    [24, 24590.0],
    [28, 24585.0],
    [30, 24587.0],
    [34, 24582.0],
    [40, 24596.0],
    [45, 24610.0],
    [52, 24615.0],
    [55, 24618.0],
    [60, 24610.0],
    [64, 24603.0],
    [68, 24600.0],
    [70, 24600.0],
    [75, 24603.0],
    [81, 24594.0],
    [85, 24596.0],
    [88, 24590.0],
    [92, 24596.0],
    [99, 24585.0],
    [108, 24584.0],
    [112, 24588.0],
    [120, 24590.0],
  ],
  trades: [
    // KevinV — escalating size after losses: 1 -> 2 -> 4 -> 5 -> 3 -> 2.
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 5, exitMinute: 12 },
    { participant: "demo", direction: "LONG", quantity: 2, entryMinute: 15, exitMinute: 24 },
    { participant: "demo", direction: "LONG", quantity: 4, entryMinute: 28, exitMinute: 45 },
    { participant: "demo", direction: "LONG", quantity: 5, entryMinute: 52, exitMinute: 64 },
    { participant: "demo", direction: "LONG", quantity: 3, entryMinute: 70, exitMinute: 81 },
    { participant: "demo", direction: "SHORT", quantity: 2, entryMinute: 88, exitMinute: 99 },
    // DeltaHunter — five single-contract trades, small drawdown.
    { participant: "opponent", direction: "SHORT", quantity: 1, entryMinute: 8, exitMinute: 20 },
    { participant: "opponent", direction: "LONG", quantity: 1, entryMinute: 30, exitMinute: 40 },
    { participant: "opponent", direction: "LONG", quantity: 1, entryMinute: 55, exitMinute: 60 },
    { participant: "opponent", direction: "LONG", quantity: 1, entryMinute: 75, exitMinute: 85 },
    { participant: "opponent", direction: "SHORT", quantity: 1, entryMinute: 92, exitMinute: 108 },
  ],
  expectedWinner: "opponent",
};

export const MOCK_SCENARIOS: Record<ScenarioId, MockScenarioDefinition> = {
  "discipline-beats-raw-profit": DISCIPLINE_BEATS_RAW_PROFIT,
  "comeback-victory": COMEBACK_VICTORY,
  "aggression-backfires": AGGRESSION_BACKFIRES,
};

export function getMockScenario(id: ScenarioId): MockScenarioDefinition {
  return MOCK_SCENARIOS[id];
}

export function isScenarioId(value: string): value is ScenarioId {
  return (SCENARIO_IDS as readonly string[]).includes(value);
}
