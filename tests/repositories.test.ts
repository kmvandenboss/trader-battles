/**
 * Repository layer tests: the in-memory implementation serves the seed
 * dataset consistently through the swappable interfaces.
 */

import { describe, expect, it } from "vitest";

import { getRepositories } from "@/lib/data/repositories";

const repos = getRepositories();

describe("TraderRepository", () => {
  it("returns the demo trader KevinV", async () => {
    const demo = await repos.traders.getDemoTrader();
    expect(demo.user.displayName).toBe("KevinV");
    expect(demo.profile.rating).toBe(1684);
    expect(demo.firm.name).toBe("MFFU");
  });

  it("finds traders by display name and lists by filter", async () => {
    const delta = await repos.traders.getByDisplayName("DeltaHunter");
    expect(delta?.profile.rating).toBe(1712);
    const goldTraders = await repos.traders.list({ league: "GOLD" });
    expect(goldTraders.length).toBeGreaterThan(0);
    expect(goldTraders.every((t) => t.profile.league === "GOLD")).toBe(true);
    // Sorted by rating descending.
    const ratings = goldTraders.map((t) => t.profile.rating);
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a));
  });

  it("serves rating history chains and accounts", async () => {
    const demo = await repos.traders.getDemoTrader();
    const history = await repos.traders.getRatingHistory(demo.user.id);
    expect(history).toHaveLength(29);
    expect(history[0].previousRating).toBe(1588);
    expect(history.at(-1)?.newRating).toBe(1684);
    const accounts = await repos.traders.getAccounts(demo.user.id);
    expect(accounts).toHaveLength(1);
    expect(accounts[0].metadata.planName).toBe("MFFU 50K Rapid");
  });
});

describe("BattleRepository", () => {
  it("lists a user's battles most recent first with filters", async () => {
    const demo = await repos.traders.getDemoTrader();
    const all = await repos.battles.listForUser(demo.user.id);
    expect(all).toHaveLength(29);
    const starts = all.map((b) => b.battle.scheduledStart);
    expect(starts).toEqual([...starts].sort().reverse());
    const wins = await repos.battles.listForUser(demo.user.id, { result: "WIN" });
    expect(wins).toHaveLength(18);
    const vsDelta = await repos.battles.listForUser(demo.user.id, {
      opponentUserId: "user-deltahunter",
    });
    expect(vsDelta).toHaveLength(3);
  });

  it("returns full battle detail for the latest demo battle", async () => {
    const demo = await repos.traders.getDemoTrader();
    const latest = await repos.battles.getLatestForUser(demo.user.id);
    expect(latest).not.toBeNull();
    expect(latest!.battle.winnerId).toBe(demo.user.id);
    expect(latest!.executionEvents.length).toBeGreaterThan(20);
    expect(latest!.accountSnapshots.length).toBeGreaterThan(10);
    expect(latest!.metricTimeline.some((m) => m.isFinal)).toBe(true);
    const kevinSide = latest!.participants.find(
      (p) => p.trader.user.id === demo.user.id,
    )!;
    expect(kevinSide.metrics.totalBattleScore).toBe(83.9);
    expect(kevinSide.ratingChange).toBeGreaterThan(0);
  });

  it("serves a platform-wide recent battle feed", async () => {
    const recent = await repos.battles.listRecent(10);
    expect(recent).toHaveLength(10);
    expect(recent.every((b) => b.battle.status === "COMPLETED")).toBe(true);
  });
});

describe("LeaderboardRepository", () => {
  it("ranks traders by rating with filters and pagination", async () => {
    const { entries, total } = await repos.leaderboards.query({ limit: 5 });
    expect(total).toBeGreaterThanOrEqual(40);
    expect(entries).toHaveLength(5);
    expect(entries[0].rank).toBe(1);
    expect(entries[0].trader.profile.rating).toBeGreaterThanOrEqual(
      entries[4].trader.profile.rating,
    );
    const nq = await repos.leaderboards.query({ market: "NQ" });
    expect(
      nq.entries.every((e) => e.trader.profile.primaryMarket === "NQ"),
    ).toBe(true);
  });

  it("computes global/firm/market standing for the demo user", async () => {
    const demo = await repos.traders.getDemoTrader();
    const standing = await repos.leaderboards.getStanding(demo.user.id);
    expect(standing).not.toBeNull();
    expect(standing!.globalRank).toBeGreaterThan(0);
    expect(standing!.globalPercentile).toBeGreaterThan(0);
    expect(standing!.firmTraders).toBeGreaterThan(1);
    expect(standing!.marketTraders).toBeGreaterThan(1);
  });
});

describe("FirmRepository", () => {
  it("derives standings for all six demo firms", async () => {
    const firms = await repos.firms.list();
    expect(firms).toHaveLength(6);
    for (const f of firms) {
      expect(f.activeTraders).toBeGreaterThan(0);
      expect(f.averageRating).toBeGreaterThan(1200);
      expect(f.topTraders.length).toBeGreaterThan(0);
      expect(f.firm.isDemoData).toBe(true);
    }
  });

  it("derives firm-vs-firm results consistently", async () => {
    const results = await repos.firms.getFirmVsFirm("mffu");
    expect(results.length).toBeGreaterThan(0);
    const mirror = await repos.firms.getFirmVsFirm("tradeify");
    const mffuVsTradeify = results.find(
      (r) => r.opponentFirm.slug === "tradeify",
    );
    const tradeifyVsMffu = mirror.find((r) => r.opponentFirm.slug === "mffu");
    expect(mffuVsTradeify?.wins).toBe(tradeifyVsMffu?.losses);
    expect(mffuVsTradeify?.losses).toBe(tradeifyVsMffu?.wins);
  });
});

describe("Achievement and Notification repositories", () => {
  it("serves the demo user's badges in earned order", async () => {
    const demo = await repos.traders.getDemoTrader();
    const earned = await repos.achievements.listForUser(demo.user.id);
    expect(earned).toHaveLength(10);
    const dates = earned.map((e) => e.earnedAt);
    expect(dates).toEqual([...dates].sort());
  });

  it("serves notifications newest first with unread counts", async () => {
    const demo = await repos.traders.getDemoTrader();
    const all = await repos.notifications.listForUser(demo.user.id);
    expect(all.length).toBeGreaterThanOrEqual(6);
    const dates = all.map((n) => n.createdAt);
    expect(dates).toEqual([...dates].sort().reverse());
    const unread = await repos.notifications.countUnread(demo.user.id);
    expect(unread).toBeGreaterThan(0);
    expect(unread).toBeLessThan(all.length);
  });
});
