/**
 * Shared derivation helpers (lib/data/repositories/derive.ts) — fresh-trader
 * robustness. A brand-new authenticated trader (Phase C sign-up) has ZERO
 * battles, a 0–0 record, and no rating history; standings, leaderboards, and
 * history filtering must stay finite and sane for them on both backends.
 */

import { describe, expect, it } from "vitest";

import {
  computeStanding,
  filterBattleHistory,
  leaderboardPage,
} from "@/lib/data/repositories/derive";
import type { TraderWithProfile } from "@/lib/data/repositories/types";
import type { Firm, TraderProfile, User } from "@/lib/data/schema";

const firm: Firm = {
  id: "firm-mffu",
  slug: "mffu",
  name: "MFFU",
  kind: "PROP_FIRM",
  description: "Test firm",
  isDemoData: true,
};

function makeTrader(
  id: string,
  overrides: Partial<TraderProfile> = {},
  userOverrides: Partial<User> = {},
): TraderWithProfile {
  const user: User = {
    id,
    displayName: `Trader-${id}`,
    email: `${id}@example.com`,
    avatarUrl: null,
    isDemoUser: false,
    authUserId: null,
    createdAt: "2026-07-21T00:00:00.000Z",
    ...userOverrides,
  };
  const profile: TraderProfile = {
    userId: id,
    firmId: firm.id,
    rating: 1600,
    league: "GOLD",
    division: "III",
    primaryMarket: "NQ",
    secondaryMarkets: [],
    battleStyle: "BALANCED",
    disciplineScore: 50,
    riskScore: 50,
    performanceScore: 50,
    seasonWins: 10,
    seasonLosses: 5,
    lifetimeWins: 10,
    lifetimeLosses: 5,
    currentStreak: 1,
    bestWinStreak: 3,
    seasonStartRating: 1550,
    seasonHighRating: 1620,
    ...overrides,
  };
  return { user, profile, firm };
}

/** The Phase C sign-up defaults: rating 1500, 0–0, no battles. */
const freshTrader = makeTrader("user-fresh", {
  rating: 1500,
  league: "SILVER",
  division: "II",
  seasonWins: 0,
  seasonLosses: 0,
  lifetimeWins: 0,
  lifetimeLosses: 0,
  currentStreak: 0,
  bestWinStreak: 0,
  seasonStartRating: 1500,
  seasonHighRating: 1500,
});

describe("zero-battle trader derivations", () => {
  it("leaderboardPage yields a finite 0 win rate for a 0-0 trader", () => {
    const { entries, total } = leaderboardPage([
      makeTrader("user-vet"),
      freshTrader,
    ]);
    expect(total).toBe(2);
    const fresh = entries.find((e) => e.trader.user.id === "user-fresh");
    expect(fresh).toBeDefined();
    expect(fresh!.winRate).toBe(0);
    expect(Number.isFinite(fresh!.winRate)).toBe(true);
    // Rating desc: the 1600 veteran ranks above the fresh 1500.
    expect(entries[0].trader.user.id).toBe("user-vet");
    expect(fresh!.rank).toBe(2);
  });

  it("computeStanding stays finite for a zero-battle trader", () => {
    const standing = computeStanding("user-fresh", [
      makeTrader("user-vet"),
      freshTrader,
    ]);
    expect(standing).not.toBeNull();
    expect(standing!.globalRank).toBe(2);
    expect(standing!.totalTraders).toBe(2);
    expect(Number.isFinite(standing!.globalPercentile)).toBe(true);
    expect(standing!.globalPercentile).toBeGreaterThanOrEqual(0);
    expect(standing!.globalPercentile).toBeLessThanOrEqual(100);
    expect(standing!.firmRank).toBe(2);
    expect(standing!.marketRank).toBe(2);
  });

  it("computeStanding handles the trader being the only one on the board", () => {
    const standing = computeStanding("user-fresh", [freshTrader]);
    expect(standing).toEqual({
      globalRank: 1,
      totalTraders: 1,
      globalPercentile: 100,
      firmRank: 1,
      firmTraders: 1,
      marketRank: 1,
      marketTraders: 1,
    });
  });

  it("filterBattleHistory returns an empty list for a trader with no battles", () => {
    expect(
      filterBattleHistory([], "user-fresh", new Map(), { result: "WIN" }),
    ).toEqual([]);
    expect(filterBattleHistory([], "user-fresh", new Map())).toEqual([]);
  });
});
