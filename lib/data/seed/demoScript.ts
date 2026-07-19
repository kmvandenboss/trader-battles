/**
 * Authored season script for the demo user KevinV and his showcase battle
 * against DeltaHunter.
 *
 * These are hand-authored (not generated) so the demo user's story is exact:
 *   - 29 battles, 18W-11L, ending on a 3-win streak (CLAUDE.md spec)
 *   - a 5-win streak early (battles 4-8) -> Five-Win Streak badge
 *   - 9 Opening Bell NQ battles at 7-2 -> "morning NQ" insight card
 *   - a win over TrendTitan (Platinum, ~1815) -> Giant Slayer badge
 *   - final battle vs DeltaHunter mirrors the brief's worked scoring example
 *     (KevinV 83.9 beats DeltaHunter 73.6 despite less gross profit)
 */

import type { BattleType, BattleWindow, Market } from "../schema/enums";

export interface ScriptedBattle {
  /** 1-based battle number in KevinV's season. */
  seq: number;
  result: "W" | "L";
  /** Roster id of the opponent. */
  opponentId: string;
  market: Market;
  window: BattleWindow;
  battleType: BattleType;
}

/**
 * Result string (oldest -> newest):
 *   W W L W W W W W L W | L W L W W L L W L W | L L W L W L W W W
 * = 18W 11L, best streak 5 (battles 4-8), current streak 3W.
 */
export const KEVIN_SEASON: ScriptedBattle[] = [
  { seq: 1, result: "W", opponentId: "morningbellmason", market: "NQ", window: "OPENING_BELL", battleType: "LIVE_PERFORMANCE" },
  { seq: 2, result: "W", opponentId: "disciplineddan", market: "NQ", window: "MIDDAY", battleType: "LIVE_PERFORMANCE" },
  { seq: 3, result: "L", opponentId: "esveteran", market: "ES", window: "AFTERNOON", battleType: "LIVE_PERFORMANCE" },
  { seq: 4, result: "W", opponentId: "closingbellcole", market: "NQ", window: "OPENING_BELL", battleType: "LIVE_PERFORMANCE" },
  { seq: 5, result: "W", opponentId: "volvanguard", market: "NQ", window: "MIDDAY", battleType: "LIVE_PERFORMANCE" },
  { seq: 6, result: "W", opponentId: "sessionsniper", market: "NQ", window: "OPENING_BELL", battleType: "LIVE_PERFORMANCE" },
  { seq: 7, result: "W", opponentId: "steadyhandsam", market: "ES", window: "FULL_SESSION", battleType: "LIVE_PERFORMANCE" },
  { seq: 8, result: "W", opponentId: "basispointben", market: "NQ", window: "OPENING_BELL", battleType: "LIVE_PERFORMANCE" },
  { seq: 9, result: "L", opponentId: "micromomentum", market: "NQ", window: "MIDDAY", battleType: "LIVE_PERFORMANCE" },
  { seq: 10, result: "W", opponentId: "deltahunter", market: "NQ", window: "AFTERNOON", battleType: "LIVE_PERFORMANCE" },
  { seq: 11, result: "L", opponentId: "nqnomad", market: "ES", window: "MIDDAY", battleType: "LIVE_PERFORMANCE" },
  { seq: 12, result: "W", opponentId: "drawdowndefender", market: "NQ", window: "OPENING_BELL", battleType: "LIVE_PERFORMANCE" },
  { seq: 13, result: "L", opponentId: "afternoonace", market: "NQ", window: "AFTERNOON", battleType: "LIVE_PERFORMANCE" },
  { seq: 14, result: "W", opponentId: "trendlinetheo", market: "NQ", window: "OPENING_BELL", battleType: "LIVE_PERFORMANCE" },
  { seq: 15, result: "W", opponentId: "riskrewardrae", market: "ES", window: "MIDDAY", battleType: "DISCIPLINE_BATTLE" },
  { seq: 16, result: "L", opponentId: "deltahunter", market: "NQ", window: "FULL_SESSION", battleType: "LIVE_PERFORMANCE" },
  { seq: 17, result: "L", opponentId: "volvanguard", market: "NQ", window: "MIDDAY", battleType: "LIVE_PERFORMANCE" },
  { seq: 18, result: "W", opponentId: "disciplineddan", market: "NQ", window: "AFTERNOON", battleType: "DISCIPLINE_BATTLE" },
  { seq: 19, result: "L", opponentId: "morningbellmason", market: "NQ", window: "OPENING_BELL", battleType: "LIVE_PERFORMANCE" },
  { seq: 20, result: "W", opponentId: "steadyhandsam", market: "NQ", window: "MIDDAY", battleType: "LIVE_PERFORMANCE" },
  { seq: 21, result: "L", opponentId: "sessionsniper", market: "NQ", window: "OPENING_BELL", battleType: "LIVE_PERFORMANCE" },
  { seq: 22, result: "L", opponentId: "esveteran", market: "ES", window: "MIDDAY", battleType: "LIVE_PERFORMANCE" },
  { seq: 23, result: "W", opponentId: "trendtitan", market: "NQ", window: "AFTERNOON", battleType: "LIVE_PERFORMANCE" },
  { seq: 24, result: "L", opponentId: "micromomentum", market: "NQ", window: "MIDDAY", battleType: "LIVE_PERFORMANCE" },
  { seq: 25, result: "W", opponentId: "nqnomad", market: "NQ", window: "FULL_SESSION", battleType: "LIVE_PERFORMANCE" },
  { seq: 26, result: "L", opponentId: "closingbellcole", market: "ES", window: "AFTERNOON", battleType: "LIVE_PERFORMANCE" },
  { seq: 27, result: "W", opponentId: "drawdowndefender", market: "NQ", window: "OPENING_BELL", battleType: "LIVE_PERFORMANCE" },
  { seq: 28, result: "W", opponentId: "quietaccumulator", market: "NQ", window: "MIDDAY", battleType: "LIVE_PERFORMANCE" },
  { seq: 29, result: "W", opponentId: "deltahunter", market: "NQ", window: "MIDDAY", battleType: "LIVE_PERFORMANCE" },
];

