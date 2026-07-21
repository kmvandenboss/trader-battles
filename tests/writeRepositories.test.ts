/**
 * Phase D write surface — in-memory implementation tests.
 *
 * Covers the new v1 persistence methods (battle create → import →
 * settlement, challenges, market bars, CSV accounts) plus the derive.ts
 * null-guards for nullable battle.market and unsettled participants.
 * The Postgres implementation persists EXACTLY the same rows via the shared
 * builders in derive.ts, so these tests pin the semantics for both backends.
 */

import { describe, expect, it } from "vitest";

import { buildSeedDataset } from "@/lib/data/seed";
import { createInMemoryRepositories } from "@/lib/data/repositories/inMemory";
import {
  bracketStartingBalance,
  deriveFirmStandings,
  filterBattleHistory,
  selectMarkPrice,
  toSettledParticipant,
} from "@/lib/data/repositories/derive";
import type {
  BattleSettlementInput,
  CreateBattleInput,
  Repositories,
} from "@/lib/data/repositories/types";
import type { NormalizedExecutionEvent } from "@/lib/integrations/types";
import type { Battle, BattleParticipant, MarketBar } from "@/lib/data/schema";

/** Fresh, isolated repositories per test (writes are in-process). */
function freshRepos(): Repositories {
  return createInMemoryRepositories(buildSeedDataset());
}

const WINDOW_START = "2026-07-22T13:30:00.000Z";
const WINDOW_END = "2026-07-22T15:00:00.000Z";

async function twoTraders(repos: Repositories) {
  const kevin = await repos.traders.getByDisplayName("KevinV");
  const delta = await repos.traders.getByDisplayName("DeltaHunter");
  if (!kevin || !delta) throw new Error("seed traders missing");
  return { kevin, delta };
}

function battleInput(
  kevinId: string,
  deltaId: string,
  kevinRating: number,
  deltaRating: number,
): CreateBattleInput {
  return {
    scheduledStart: WINDOW_START,
    scheduledEnd: WINDOW_END,
    battleWindow: "OPENING_BELL",
    market: null,
    accountBracket: "50K",
    participants: [
      { userId: kevinId, startingRating: kevinRating },
      { userId: deltaId, startingRating: deltaRating },
    ],
  };
}

function settlementInput(
  battleId: string,
  kevinId: string,
  deltaId: string,
  kevinAccountId: string,
  deltaAccountId: string,
  kevinRatings: { start: number; end: number },
  deltaRatings: { start: number; end: number },
): BattleSettlementInput {
  return {
    battleId,
    winnerId: kevinId,
    endTime: WINDOW_END,
    decidedBy: "REALIZED_PNL",
    resolutionDetail: "KevinV led on realized PnL.",
    verificationStatus: "SELF_REPORTED",
    participants: [
      {
        userId: kevinId,
        tradingAccountId: kevinAccountId,
        endingRating: kevinRatings.end,
        finalScore: 245,
        result: "WIN",
        realizedPnl: 230,
        participationBonus: 15,
        closedTradeCount: 4,
        grossProfit: 410,
        grossLoss: 180,
        markOutPnl: 0,
        markOutStatus: "NONE",
        markOutNote: null,
        maximumDrawdown: 120,
        tradeCount: 4,
      },
      {
        userId: deltaId,
        tradingAccountId: deltaAccountId,
        endingRating: deltaRatings.end,
        finalScore: -35,
        result: "LOSS",
        realizedPnl: -45,
        participationBonus: 10,
        closedTradeCount: 2,
        grossProfit: 95,
        grossLoss: 140,
        markOutPnl: 0,
        markOutStatus: "NONE",
        markOutNote: null,
        maximumDrawdown: 260,
        tradeCount: 2,
      },
    ],
  };
}

