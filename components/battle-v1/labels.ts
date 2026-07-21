/**
 * Display labels for the v1 scheduled-battle screens (/challenges,
 * /battles/[id]).
 *
 * Pure presentation constants — every value rendered against these maps was
 * computed by the battle/scoring/settlement layers and read from the
 * repositories. The `decidedBy` strings mirror the scoring engine's
 * tiebreaker-cascade tiers (lib/scoring/calculatePnlBattleScore
 * TIEBREAKER_TIERS) WITHOUT importing that module — UI code never imports
 * lib/scoring (Rule 4); the strings are persisted on the battle row and only
 * mapped to friendly copy here.
 */

import type { BattleStatus, VerificationStatus } from "@/lib/data/schema";

/** Account-size brackets a v1 challenge can be matched on. */
export const ACCOUNT_BRACKETS = ["25K", "50K", "100K", "150K"] as const;
export type AccountBracket = (typeof ACCOUNT_BRACKETS)[number];

export const ACCOUNT_BRACKET_LABELS: Record<AccountBracket, string> = {
  "25K": "$25K account",
  "50K": "$50K account",
  "100K": "$100K account",
  "150K": "$150K account",
};

/** Battle lifecycle chip labels ("COMPLETED" reads as Settled on v1 pages). */
export const BATTLE_STATUS_LABELS: Record<BattleStatus, string> = {
  SCHEDULED: "Scheduled",
  MATCHMAKING: "Matchmaking",
  LIVE: "Live",
  SETTLING: "Settling",
  COMPLETED: "Settled",
  CANCELLED: "Cancelled",
};

/**
 * Friendly copy for the persisted tiebreaker-cascade stage that decided a
 * settled PNL_V1 battle (battle.decidedBy). Unknown values fall back to the
 * raw string at the call site.
 */
export const DECIDED_BY_COPY: Record<string, string> = {
  SCORE: "Decided on score",
  REALIZED_PNL: "Decided on realized P&L",
  PROFIT_FACTOR: "Decided on profit factor",
  WINNING_TRADES: "Decided on winning trades",
  TOOK_TRADE: "Decided on activity",
  FIRST_GREEN: "Decided on first to green",
  DEAD_TIE: "Dead tie — draw",
};

/**
 * Honest verification labels (Rule 1): imported data is self-reported —
 * never "Simulated", never "Demo Verified", never claimed broker-verified.
 */
export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  SIMULATED: "Simulated Demo Data",
  SELF_REPORTED: "Self-reported (CSV import)",
  CLIENT_VERIFIED: "Client-verified import",
  PROVIDER_VERIFIED: "Provider-verified",
  MANUALLY_REVIEWED: "Manually reviewed",
  DISPUTED: "Disputed",
};

/** Null market = open instrument choice (the v1 default). */
export const OPEN_INSTRUMENT_LABEL = "Open instrument";

/**
 * The one shared dual-source disclosure for pages that can mix seeded demo
 * content with real imported battles (Rule 1): claims neither that
 * everything is simulated nor that anything is broker-verified.
 */
export const DATA_SOURCE_NOTE =
  "Includes seeded demo traders; imported battles are self-reported.";