// ---------------------------------------------------------------------------
// Showcase battle (KevinV's battle #29) — the brief's worked scoring example.
// Component scores are authored data mirroring docs/PRODUCT_BRIEF.md; the
// authoritative scoring engine (lib/scoring, Phase 2) will reproduce them
// from execution events for live battles.
// ---------------------------------------------------------------------------

export const SHOWCASE_SCORES = {
  kevinv: {
    performance: 78,
    riskEfficiency: 91,
    discipline: 88,
    consistency: 80,
    total: 83.9,
    maxDrawdown: 410,
    riskUtilization: 0.33,
  },
  deltahunter: {
    performance: 86,
    riskEfficiency: 63,
    discipline: 66,
    consistency: 71,
    total: 73.6,
    maxDrawdown: 1240,
    riskUtilization: 0.72,
  },
} as const;

export interface ShowcaseTrade {
  direction: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  /** Minutes after battle start. */
  entryMinute: number;
  exitMinute: number;
}

/** NQ point value in dollars. */
export const NQ_POINT_VALUE = 20;
/** Commission per contract per side (mock provider fill fee). */
export const COMMISSION_PER_SIDE = 2.14;

/** KevinV: 5 controlled trades, single contract, net ≈ +$778.60. */
export const KEVIN_SHOWCASE_TRADES: ShowcaseTrade[] = [
  { direction: "LONG", quantity: 1, entryPrice: 24612.25, exitPrice: 24622.0, entryMinute: 4, exitMinute: 17 },
  { direction: "LONG", quantity: 1, entryPrice: 24630.5, exitPrice: 24641.25, entryMinute: 26, exitMinute: 41 },
  { direction: "SHORT", quantity: 1, entryPrice: 24655.0, exitPrice: 24661.5, entryMinute: 52, exitMinute: 60 },
  { direction: "LONG", quantity: 1, entryPrice: 24648.75, exitPrice: 24668.5, entryMinute: 68, exitMinute: 87 },
  { direction: "LONG", quantity: 1, entryPrice: 24672.0, exitPrice: 24678.25, entryMinute: 96, exitMinute: 110 },
];

/** DeltaHunter: 7 trades at 2-3 contracts, net ≈ +$912.24, heavy drawdown. */
export const DELTA_SHOWCASE_TRADES: ShowcaseTrade[] = [
  { direction: "SHORT", quantity: 2, entryPrice: 24618.0, exitPrice: 24606.5, entryMinute: 3, exitMinute: 11 },
  { direction: "LONG", quantity: 3, entryPrice: 24624.0, exitPrice: 24615.25, entryMinute: 15, exitMinute: 24 },
  { direction: "LONG", quantity: 3, entryPrice: 24610.0, exitPrice: 24626.0, entryMinute: 28, exitMinute: 44 },
  { direction: "SHORT", quantity: 2, entryPrice: 24640.0, exitPrice: 24648.5, entryMinute: 50, exitMinute: 58 },
  { direction: "LONG", quantity: 2, entryPrice: 24652.0, exitPrice: 24657.75, entryMinute: 63, exitMinute: 75 },
  { direction: "LONG", quantity: 3, entryPrice: 24660.0, exitPrice: 24655.0, entryMinute: 80, exitMinute: 88 },
  { direction: "LONG", quantity: 2, entryPrice: 24657.5, exitPrice: 24670.0, entryMinute: 93, exitMinute: 112 },
];

/** Realized P&L for one showcase trade, net of commissions. */
export function tradePnl(trade: ShowcaseTrade): number {
  const sign = trade.direction === "LONG" ? 1 : -1;
  const gross =
    sign * (trade.exitPrice - trade.entryPrice) * NQ_POINT_VALUE * trade.quantity;
  const commissions = COMMISSION_PER_SIDE * trade.quantity * 2;
  return Math.round((gross - commissions) * 100) / 100;
}

/** Total net P&L for a showcase trade list. */
export function totalPnl(trades: ShowcaseTrade[]): number {
  return (
    Math.round(trades.reduce((sum, t) => sum + tradePnl(t), 0) * 100) / 100
  );
}