function importEvent(overrides: Partial<NormalizedExecutionEvent> = {}): NormalizedExecutionEvent {
  return {
    providerEventId: "csv-row-1",
    sourceProvider: "csv",
    accountId: "MFFU-50K-001",
    instrument: "NQ",
    side: "BUY",
    quantity: 1,
    price: 20150.25,
    commission: 2.1,
    occurredAt: "2026-07-22T13:45:00.000Z",
    receivedAt: "2026-07-22T16:00:00.000Z",
    eventType: "FILL",
    verificationStatus: "SELF_REPORTED",
    rawPayload: { row: 1 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Battle create / scheduled reads / status
// ---------------------------------------------------------------------------

describe("BattleRepository.create + scheduled reads", () => {
  it("creates a SCHEDULED PNL_V1 battle with two unsettled participants", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await twoTraders(repos);
    const battle = await repos.battles.create(
      battleInput(kevin.user.id, delta.user.id, 1684, 1712),
    );

    expect(battle.status).toBe("SCHEDULED");
    expect(battle.scoringMode).toBe("PNL_V1");
    expect(battle.battleType).toBe("LIVE_PERFORMANCE");
    expect(battle.market).toBeNull();
    expect(battle.scheduledEnd).toBe(WINDOW_END);
    expect(battle.accountBracket).toBe("50K");
    expect(battle.verificationStatus).toBe("SELF_REPORTED");
    expect(battle.winnerId).toBeNull();

    const composite = await repos.battles.getScheduledById(battle.id);
    expect(composite).not.toBeNull();
    expect(composite!.participants).toHaveLength(2);
    for (const { participant } of composite!.participants) {
      expect(participant.tradingAccountId).toBeNull();
      expect(participant.endingRating).toBeNull();
      expect(participant.finalScore).toBeNull();
      expect(participant.result).toBeNull();
      expect(participant.realizedPnl).toBeNull();
    }
    const kevinPart = composite!.participants.find(
      (p) => p.participant.userId === kevin.user.id,
    );
    expect(kevinPart?.participant.startingRating).toBe(1684);
    expect(kevinPart?.trader.user.displayName).toBe("KevinV");
  });

  it("lists SCHEDULED and SETTLING battles for a user, but never in history", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await twoTraders(repos);
    const battle = await repos.battles.create(
      battleInput(kevin.user.id, delta.user.id, 1684, 1712),
    );

    let scheduled = await repos.battles.listScheduledForUser(kevin.user.id);
    expect(scheduled.map((s) => s.battle.id)).toContain(battle.id);

    await repos.battles.updateStatus(battle.id, "SETTLING");
    scheduled = await repos.battles.listScheduledForUser(kevin.user.id);
    expect(scheduled.map((s) => s.battle.id)).toContain(battle.id);
    expect(scheduled.find((s) => s.battle.id === battle.id)?.battle.status).toBe(
      "SETTLING",
    );

    // The unsettled battle must NOT leak into history or detail reads.
    const history = await repos.battles.listForUser(kevin.user.id);
    expect(history.map((b) => b.battle.id)).not.toContain(battle.id);
    expect(await repos.battles.getById(battle.id)).toBeNull();
    const latest = await repos.battles.getLatestForUser(kevin.user.id);
    expect(latest?.battle.id).not.toBe(battle.id);
  });
});

// ---------------------------------------------------------------------------
// Settlement + idempotency
// ---------------------------------------------------------------------------

describe("BattleRepository.saveSettlement", () => {
  async function settleOnce(repos: Repositories) {
    const { kevin, delta } = await twoTraders(repos);
    const kevinAccount = (await repos.traders.getAccounts(kevin.user.id))[0];
    const deltaAccount = (await repos.traders.getAccounts(delta.user.id))[0];
    const battle = await repos.battles.create(
      battleInput(kevin.user.id, delta.user.id, kevin.profile.rating, delta.profile.rating),
    );
    const input = settlementInput(
      battle.id,
      kevin.user.id,
      delta.user.id,
      kevinAccount.id,
      deltaAccount.id,
      { start: kevin.profile.rating, end: kevin.profile.rating + 16 },
      { start: delta.profile.rating, end: delta.profile.rating - 16 },
    );
    await repos.battles.saveSettlement(input);
    return { battle, input, kevin, delta };
  }

  it("persists participants, battle result, snapshots, ratings, and profiles", async () => {
    const repos = freshRepos();
    const before = await twoTraders(repos);
    const kevinBefore = { ...before.kevin.profile };
    const deltaBefore = { ...before.delta.profile };
    const kevinHistoryBefore = (
      await repos.traders.getRatingHistory(before.kevin.user.id)
    ).length;

    const { battle, input } = await settleOnce(repos);

    // Battle detail is now readable as a settled composite.
    const detail = await repos.battles.getById(battle.id);
    expect(detail).not.toBeNull();
    expect(detail!.battle.status).toBe("COMPLETED");
    expect(detail!.battle.winnerId).toBe(input.winnerId);
    expect(detail!.battle.decidedBy).toBe("REALIZED_PNL");
    expect(detail!.battle.endTime).toBe(WINDOW_END);

    const kevinSummary = detail!.participants.find(
      (p) => p.participant.userId === before.kevin.user.id,
    )!;
    expect(kevinSummary.participant.result).toBe("WIN");
    expect(kevinSummary.participant.finalScore).toBe(245);
    expect(kevinSummary.participant.realizedPnl).toBe(230);
    expect(kevinSummary.participant.participationBonus).toBe(15);
    expect(kevinSummary.participant.grossProfit).toBe(410);
    expect(kevinSummary.participant.grossLoss).toBe(180);
    expect(kevinSummary.metrics.isFinal).toBe(true);
    expect(kevinSummary.metrics.netPnl).toBe(230); // realized + markOut
    expect(kevinSummary.metrics.totalBattleScore).toBe(245);
    expect(kevinSummary.metrics.verificationStatus).toBe("SELF_REPORTED");
    expect(kevinSummary.ratingChange).toBe(16);

    // Rating history gained exactly one row for this battle.
    const kevinHistory = await repos.traders.getRatingHistory(before.kevin.user.id);
    expect(kevinHistory.length).toBe(kevinHistoryBefore + 1);
    const entry = kevinHistory.find((r) => r.battleId === battle.id)!;
    expect(entry.change).toBe(16);

    // Profiles: rating absolute, W/L tallies +1, streak extended.
    const after = await twoTraders(repos);
    expect(after.kevin.profile.rating).toBe(kevinBefore.rating + 16);
    expect(after.kevin.profile.seasonWins).toBe(kevinBefore.seasonWins + 1);
    expect(after.kevin.profile.lifetimeWins).toBe(kevinBefore.lifetimeWins + 1);
    expect(after.kevin.profile.seasonLosses).toBe(kevinBefore.seasonLosses);
    expect(after.kevin.profile.currentStreak).toBe(kevinBefore.currentStreak + 1);
    expect(after.delta.profile.rating).toBe(deltaBefore.rating - 16);
    expect(after.delta.profile.seasonLosses).toBe(deltaBefore.seasonLosses + 1);
    expect(after.delta.profile.currentStreak).toBeLessThanOrEqual(-1);
  });

  it("is idempotent: the same settlement twice yields identical final state", async () => {
    const repos = freshRepos();
    const { battle, input } = await settleOnce(repos);

    const snapshot = async () => {
      const { kevin, delta } = await twoTraders(repos);
      return JSON.stringify({
        kevin: kevin.profile,
        delta: delta.profile,
        detail: await repos.battles.getById(battle.id),
        kevinHistory: await repos.traders.getRatingHistory(kevin.user.id),
        deltaHistory: await repos.traders.getRatingHistory(delta.user.id),
      });
    };

    const first = await snapshot();
    await repos.battles.saveSettlement(input); // re-settle, same input
    const second = await snapshot();
    expect(second).toBe(first); // no double-counted W/L, rating, or rows
  });

  it("re-settling with a CHANGED result reverses the prior W/L before applying the new one", async () => {
    const repos = freshRepos();
    const before = await twoTraders(repos);
    const kevinBefore = { ...before.kevin.profile };
    const deltaBefore = { ...before.delta.profile };

    const { battle, input } = await settleOnce(repos); // KevinV WIN (+16)
    const afterFirst = await twoTraders(repos);
    expect(afterFirst.kevin.profile.seasonWins).toBe(kevinBefore.seasonWins + 1);
    expect(afterFirst.delta.profile.seasonLosses).toBe(deltaBefore.seasonLosses + 1);

    // Flip the outcome and re-settle the SAME battle (e.g. a corrected import).
    const flipped: BattleSettlementInput = {
      ...input,
      winnerId: input.participants[1].userId,
      decidedBy: "SCORE",
      resolutionDetail: "DeltaHunter wins on score (corrected import).",
      participants: [
        { ...input.participants[0], result: "LOSS", endingRating: kevinBefore.rating - 12 },
        { ...input.participants[1], result: "WIN", endingRating: deltaBefore.rating + 12 },
      ],
    };
    await repos.battles.saveSettlement(flipped);

    const after = await twoTraders(repos);
    // The original WIN/LOSS was reversed, not double-applied on top.
    expect(after.kevin.profile.seasonWins).toBe(kevinBefore.seasonWins);
    expect(after.kevin.profile.seasonLosses).toBe(kevinBefore.seasonLosses + 1);
    expect(after.kevin.profile.lifetimeWins).toBe(kevinBefore.lifetimeWins);
    expect(after.kevin.profile.lifetimeLosses).toBe(kevinBefore.lifetimeLosses + 1);
    expect(after.delta.profile.seasonWins).toBe(deltaBefore.seasonWins + 1);
    expect(after.delta.profile.seasonLosses).toBe(deltaBefore.seasonLosses);
    // Rating is set absolutely to the new settlement's endingRating.
    expect(after.kevin.profile.rating).toBe(kevinBefore.rating - 12);
    expect(after.delta.profile.rating).toBe(deltaBefore.rating + 12);
    // Streak restarted per the documented best-effort semantics.
    expect(after.kevin.profile.currentStreak).toBeLessThanOrEqual(-1);
    expect(after.delta.profile.currentStreak).toBeGreaterThanOrEqual(1);
    // Exactly one rating-history row per trader for this battle (replaced, not appended).
    const kevinHistory = await repos.traders.getRatingHistory(before.kevin.user.id);
    expect(kevinHistory.filter((r) => r.battleId === battle.id)).toHaveLength(1);
    expect(kevinHistory.find((r) => r.battleId === battle.id)?.change).toBe(-12);
  });

  it("handles a draw: winnerId null, neither W nor L, streaks reset to 0", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await twoTraders(repos);
    const kevinBefore = { ...kevin.profile };
    const deltaBefore = { ...delta.profile };
    const kevinAccount = (await repos.traders.getAccounts(kevin.user.id))[0];
    const deltaAccount = (await repos.traders.getAccounts(delta.user.id))[0];
    const battle = await repos.battles.create(
      battleInput(kevin.user.id, delta.user.id, kevin.profile.rating, delta.profile.rating),
    );
    const input = settlementInput(
      battle.id,
      kevin.user.id,
      delta.user.id,
      kevinAccount.id,
      deltaAccount.id,
      { start: kevin.profile.rating, end: kevin.profile.rating },
      { start: delta.profile.rating, end: delta.profile.rating },
    );
    input.winnerId = null;
    input.decidedBy = "DRAW";
    input.participants[0].result = "DRAW";
    input.participants[1].result = "DRAW";
    await repos.battles.saveSettlement(input);

    const after = await twoTraders(repos);
    expect(after.kevin.profile.seasonWins).toBe(kevinBefore.seasonWins);
    expect(after.kevin.profile.seasonLosses).toBe(kevinBefore.seasonLosses);
    expect(after.kevin.profile.currentStreak).toBe(0);
    expect(after.delta.profile.seasonWins).toBe(deltaBefore.seasonWins);
    expect(after.delta.profile.seasonLosses).toBe(deltaBefore.seasonLosses);
    expect(after.delta.profile.currentStreak).toBe(0);
    const detail = await repos.battles.getById(battle.id);
    expect(detail!.battle.winnerId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Imported executions
// ---------------------------------------------------------------------------

describe("BattleRepository.saveImportedExecutions", () => {
  it("stores events with battle linkage and skips duplicates on re-import", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await twoTraders(repos);
    const account = await repos.traders.findOrCreateCsvAccount(
      kevin.user.id,
      "MFFU-50K-001",
      { bracket: "50K" },
    );
    const battle = await repos.battles.create(
      battleInput(kevin.user.id, delta.user.id, 1684, 1712),
    );

    const events = [
      importEvent({ providerEventId: "csv-row-1" }),
      importEvent({ providerEventId: "csv-row-2", side: "SELL" }),
    ];
    const first = await repos.battles.saveImportedExecutions(
      battle.id,
      kevin.user.id,
      account.id,
      events,
    );
    expect(first).toEqual({ inserted: 2, skippedDuplicates: 0 });

    // Idempotent re-import: same provider event ids are skipped.
    const second = await repos.battles.saveImportedExecutions(
      battle.id,
      kevin.user.id,
      account.id,
      [...events, importEvent({ providerEventId: "csv-row-3" })],
    );
    expect(second).toEqual({ inserted: 1, skippedDuplicates: 2 });

    const stored = await repos.battles.listImportedExecutions(
      battle.id,
      kevin.user.id,
    );
    expect(stored).toHaveLength(3);
    expect(stored.every((e) => e.battleId === battle.id)).toBe(true);
    expect(stored.every((e) => e.tradingAccountId === account.id)).toBe(true);
    expect(stored.every((e) => e.verificationStatus === "SELF_REPORTED")).toBe(true);
    // Chronological order.
    const times = stored.map((e) => e.occurredAt);
    expect(times).toEqual([...times].sort());
  });
});

// ---------------------------------------------------------------------------
// CSV accounts
// ---------------------------------------------------------------------------

describe("TraderRepository.findOrCreateCsvAccount", () => {
  it("creates a SELF_REPORTED MFFU csv account with bracket balances", async () => {
    const repos = freshRepos();
    const { kevin } = await twoTraders(repos);
    const account = await repos.traders.findOrCreateCsvAccount(
      kevin.user.id,
      "MFFU-50K-777",
      { bracket: "50K", displayLabel: "MFFU 50K Eval" },
    );
    expect(account.provider).toBe("csv");
    expect(account.accountType).toBe("PROP_EVALUATION");
    expect(account.propFirm).toBe("MFFU");
    expect(account.startingBalance).toBe(50000);
    expect(account.currentBalance).toBe(50000);
    expect(account.verificationStatus).toBe("SELF_REPORTED");
    expect(account.connectionStatus).toBe("CONNECTED");
    expect(account.status).toBe("ACTIVE");
    expect(account.metadata.planName).toBe("MFFU 50K Eval");

    // Same (user, provider, externalAccountId) -> the same account.
    const again = await repos.traders.findOrCreateCsvAccount(
      kevin.user.id,
      "MFFU-50K-777",
    );
    expect(again.id).toBe(account.id);
    const accounts = await repos.traders.getAccounts(kevin.user.id);
    expect(accounts.filter((a) => a.externalAccountId === "MFFU-50K-777")).toHaveLength(1);
  });

  it("defaults unknown brackets to a 0 balance", () => {
    expect(bracketStartingBalance("50K")).toBe(50000);
    expect(bracketStartingBalance("150k")).toBe(150000);
    expect(bracketStartingBalance("mystery")).toBe(0);
    expect(bracketStartingBalance(undefined)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

describe("ChallengeRepository", () => {
  it("creates PENDING challenges, lists newest first, responds, links battles", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await twoTraders(repos);

    const first = await repos.challenges.create({
      challengerUserId: kevin.user.id,
      opponentUserId: delta.user.id,
      sessionDate: "2026-07-22",
      battleWindow: "OPENING_BELL",
      accountBracket: "50K",
      message: "NY open tomorrow?",
      createdAt: "2026-07-21T18:00:00.000Z",
    });
    const second = await repos.challenges.create({
      challengerUserId: kevin.user.id,
      opponentUserId: delta.user.id,
      sessionDate: "2026-07-23",
      battleWindow: "FULL_SESSION",
      accountBracket: "50K",
      createdAt: "2026-07-21T19:00:00.000Z",
    });

    expect(first.status).toBe("PENDING");
    expect(first.id.startsWith("challenge-")).toBe(true);
    expect(first.market).toBeNull();
    expect(first.battleId).toBeNull();

    const kevinLists = await repos.challenges.listForUser(kevin.user.id);
    expect(kevinLists.outgoing.map((c) => c.id)).toEqual([second.id, first.id]);
    expect(kevinLists.incoming).toHaveLength(0);
    const deltaLists = await repos.challenges.listForUser(delta.user.id);
    expect(deltaLists.incoming.map((c) => c.id)).toEqual([second.id, first.id]);

    const accepted = await repos.challenges.respond(
      first.id,
      "ACCEPTED",
      "2026-07-21T20:00:00.000Z",
    );
    expect(accepted?.status).toBe("ACCEPTED");
    expect(accepted?.respondedAt).toBe("2026-07-21T20:00:00.000Z");
    expect(await repos.challenges.respond("challenge-missing", "DECLINED", "x")).toBeNull();

    const battle = await repos.battles.create(
      battleInput(kevin.user.id, delta.user.id, 1684, 1712),
    );
    await repos.challenges.linkBattle(first.id, battle.id);
    expect((await repos.challenges.getById(first.id))?.battleId).toBe(battle.id);
  });
});

// ---------------------------------------------------------------------------
// Market bars
// ---------------------------------------------------------------------------

describe("MarketDataRepository", () => {
  const bar = (minute: number, close: number) => ({
    barStart: `2026-07-22T14:${String(minute).padStart(2, "0")}:00.000Z`,
    open: close - 2,
    high: close + 3,
    low: close - 4,
    close,
    volume: 1000 + minute,
  });

  it("upserts bars per (instrument, barStart) and reports inserted/replaced", async () => {
    const repos = freshRepos();
    const first = await repos.marketData.saveBars(
      "NQ",
      [bar(0, 20100), bar(1, 20110)],
      "csv",
    );
    expect(first).toEqual({ inserted: 2, replaced: 0 });

    const second = await repos.marketData.saveBars(
      "NQ",
      [bar(1, 20115), bar(2, 20120)],
      "csv",
    );
    expect(second).toEqual({ inserted: 1, replaced: 1 });

    // The replaced bar serves its NEW close. Query at 14:02:00Z — the
    // instant the 14:01 bar (1 minute long) actually closes.
    const mark = await repos.marketData.getMarkPrice(
      "NQ",
      "2026-07-22T14:02:00.000Z",
    );
    expect(mark?.price).toBe(20115);

    // Same key on a different instrument is a separate row.
    const es = await repos.marketData.saveBars("ES", [bar(1, 5600)], "csv");
    expect(es).toEqual({ inserted: 1, replaced: 0 });
    expect(await repos.marketData.hasBars("ES", "2026-07-22T14:00:00Z", "2026-07-22T14:02:00Z")).toBe(true);
    expect(await repos.marketData.hasBars("GC", "2026-07-22T14:00:00Z", "2026-07-22T14:02:00Z")).toBe(false);
  });

  it("getMarkPrice enforces the 5-minute freshness cutoff", async () => {
    const repos = freshRepos();
    await repos.marketData.saveBars("NQ", [bar(0, 20100)], "csv");

    // 4m59s after the bar start: still fresh.
    const fresh = await repos.marketData.getMarkPrice("NQ", "2026-07-22T14:04:59.000Z");
    expect(fresh).toEqual({ price: 20100, barStart: "2026-07-22T14:00:00.000Z" });
    // Exactly 5 minutes: the bound is exclusive (barStart > at - 5min fails).
    expect(await repos.marketData.getMarkPrice("NQ", "2026-07-22T14:05:00.000Z")).toBeNull();
    // Bars in the future of `at` are never used.
    expect(await repos.marketData.getMarkPrice("NQ", "2026-07-22T13:59:59.000Z")).toBeNull();
    // Picks the LATEST qualifying bar.
    await repos.marketData.saveBars("NQ", [bar(1, 20110), bar(2, 20120)], "csv");
    const latest = await repos.marketData.getMarkPrice("NQ", "2026-07-22T14:03:00.000Z");
    expect(latest?.price).toBe(20120);
  });

  it("selectMarkPrice is pure and deterministic over unordered bars", () => {
    const bars: MarketBar[] = [
      {
        id: "bar-NQ-b",
        instrument: "NQ",
        barStart: "2026-07-22T14:02:00.000Z",
        open: 1,
        high: 2,
        low: 0,
        close: 20120,
        volume: 10,
        source: "csv",
        importedAt: "2026-07-22T16:00:00.000Z",
      },
      {
        id: "bar-NQ-a",
        instrument: "NQ",
        barStart: "2026-07-22T14:01:00.000Z",
        open: 1,
        high: 2,
        low: 0,
        close: 20110,
        volume: 10,
        source: "csv",
        importedAt: "2026-07-22T16:00:00.000Z",
      },
    ];
    // Queried at 14:03:00Z — the instant the 14:02 bar (1 minute long) closes.
    expect(selectMarkPrice(bars, "2026-07-22T14:03:00.000Z")?.price).toBe(20120);
    expect(selectMarkPrice([], "2026-07-22T14:03:00.000Z")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// derive.ts null-guards (nullable market / unsettled participants)
// ---------------------------------------------------------------------------

describe("derive null-guards", () => {
  const baseBattle: Battle = {
    id: "battle-x",
    battleType: "LIVE_PERFORMANCE",
    market: null,
    status: "SCHEDULED",
    scheduledStart: "2026-07-22T13:30:00.000Z",
    scheduledEnd: "2026-07-22T15:00:00.000Z",
    actualStart: null,
    endTime: null,
    battleWindow: "OPENING_BELL",
    scoringConfigurationId: "scoring-config-pnl-v1",
    scoringMode: "PNL_V1",
    accountBracket: "50K",
    winnerId: null,
    decidedBy: null,
    resolutionDetail: null,
    verificationStatus: "SELF_REPORTED",
    createdAt: "2026-07-21T00:00:00.000Z",
  };
  const unsettled: BattleParticipant = {
    id: "bp-battle-x-user-a",
    battleId: "battle-x",
    userId: "user-a",
    tradingAccountId: null,
    startingRating: 1500,
    endingRating: null,
    finalScore: null,
    result: null,
    verificationStatus: "SELF_REPORTED",
    realizedPnl: null,
    participationBonus: null,
    closedTradeCount: null,
    grossProfit: null,
    grossLoss: null,
    markOutPnl: null,
    markOutStatus: null,
    markOutNote: null,
  };

  it("excludes non-completed battles from history and null markets from filters", () => {
    const completedNullMarket: Battle = {
      ...baseBattle,
      id: "battle-y",
      status: "COMPLETED",
    };
    const participants = new Map([
      ["battle-x", [unsettled]],
      ["battle-y", [{ ...unsettled, battleId: "battle-y" }]],
    ]);
    // SCHEDULED battle never appears; COMPLETED null-market battle appears
    // unfiltered but never matches a market filter.
    expect(
      filterBattleHistory([baseBattle, completedNullMarket], "user-a", participants),
    ).toEqual([completedNullMarket]);
    expect(
      filterBattleHistory(
        [baseBattle, completedNullMarket],
        "user-a",
        participants,
        { market: "NQ" },
      ),
    ).toEqual([]);
  });

  it("firm standings skip unsettled battles and null-market buckets", () => {
    const firm = {
      id: "firm-mffu",
      slug: "mffu",
      name: "MFFU",
      kind: "PROP_FIRM" as const,
      description: "demo",
      isDemoData: true,
    };
    const trader = {
      user: {
        id: "user-a",
        displayName: "GuardTester",
        email: "guard@example.com",
        avatarUrl: null,
        isDemoUser: false,
        authUserId: null,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
      profile: {
        userId: "user-a",
        firmId: firm.id,
        rating: 1600,
        league: "GOLD" as const,
        division: "III" as const,
        primaryMarket: "NQ" as const,
        secondaryMarkets: [],
        battleStyle: "BALANCED" as const,
        disciplineScore: 50,
        riskScore: 50,
        performanceScore: 50,
        seasonWins: 1,
        seasonLosses: 0,
        lifetimeWins: 1,
        lifetimeLosses: 0,
        currentStreak: 1,
        bestWinStreak: 1,
        seasonStartRating: 1500,
        seasonHighRating: 1600,
      },
      firm,
    };
    // battle-x: SCHEDULED (never counted); battle-y: COMPLETED, null market,
    // settled WIN (no market bucket, but counts as a win); battle-z:
    // COMPLETED on NQ with a null result participant (bucketed, no W/L).
    const settledWin: BattleParticipant = {
      ...unsettled,
      battleId: "battle-y",
      tradingAccountId: "acct-1",
      endingRating: 1616,
      finalScore: 245,
      result: "WIN",
    };
    const standings = deriveFirmStandings(
      firm,
      [trader],
      [
        baseBattle,
        {
          ...baseBattle,
          id: "battle-y",
          status: "COMPLETED",
          scheduledStart: "2026-07-16T13:30:00.000Z",
        },
        {
          ...baseBattle,
          id: "battle-z",
          status: "COMPLETED",
          market: "NQ",
          scheduledStart: "2026-07-16T13:30:00.000Z",
        },
      ],
      new Map([
        ["battle-x", [unsettled]],
        ["battle-y", [settledWin]],
        ["battle-z", [{ ...unsettled, battleId: "battle-z" }]],
      ]),
    );
    // Only battle-z has a market; battle-y's null market is bucketless.
    expect(standings.mostTradedMarkets).toEqual([{ market: "NQ", battles: 1 }]);
    // Only the settled WIN counts; null results contribute nothing.
    expect(standings.weeklyWins).toBe(1);
    expect(standings.weeklyLosses).toBe(0);
  });

  it("toSettledParticipant rejects unsettled rows", () => {
    expect(() => toSettledParticipant(unsettled)).toThrow(/no settlement/);
    const settled = toSettledParticipant({
      ...unsettled,
      tradingAccountId: "acct-1",
      endingRating: 1516,
      finalScore: 245,
      result: "WIN",
    });
    expect(settled.result).toBe("WIN");
  });
});
