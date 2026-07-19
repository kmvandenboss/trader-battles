/**
 * Seed dataset tests: determinism, volume minimums, demo-user spec,
 * referential integrity, and verification labeling.
 */

import { describe, expect, it } from "vitest";

import { leagueForRating } from "@/lib/data/leagues";
import { buildSeedDataset, validateSeedDataset } from "@/lib/data/seed";
import { userIdFor } from "@/lib/data/seed/roster";

const dataset = buildSeedDataset();
const kevinId = userIdFor("kevinv");
const deltaId = userIdFor("deltahunter");

describe("determinism", () => {
  it("two independent builds are byte-identical", () => {
    const again = buildSeedDataset();
    expect(JSON.stringify(again)).toBe(JSON.stringify(dataset));
  });
});

describe("invariants", () => {
  it("passes every seed validation rule", () => {
    expect(validateSeedDataset(dataset)).toEqual([]);
  });
});

describe("volume minimums", () => {
  it("has at least 40 traders", () => {
    expect(dataset.users.length).toBeGreaterThanOrEqual(40);
    expect(dataset.traderProfiles.length).toBe(dataset.users.length);
  });

  it("has at least 5 firms/affiliations", () => {
    expect(dataset.firms.length).toBeGreaterThanOrEqual(5);
    const slugs = dataset.firms.map((f) => f.slug);
    for (const slug of ["mffu", "tradeify", "apex", "topstep", "independent", "brokerage"]) {
      expect(slugs).toContain(slug);
    }
  });

  it("has at least 150 completed battles", () => {
    const completed = dataset.battles.filter((b) => b.status === "COMPLETED");
    expect(completed.length).toBeGreaterThanOrEqual(150);
  });

  it("covers every league", () => {
    const leagues = new Set(dataset.traderProfiles.map((p) => p.league));
    expect([...leagues].sort()).toEqual(
      ["BRONZE", "DIAMOND", "ELITE", "GOLD", "PLATINUM", "SILVER"].sort(),
    );
  });

  it("has several active win streaks", () => {
    const streaks = dataset.traderProfiles.filter((p) => p.currentStreak >= 3);
    expect(streaks.length).toBeGreaterThanOrEqual(3);
  });

  it("has an achievement catalog and earned badges", () => {
    expect(dataset.achievements.length).toBeGreaterThanOrEqual(10);
    expect(dataset.userAchievements.length).toBeGreaterThan(40);
  });
});

describe("demo user KevinV (locked spec)", () => {
  const user = dataset.users.find((u) => u.id === kevinId)!;
  const profile = dataset.traderProfiles.find((p) => p.userId === kevinId)!;

  it("matches CLAUDE.md exactly", () => {
    expect(user.displayName).toBe("KevinV");
    expect(user.isDemoUser).toBe(true);
    expect(profile.rating).toBe(1684);
    expect(profile.league).toBe("GOLD");
    expect(profile.division).toBe("II");
    expect(profile.seasonWins).toBe(18);
    expect(profile.seasonLosses).toBe(11);
    expect(profile.currentStreak).toBe(3);
    expect(profile.primaryMarket).toBe("NQ");
    expect(profile.secondaryMarkets).toEqual(["ES"]);
    expect(profile.battleStyle).toBe("BALANCED");
    expect(profile.disciplineScore).toBe(84);
    expect(profile.riskScore).toBe(79);
    expect(profile.performanceScore).toBe(76);
  });

  it("gained exactly +96 rating this season", () => {
    expect(profile.seasonStartRating).toBe(1588);
    const history = dataset.ratingHistory.filter((r) => r.userId === kevinId);
    const total = history.reduce((s, r) => s + r.change, 0);
    expect(total).toBe(96);
  });

  it("has the MFFU 50K Rapid account, connected", () => {
    const account = dataset.tradingAccounts.find((a) => a.userId === kevinId)!;
    expect(account.metadata.planName).toBe("MFFU 50K Rapid");
    expect(account.propFirm).toBe("MFFU");
    expect(account.connectionStatus).toBe("CONNECTED");
    expect(account.startingBalance).toBe(50_000);
    expect(account.maximumContracts).toBe(5);
    expect(account.metadata.dailyDrawdownRemaining).toBe(980);
    expect(account.verificationStatus).toBe("SIMULATED");
  });

  it("is 7-2 in Opening Bell NQ battles (insight card)", () => {
    const battleIds = new Set(
      dataset.battleParticipants
        .filter((p) => p.userId === kevinId)
        .map((p) => p.battleId),
    );
    const morningNq = dataset.battles.filter(
      (b) =>
        battleIds.has(b.id) &&
        b.market === "NQ" &&
        b.battleWindow === "OPENING_BELL",
    );
    const wins = morningNq.filter((b) => b.winnerId === kevinId).length;
    expect(wins).toBe(7);
    expect(morningNq.length - wins).toBe(2);
  });

  it("earned the full badge story including Five-Win Streak", () => {
    const earned = dataset.userAchievements
      .filter((ua) => ua.userId === kevinId)
      .map((ua) => ua.achievementId);
    expect(earned).toContain("ach-five-win-streak");
    expect(earned).toContain("ach-giant-slayer");
    expect(earned).toContain("ach-gold-league");
    expect(profile.bestWinStreak).toBeGreaterThanOrEqual(5);
  });

  it("has notifications covering the required types", () => {
    const types = new Set(
      dataset.notifications
        .filter((n) => n.userId === kevinId)
        .map((n) => n.type),
    );
    for (const t of [
      "MATCH_FOUND",
      "BATTLE_RESULT",
      "RATING_INCREASED",
      "LEAGUE_PROMOTION",
      "RIVAL_PASSED",
      "NEW_CHALLENGE",
    ]) {
      expect(types).toContain(t);
    }
  });
});

