/**
 * Authored trader roster — fixed, human-reviewed inputs to the seed build.
 *
 * 44 traders across all six leagues (every division covered), six demo
 * firms/affiliations, all six markets, and the brief's six battle styles.
 * `targetRating` is each trader's END-OF-SEASON rating; the battle generator
 * works backwards from it so rating histories always land exactly here.
 *
 * Names are deliberately serious trader handles (CLAUDE.md rule).
 */

import type { BattleStyle, Market } from "../schema/enums";

export interface RosterEntry {
  /** Stable id slug — also the user id suffix. */
  id: string;
  displayName: string;
  firmSlug: FirmSlug;
  battleStyle: BattleStyle;
  primaryMarket: Market;
  secondaryMarkets: Market[];
  /** End-of-season rating the generated history must land on. */
  targetRating: number;
}

export type FirmSlug =
  | "mffu"
  | "tradeify"
  | "apex"
  | "topstep"
  | "independent"
  | "brokerage";

export const DEMO_USER_ID = "user-kevinv";
export const DEMO_OPPONENT_ID = "user-deltahunter";

export const ROSTER: RosterEntry[] = [
  // --- Demo user & scripted opponent (specs locked by CLAUDE.md) ----------
  {
    id: "kevinv",
    displayName: "KevinV",
    firmSlug: "mffu",
    battleStyle: "BALANCED",
    primaryMarket: "NQ",
    secondaryMarkets: ["ES"],
    targetRating: 1684, // Gold II
  },
  {
    id: "deltahunter",
    displayName: "DeltaHunter",
    firmSlug: "tradeify",
    battleStyle: "AGGRESSIVE",
    primaryMarket: "NQ",
    secondaryMarkets: ["MNQ"],
    targetRating: 1712, // Gold I
  },

  // --- Bronze (1300-1449) --------------------------------------------------
  { id: "firsthourfocus", displayName: "FirstHourFocus", firmSlug: "topstep", battleStyle: "SELECTIVE", primaryMarket: "MES", secondaryMarkets: ["ES"], targetRating: 1322 },
  { id: "pullbackpete", displayName: "PullbackPete", firmSlug: "brokerage", battleStyle: "DEFENSIVE", primaryMarket: "MNQ", secondaryMarkets: ["NQ"], targetRating: 1338 },
  { id: "bluelinebrady", displayName: "BlueLineBrady", firmSlug: "apex", battleStyle: "MOMENTUM", primaryMarket: "MNQ", secondaryMarkets: ["MES"], targetRating: 1362 },
  { id: "patiencepays", displayName: "PatiencePays", firmSlug: "independent", battleStyle: "SELECTIVE", primaryMarket: "MES", secondaryMarkets: ["GC"], targetRating: 1381 },
  { id: "leveltwologan", displayName: "LevelTwoLogan", firmSlug: "tradeify", battleStyle: "HIGH_FREQUENCY", primaryMarket: "MNQ", secondaryMarkets: ["NQ"], targetRating: 1412 },
  { id: "atlasfutures", displayName: "AtlasFutures", firmSlug: "mffu", battleStyle: "BALANCED", primaryMarket: "ES", secondaryMarkets: ["CL"], targetRating: 1436 },

  // --- Silver (1450-1599) --------------------------------------------------
  { id: "ticktempo", displayName: "TickTempo", firmSlug: "apex", battleStyle: "HIGH_FREQUENCY", primaryMarket: "MNQ", secondaryMarkets: ["MES"], targetRating: 1458 },
  { id: "macromiles", displayName: "MacroMiles", firmSlug: "brokerage", battleStyle: "MOMENTUM", primaryMarket: "CL", secondaryMarkets: ["GC"], targetRating: 1477 },
  { id: "fadetheopen", displayName: "FadeTheOpen", firmSlug: "topstep", battleStyle: "AGGRESSIVE", primaryMarket: "ES", secondaryMarkets: ["NQ"], targetRating: 1503 },
  { id: "trendlinetheo", displayName: "TrendlineTheo", firmSlug: "tradeify", battleStyle: "MOMENTUM", primaryMarket: "NQ", secondaryMarkets: ["MNQ"], targetRating: 1521 },
  { id: "riskrewardrae", displayName: "RiskRewardRae", firmSlug: "mffu", battleStyle: "DEFENSIVE", primaryMarket: "ES", secondaryMarkets: ["MES"], targetRating: 1544 },
  { id: "afternoonace", displayName: "AfternoonAce", firmSlug: "apex", battleStyle: "SELECTIVE", primaryMarket: "NQ", secondaryMarkets: ["ES"], targetRating: 1556 },
  { id: "gammagrid", displayName: "GammaGrid", firmSlug: "independent", battleStyle: "HIGH_FREQUENCY", primaryMarket: "MES", secondaryMarkets: ["MNQ"], targetRating: 1571 },
  { id: "basispointben", displayName: "BasisPointBen", firmSlug: "brokerage", battleStyle: "BALANCED", primaryMarket: "ES", secondaryMarkets: ["GC"], targetRating: 1590 },

  // --- Gold (1600-1749) ----------------------------------------------------
  { id: "drawdowndefender", displayName: "DrawdownDefender", firmSlug: "topstep", battleStyle: "DEFENSIVE", primaryMarket: "ES", secondaryMarkets: ["MES"], targetRating: 1604 },
  { id: "morningbellmason", displayName: "MorningBellMason", firmSlug: "mffu", battleStyle: "MOMENTUM", primaryMarket: "NQ", secondaryMarkets: ["ES"], targetRating: 1618 },
  { id: "closingbellcole", displayName: "ClosingBellCole", firmSlug: "apex", battleStyle: "SELECTIVE", primaryMarket: "ES", secondaryMarkets: ["NQ"], targetRating: 1633 },
  { id: "disciplineddan", displayName: "DisciplinedDan", firmSlug: "topstep", battleStyle: "DEFENSIVE", primaryMarket: "NQ", secondaryMarkets: ["MNQ"], targetRating: 1652 },
  { id: "volvanguard", displayName: "VolVanguard", firmSlug: "tradeify", battleStyle: "AGGRESSIVE", primaryMarket: "NQ", secondaryMarkets: ["CL"], targetRating: 1668 },
  { id: "steadyhandsam", displayName: "SteadyHandSam", firmSlug: "independent", battleStyle: "BALANCED", primaryMarket: "ES", secondaryMarkets: ["NQ"], targetRating: 1690 },
  { id: "sessionsniper", displayName: "SessionSniper", firmSlug: "apex", battleStyle: "SELECTIVE", primaryMarket: "NQ", secondaryMarkets: ["ES"], targetRating: 1705 },
  { id: "micromomentum", displayName: "MicroMomentum", firmSlug: "tradeify", battleStyle: "MOMENTUM", primaryMarket: "MNQ", secondaryMarkets: ["MES"], targetRating: 1718 },
  { id: "nqnomad", displayName: "NQNomad", firmSlug: "mffu", battleStyle: "MOMENTUM", primaryMarket: "NQ", secondaryMarkets: ["MNQ"], targetRating: 1731 },
  { id: "esveteran", displayName: "ESVeteran", firmSlug: "brokerage", battleStyle: "BALANCED", primaryMarket: "ES", secondaryMarkets: ["MES"], targetRating: 1742 },

  // --- Platinum (1750-1899) ------------------------------------------------
  { id: "goldstandardgrant", displayName: "GoldStandardGrant", firmSlug: "independent", battleStyle: "SELECTIVE", primaryMarket: "GC", secondaryMarkets: ["CL"], targetRating: 1755 },
  { id: "crudecurrent", displayName: "CrudeCurrent", firmSlug: "brokerage", battleStyle: "MOMENTUM", primaryMarket: "CL", secondaryMarkets: ["GC"], targetRating: 1772 },
  { id: "swingsentinel", displayName: "SwingSentinel", firmSlug: "topstep", battleStyle: "SELECTIVE", primaryMarket: "GC", secondaryMarkets: ["ES"], targetRating: 1786 },
  { id: "quietaccumulator", displayName: "QuietAccumulator", firmSlug: "mffu", battleStyle: "DEFENSIVE", primaryMarket: "ES", secondaryMarkets: ["GC"], targetRating: 1804 },
  { id: "trendtitan", displayName: "TrendTitan", firmSlug: "apex", battleStyle: "MOMENTUM", primaryMarket: "NQ", secondaryMarkets: ["ES"], targetRating: 1815 },
  { id: "icebergwatch", displayName: "IcebergWatch", firmSlug: "tradeify", battleStyle: "HIGH_FREQUENCY", primaryMarket: "NQ", secondaryMarkets: ["MNQ"], targetRating: 1838 },
  { id: "breakoutbella", displayName: "BreakoutBella", firmSlug: "topstep", battleStyle: "AGGRESSIVE", primaryMarket: "NQ", secondaryMarkets: ["ES"], targetRating: 1861 },
  { id: "pivotpointpro", displayName: "PivotPointPro", firmSlug: "independent", battleStyle: "BALANCED", primaryMarket: "ES", secondaryMarkets: ["NQ"], targetRating: 1884 },

  // --- Diamond (1900-2049) -------------------------------------------------
  { id: "meanrevmax", displayName: "MeanRevMax", firmSlug: "apex", battleStyle: "DEFENSIVE", primaryMarket: "ES", secondaryMarkets: ["MES"], targetRating: 1912 },
  { id: "edgeseeker", displayName: "EdgeSeeker", firmSlug: "mffu", battleStyle: "SELECTIVE", primaryMarket: "NQ", secondaryMarkets: ["CL"], targetRating: 1934 },
  { id: "liquiditylena", displayName: "LiquidityLena", firmSlug: "tradeify", battleStyle: "HIGH_FREQUENCY", primaryMarket: "NQ", secondaryMarkets: ["ES"], targetRating: 1957 },
  { id: "scalpsurgeon", displayName: "ScalpSurgeon", firmSlug: "apex", battleStyle: "HIGH_FREQUENCY", primaryMarket: "MNQ", secondaryMarkets: ["NQ"], targetRating: 1978 },
  { id: "rangerider", displayName: "RangeRider", firmSlug: "brokerage", battleStyle: "BALANCED", primaryMarket: "GC", secondaryMarkets: ["CL"], targetRating: 2005 },
  { id: "momentummara", displayName: "MomentumMara", firmSlug: "topstep", battleStyle: "MOMENTUM", primaryMarket: "NQ", secondaryMarkets: ["MNQ"], targetRating: 2031 },

  // --- Elite (2050+) -------------------------------------------------------
  { id: "orderflowowen", displayName: "OrderFlowOwen", firmSlug: "mffu", battleStyle: "AGGRESSIVE", primaryMarket: "NQ", secondaryMarkets: ["ES"], targetRating: 2064 },
  { id: "vwapvector", displayName: "VWAPVector", firmSlug: "independent", battleStyle: "BALANCED", primaryMarket: "ES", secondaryMarkets: ["NQ"], targetRating: 2112 },
  { id: "tapereadertom", displayName: "TapeReaderTom", firmSlug: "tradeify", battleStyle: "SELECTIVE", primaryMarket: "NQ", secondaryMarkets: ["CL"], targetRating: 2158 },
  { id: "alphaarc", displayName: "AlphaArc", firmSlug: "topstep", battleStyle: "MOMENTUM", primaryMarket: "NQ", secondaryMarkets: ["ES", "GC"], targetRating: 2216 },
];

export function userIdFor(rosterId: string): string {
  return `user-${rosterId}`;
}
