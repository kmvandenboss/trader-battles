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
  ASIA: 240 * 60_000, // 20:00-24:00 ET
};

/** ET window start expressed in UTC (the demo season falls inside EDT, UTC-4). */
export const BATTLE_WINDOW_START_UTC: Record<BattleWindow, string> = {
  OPENING_BELL: "13:30:00",
  MIDDAY: "15:00:00",
  AFTERNOON: "17:00:00",
  FULL_SESSION: "13:30:00",
  // 20:00 EDT = 00:00 UTC the FOLLOWING day. This time-of-day string can't
  // carry the +1-day roll; windowBoundsUtc() is the authoritative source for
  // Asia's UTC instant. Asia is not used by the demo/mock engine yet.
  ASIA: "00:00:00",
};

// ---------------------------------------------------------------------------
// Account rule sets (demo data — no real firm partnership implied)
// ---------------------------------------------------------------------------

export interface AccountRuleSet {
  /** Plan label shown in the UI, e.g. "50K Rapid" (Simulated Demo Data). */
  accountLabel: string;
  /** Provider-scoped external account id (matches the seed dataset). */
  externalAccountId: string;
  startingBalance: number;
  limits: BattleRiskLimits;
}

/** KevinV's demo account (matches the seed dataset's 50K Rapid). */
export const MFFU_50K_RAPID: AccountRuleSet = {
  accountLabel: "50K Rapid",
  externalAccountId: "SIM-50K-84127",
  startingBalance: 50_000,
  limits: {
    permittedRisk: 1250,
    dailyLossLimit: 1250,
    maxContracts: 5,
  },
};

/** DeltaHunter's demo account (matches the seed dataset). */
export const TRADEIFY_50K_ADVANCED: AccountRuleSet = {
  accountLabel: "50K Rapid",
  externalAccountId: "SIM-50K-31552",
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

// ---------------------------------------------------------------------------
// Bracket → risk limits (v1 4-factor insight reconstruction)
// ---------------------------------------------------------------------------

/**
 * Risk limits by account-size bracket, used ONLY to feed the retained
 * 4-factor engine when reconstructing v1 telemetry for INSIGHT (the PNL_V1
 * outcome never consults these). Values scale off MFFU's 50K Rapid demo plan
 * ($1,250 permitted risk, 5 contracts) — a defensible per-bracket default
 * until real per-account plan data flows in behind this same shape.
 *
 * PLUG-IN POINT FOR REAL INTEGRATIONS: replace this table with the account's
 * actual prop-firm plan limits; everything downstream already consumes
 * `BattleRiskLimits`.
 */
export const BRACKET_RISK_LIMITS: Record<string, BattleRiskLimits> = {
  "25K": { permittedRisk: 625, dailyLossLimit: 625, maxContracts: 3 },
  "50K": { permittedRisk: 1250, dailyLossLimit: 1250, maxContracts: 5 },
  "100K": { permittedRisk: 2500, dailyLossLimit: 2500, maxContracts: 10 },
  "150K": { permittedRisk: 3750, dailyLossLimit: 3750, maxContracts: 15 },
};

/** Fallback when a battle's bracket is null/unmatched (mirrors 50K Rapid). */
export const DEFAULT_BRACKET_RISK_LIMITS: BattleRiskLimits =
  MFFU_50K_RAPID.limits;

/**
 * Resolve the `BattleRiskLimits` for an account-size bracket label
 * (case-insensitive, whitespace-trimmed). Unknown/absent brackets fall back
 * to the 50K Rapid default so scoring never divides by an undefined budget.
 */
export function riskLimitsForBracket(
  bracket: string | null | undefined,
): BattleRiskLimits {
  if (!bracket) return DEFAULT_BRACKET_RISK_LIMITS;
  const normalized = bracket.trim().toUpperCase();
  return BRACKET_RISK_LIMITS[normalized] ?? DEFAULT_BRACKET_RISK_LIMITS;
}
