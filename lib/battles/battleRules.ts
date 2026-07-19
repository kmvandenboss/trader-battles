/**
 * battleRules — the rule configuration a battle is played under.
 *
 * Defines battle windows/durations, per-account risk limits (permitted risk,
 * daily loss limit, max contracts), and derived thresholds (severe drawdown).
 * The scoring engine receives these as `BattleRiskLimits`; the discipline
 * component turns breaches into explicit violations.
 *
 * PLUG-IN POINT FOR REAL INTEGRATIONS: for live accounts these limits will be
 * read from the provider's account snapshot / prop-firm plan instead of the
 * demo constants below. Everything downstream already consumes the same
 * `BattleRiskLimits` shape.
 *
 * Pure data + pure helpers — no I/O, no framework imports.
 */

import type { BattleWindow, Market } from "@/lib/data/schema";
import type { BattleRiskLimits } from "@/lib/scoring/calculateBattleScore";

// ---------------------------------------------------------------------------
// Battle windows
// ---------------------------------------------------------------------------

/** Session length per battle window (ET sessions, per the product brief). */
export const BATTLE_WINDOW_DURATIONS_MS: Record<BattleWindow, number> = {
  OPENING_BELL: 90 * 60_000, // 9:30-11:00 ET
  MIDDAY: 120 * 60_000, // 11:00-13:00 ET
  AFTERNOON: 150 * 60_000, // 13:00-15:30 ET
  FULL_SESSION: 390 * 60_000, // 9:30-16:00 ET
};

/** ET window start expressed in UTC (the demo season falls inside EDT, UTC-4). */
export const BATTLE_WINDOW_START_UTC: Record<BattleWindow, string> = {
  OPENING_BELL: "13:30:00",
  MIDDAY: "15:00:00",
  AFTERNOON: "17:00:00",
  FULL_SESSION: "13:30:00",
};

// ---------------------------------------------------------------------------
// Account rule sets (demo data — no real firm partnership implied)
// ---------------------------------------------------------------------------

export interface AccountRuleSet {
  /** Plan label shown in the UI, e.g. "MFFU 50K Rapid" (Simulated Demo Data). */
  accountLabel: string;
  /** Provider-scoped external account id (matches the seed dataset). */
  externalAccountId: string;
  startingBalance: number;
  limits: BattleRiskLimits;
}

/** KevinV's demo account (matches the seed dataset's MFFU 50K Rapid). */
export const MFFU_50K_RAPID: AccountRuleSet = {
  accountLabel: "MFFU 50K Rapid",
  externalAccountId: "MFFU-50K-84127",
  startingBalance: 50_000,
  limits: {
    permittedRisk: 1250,
    dailyLossLimit: 1250,
    maxContracts: 5,
  },
};

/** DeltaHunter's demo account (matches the seed dataset). */
export const TRADEIFY_50K_ADVANCED: AccountRuleSet = {
  accountLabel: "Tradeify 50K Advanced",
  externalAccountId: "TRADEIFY-50K-31552",
  startingBalance: 50_000,
  limits: {
    permittedRisk: 1500,
    dailyLossLimit: 1500,
    maxContracts: 6,
  },
};

// ---------------------------------------------------------------------------
// Battle-level constants
// ---------------------------------------------------------------------------

/**
 * Drawdown beyond this fraction of permitted risk counts as "severe" — the
 * ledger accumulates time spent there and consistency scoring penalizes it.
 */
export const SEVERE_DRAWDOWN_FRACTION = 0.5;

/** Mock-provider commission per contract per side (matches the seed data). */
export const COMMISSION_PER_SIDE = 2.14;

/** Elapsed minutes at which the engine emits "time remaining" feed markers. */
export const TIME_REMAINING_MARKERS_MINUTES = [60, 30, 15, 5] as const;

/** Drawdown alert levels as fractions of permitted risk (fired once each). */
export const DRAWDOWN_ALERT_FRACTIONS = [0.4, 0.6, 0.8] as const;

export interface BattleRuleConfig {
  market: Market;
  battleWindow: BattleWindow;
  durationMs: number;
  severeDrawdownFraction: number;
}

export function severeDrawdownThresholdFor(limits: BattleRiskLimits): number {
  return limits.permittedRisk * SEVERE_DRAWDOWN_FRACTION;
}
