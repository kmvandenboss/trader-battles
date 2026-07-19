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
 * All three run on the demo's "today" (2026-07-18) in the OPENING_BELL
 * window (9:30-11:00 ET, 90 minutes) — deliberately distinct from the seeded
 * showcase battle (2026-07-17, MIDDAY) so a live demo battle reads as a NEW
 * battle, never a duplicate of seeded history.
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
  /** ISO date the simulated session is timestamped on (demo "today"). */
  sessionDate: string;
  anchors: readonly TapeAnchor[];
  trades: readonly PlannedTrade[];
  expectedWinner: ParticipantKey;
}

/** Demo "today" — matches the seed dataset's DEMO_TODAY without importing it. */
const LIVE_SESSION_DATE = "2026-07-18";

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
  battleWindow: "OPENING_BELL",
  sessionDate: LIVE_SESSION_DATE,
  anchors: [
    [0, 24610.0],
    [2, 24618.0],
    [3, 24612.25],
    [7, 24607.5],
    [8, 24606.5],
    [11, 24624.0],
    [13, 24622.0],
    [18, 24615.25],
    [20, 24617.0],
    [21, 24610.0],
    [25, 24618.0],
    [31, 24628.0],
    [33, 24626.0],
    [38, 24640.0],
    [39, 24645.0],
    [42, 24653.0],
    [44, 24648.5],
    [45, 24651.5],
    [47, 24648.75],
    [49, 24652.0],
    [55, 24637.75],
    [60, 24658.0],
    [63, 24660.0],
    [65, 24656.75],
    [66, 24653.0],
    [68, 24655.0],
    [70, 24657.5],
    [72, 24660.0],
    [77, 24672.0],
    [83, 24666.25],
    [84, 24673.0],
    [87, 24669.0],
    [90, 24671.0],
  ],
  trades: [
    // KevinV — five controlled trades, one size-up lapse after a loss.
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 3, exitMinute: 13 },
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 20, exitMinute: 31 },
    { participant: "demo", direction: "SHORT", quantity: 1, entryMinute: 39, exitMinute: 45 },
    { participant: "demo", direction: "LONG", quantity: 2, entryMinute: 47, exitMinute: 65 },
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 72, exitMinute: 83 },
    // DeltaHunter — bigger size, bigger swings, revenge size-up + 5-lot trade.
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 2, exitMinute: 8 },
    { participant: "opponent", direction: "LONG", quantity: 2, entryMinute: 11, exitMinute: 18 },
    { participant: "opponent", direction: "LONG", quantity: 3, entryMinute: 21, exitMinute: 33 },
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 38, exitMinute: 44 },
    { participant: "opponent", direction: "LONG", quantity: 2, entryMinute: 49, exitMinute: 60 },
    { participant: "opponent", direction: "LONG", quantity: 5, entryMinute: 63, exitMinute: 68 },
    { participant: "opponent", direction: "LONG", quantity: 2, entryMinute: 70, exitMinute: 84 },
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
  battleWindow: "OPENING_BELL",
  sessionDate: LIVE_SESSION_DATE,
  anchors: [
    [0, 24600.0],
    [3, 24602.0],
    [4, 24601.0],
    [7, 24605.0],
    [11, 24592.0],
    [12, 24590.0],
    [15, 24588.0],
    [17, 24592.0],
    [20, 24581.0],
    [23, 24583.0],
    [27, 24578.0],
    [32, 24571.0],
    [38, 24565.0],
    [41, 24562.0],
    [44, 24560.0],
    [49, 24568.0],
    [53, 24574.0],
    [56, 24580.0],
    [59, 24578.0],
    [61, 24585.0],
    [62, 24586.0],
    [68, 24593.0],
    [71, 24598.0],
    [76, 24601.0],
    [79, 24605.0],
    [80, 24606.0],
    [86, 24612.0],
    [88, 24615.0],
    [90, 24613.0],
  ],
  trades: [
    // KevinV — two 2-lot losses, then single-contract recovery.
    { participant: "demo", direction: "LONG", quantity: 2, entryMinute: 4, exitMinute: 11 },
    { participant: "demo", direction: "LONG", quantity: 2, entryMinute: 15, exitMinute: 20 },
    { participant: "demo", direction: "SHORT", quantity: 1, entryMinute: 27, exitMinute: 38 },
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 44, exitMinute: 56 },
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 61, exitMinute: 76 },
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 79, exitMinute: 86 },
    // DeltaHunter — rides the sell-off, then fights the recovery.
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 3, exitMinute: 12 },
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 23, exitMinute: 32 },
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 41, exitMinute: 53 },
    { participant: "opponent", direction: "SHORT", quantity: 2, entryMinute: 62, exitMinute: 71 },
    { participant: "opponent", direction: "LONG", quantity: 1, entryMinute: 80, exitMinute: 88 },
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
  battleWindow: "OPENING_BELL",
  sessionDate: LIVE_SESSION_DATE,
  anchors: [
    [0, 24610.0],
    [4, 24610.0],
    [6, 24608.0],
    [9, 24601.0],
    [11, 24598.0],
    [15, 24598.0],
    [18, 24590.0],
    [21, 24585.0],
    [23, 24587.0],
    [26, 24582.0],
    [30, 24596.0],
    [34, 24610.0],
    [39, 24615.0],
    [41, 24618.0],
    [45, 24610.0],
    [48, 24603.0],
    [51, 24600.0],
    [53, 24600.0],
    [56, 24603.0],
    [61, 24594.0],
    [64, 24596.0],
    [66, 24590.0],
    [69, 24596.0],
    [74, 24585.0],
    [81, 24584.0],
    [84, 24588.0],
    [90, 24590.0],
  ],
  trades: [
    // KevinV — escalating size after losses: 1 -> 2 -> 4 -> 5 -> 3 -> 2.
    { participant: "demo", direction: "LONG", quantity: 1, entryMinute: 4, exitMinute: 9 },
    { participant: "demo", direction: "LONG", quantity: 2, entryMinute: 11, exitMinute: 18 },
    { participant: "demo", direction: "LONG", quantity: 4, entryMinute: 21, exitMinute: 34 },
    { participant: "demo", direction: "LONG", quantity: 5, entryMinute: 39, exitMinute: 48 },
    { participant: "demo", direction: "LONG", quantity: 3, entryMinute: 53, exitMinute: 61 },
    { participant: "demo", direction: "SHORT", quantity: 2, entryMinute: 66, exitMinute: 74 },
    // DeltaHunter — five single-contract trades, small drawdown.
    { participant: "opponent", direction: "SHORT", quantity: 1, entryMinute: 6, exitMinute: 15 },
    { participant: "opponent", direction: "LONG", quantity: 1, entryMinute: 23, exitMinute: 30 },
    { participant: "opponent", direction: "LONG", quantity: 1, entryMinute: 41, exitMinute: 45 },
    { participant: "opponent", direction: "LONG", quantity: 1, entryMinute: 56, exitMinute: 64 },
    { participant: "opponent", direction: "SHORT", quantity: 1, entryMinute: 69, exitMinute: 81 },
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