describe("opponent DeltaHunter (locked spec)", () => {
  it("matches CLAUDE.md exactly", () => {
    const user = dataset.users.find((u) => u.id === deltaId)!;
    const profile = dataset.traderProfiles.find((p) => p.userId === deltaId)!;
    expect(user.displayName).toBe("DeltaHunter");
    expect(profile.rating).toBe(1712);
    expect(profile.league).toBe("GOLD");
    expect(profile.division).toBe("I");
    expect(profile.seasonWins).toBe(21);
    expect(profile.seasonLosses).toBe(13);
    expect(profile.primaryMarket).toBe("NQ");
    expect(profile.battleStyle).toBe("AGGRESSIVE");
    const firm = dataset.firms.find((f) => f.id === profile.firmId)!;
    expect(firm.name).toBe("Tradeify");
  });
});

describe("showcase battle (brief's worked example)", () => {
  const showcase = dataset.battles
    .filter((b) => {
      const ids = dataset.battleParticipants
        .filter((p) => p.battleId === b.id)
        .map((p) => p.userId);
      return ids.includes(kevinId) && ids.includes(deltaId);
    })
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))
    .at(-1)!;

  it("KevinV wins 83.9 to 73.6 with less gross profit", () => {
    const parts = dataset.battleParticipants.filter(
      (p) => p.battleId === showcase.id,
    );
    const kevinPart = parts.find((p) => p.userId === kevinId)!;
    const deltaPart = parts.find((p) => p.userId === deltaId)!;
    expect(showcase.winnerId).toBe(kevinId);
    expect(kevinPart.finalScore).toBe(83.9);
    expect(deltaPart.finalScore).toBe(73.6);
    const finals = dataset.battleMetricSnapshots.filter(
      (m) => m.battleId === showcase.id && m.isFinal,
    );
    const kevinFinal = finals.find((m) => m.participantId === kevinPart.id)!;
    const deltaFinal = finals.find((m) => m.participantId === deltaPart.id)!;
    expect(kevinFinal.netPnl).toBeLessThan(deltaFinal.netPnl);
    expect(kevinFinal.maximumDrawdown).toBeLessThan(deltaFinal.maximumDrawdown);
  });

  it("has a full normalized execution trail from the mock provider", () => {
    const events = dataset.executionEvents.filter(
      (e) => e.battleId === showcase.id,
    );
    expect(events.length).toBeGreaterThan(20);
    for (const e of events) {
      expect(e.sourceProvider).toBe("mock");
      expect(e.verificationStatus).toBe("SIMULATED");
      expect(e.providerEventId).toMatch(/^mock-/);
      expect(e.rawPayload.simulated).toBe(true);
    }
  });
});

describe("referential integrity and verification labeling", () => {
  it("every participant, user, and account id resolves", () => {
    const userIds = new Set(dataset.users.map((u) => u.id));
    const accountIds = new Set(dataset.tradingAccounts.map((a) => a.id));
    const battleIds = new Set(dataset.battles.map((b) => b.id));
    for (const p of dataset.battleParticipants) {
      expect(userIds.has(p.userId)).toBe(true);
      expect(accountIds.has(p.tradingAccountId)).toBe(true);
      expect(battleIds.has(p.battleId)).toBe(true);
    }
    for (const r of dataset.ratingHistory) {
      expect(userIds.has(r.userId)).toBe(true);
      expect(battleIds.has(r.battleId)).toBe(true);
    }
  });

  it("nothing is provider-verified; everything activity-bearing is SIMULATED", () => {
    const rows = [
      ...dataset.tradingAccounts,
      ...dataset.integrationConnections,
      ...dataset.battles,
      ...dataset.battleParticipants,
      ...dataset.executionEvents,
      ...dataset.accountSnapshots,
      ...dataset.battleMetricSnapshots,
    ];
    for (const row of rows) {
      expect(row.verificationStatus).toBe("SIMULATED");
    }
  });

  it("league placements match ratings everywhere", () => {
    for (const p of dataset.traderProfiles) {
      const placement = leagueForRating(p.rating);
      expect(`${p.league} ${p.division}`).toBe(
        `${placement.league} ${placement.division}`,
      );
    }
  });
});
