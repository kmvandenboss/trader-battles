/**
 * settlementService — end-to-end v1 loop against the fully-functional
 * in-memory repositories: challenge → accept → import both sides → import
 * bars → settle. Numbers are hand-computed (see settleBattle.test.ts for
 * the arithmetic).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildSeedDataset } from "@/lib/data/seed";
import { createInMemoryRepositories } from "@/lib/data/repositories/inMemory";
import type { Repositories } from "@/lib/data/repositories/types";
import {
  importForBattle,
  importMarketBars,
  settleScheduledBattle,
} from "@/lib/battles/settlementService";
import { acceptChallenge, createChallenge } from "@/lib/battles/challengeService";
import { ServiceError } from "@/lib/battles/serviceErrors";

const KEVIN_CSV = readFileSync(
  new URL("./fixtures/trades-nq-3shorts.csv", import.meta.url),
  "utf8",
);
const BARS_CSV = readFileSync(
  new URL("./fixtures/bars-nq-buzzer.csv", import.meta.url),
  "utf8",
);

const HEADER =
  "trading_account_id,asset,asset_code,short_long,total_contracts," +
  "open_datetime,close_datetime,seconds_held,avg_market_entry," +
  "avg_market_close,market_profit,commission_and_fees,net_profit," +
  "winner_loser,status,stage,broker";

/** Opponent import: one closed LONG (+195.32) + one open LONG 1 @ 29600
 * entered in-window (marked at 29650 → +$1,000 when bars exist). */
const DELTA_CSV = [
  HEADER,
  "33333333-3333-4333-8333-333333333333,NQU6,NQ,LONG,1,2026-07-13T13:35:00.000000,2026-07-13T13:40:00.000000,300,29500,29510,10,4.68,195.32,WIN,CLOSED,evaluation,DemoBroker",
  "33333333-3333-4333-8333-333333333333,NQU6,NQ,LONG,1,2026-07-13T14:30:00.000000,,,29600,,,,,,OPEN,evaluation,DemoBroker",
].join("\n");

const IMPORTED_AT = "2026-07-13T15:10:00.000Z";
const SETTLED_AT = "2026-07-13T16:00:00.000Z";

function freshRepos(): Repositories {
  return createInMemoryRepositories(buildSeedDataset());
}

async function scheduledBattle(repos: Repositories) {
  const kevin = await repos.traders.getByDisplayName("KevinV");
  const delta = await repos.traders.getByDisplayName("DeltaHunter");
  if (!kevin || !delta) throw new Error("seed traders missing");
  const challenge = await createChallenge(
    repos,
    {
      challengerUserId: kevin.user.id,
      opponentUserId: delta.user.id,
      sessionDate: "2026-07-13",
      battleWindow: "OPENING_BELL",
      accountBracket: "50K",
    },
    { createdAt: "2026-07-12T18:00:00.000Z", today: "2026-07-12" },
  );
  const accepted = await acceptChallenge(repos, {
    challengeId: challenge.id,
    actingUserId: delta.user.id,
    respondedAt: "2026-07-12T19:00:00.000Z",
  });
  return { kevin, delta, battle: accepted.battle };
}

describe("importForBattle", () => {
  it("imports a participant's CSV, creates the account, persists events, and previews the window", async () => {
    const repos = freshRepos();
    const { kevin, battle } = await scheduledBattle(repos);

    const result = await importForBattle(repos, {
      battleId: battle.id,
      userId: kevin.user.id,
      csvText: KEVIN_CSV,
      importedAt: IMPORTED_AT,
    });

    expect(result.account.provider).toBe("csv");
    expect(result.account.externalAccountId).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.persisted).toEqual({ inserted: 6, skippedDuplicates: 0 });
    // All three trades entered AND exited inside 13:30–15:00Z.
    expect(result.preview).toEqual({
      tradesInWindow: 3,
      tradesOutsideWindow: 0,
      openAtBuzzer: 0,
    });

    const stored = await repos.battles.listImportedExecutions(battle.id, kevin.user.id);
    expect(stored).toHaveLength(6);
    expect(stored.every((e) => e.verificationStatus === "SELF_REPORTED")).toBe(true);
  });

  it("is idempotent: re-importing the same file persists zero new events", async () => {
    const repos = freshRepos();
    const { kevin, battle } = await scheduledBattle(repos);
    const base = { battleId: battle.id, userId: kevin.user.id, csvText: KEVIN_CSV, importedAt: IMPORTED_AT };

    await importForBattle(repos, base);
    const second = await importForBattle(repos, { ...base, importedAt: "2026-07-13T15:20:00.000Z" });
    expect(second.persisted).toEqual({ inserted: 0, skippedDuplicates: 6 });
    expect(await repos.battles.listImportedExecutions(battle.id, kevin.user.id)).toHaveLength(6);
  });

  it("previews open-at-buzzer positions honestly", async () => {
    const repos = freshRepos();
    const { delta, battle } = await scheduledBattle(repos);
    const result = await importForBattle(repos, {
      battleId: battle.id,
      userId: delta.user.id,
      csvText: DELTA_CSV,
      importedAt: IMPORTED_AT,
    });
    expect(result.preview).toEqual({
      tradesInWindow: 1,
      tradesOutsideWindow: 0,
      openAtBuzzer: 1,
    });
  });

  it("rejects imports from non-participants and for unknown battles", async () => {
    const repos = freshRepos();
    const { battle } = await scheduledBattle(repos);
    await expect(
      importForBattle(repos, {
        battleId: battle.id,
        userId: "user-somebody-else",
        csvText: KEVIN_CSV,
        importedAt: IMPORTED_AT,
      }),
    ).rejects.toMatchObject({ code: "NOT_A_PARTICIPANT" });
    await expect(
      importForBattle(repos, {
        battleId: "battle-nope",
        userId: "user-x",
        csvText: KEVIN_CSV,
        importedAt: IMPORTED_AT,
      }),
    ).rejects.toMatchObject({ code: "BATTLE_NOT_FOUND" });
  });

  it("rejects a second import for the same battle from a different trading account", async () => {
    const repos = freshRepos();
    const { kevin, battle } = await scheduledBattle(repos);
    await importForBattle(repos, {
      battleId: battle.id,
      userId: kevin.user.id,
      csvText: KEVIN_CSV, // account 11111111-...
      importedAt: IMPORTED_AT,
    });

    const differentAccountCsv = [
      HEADER,
      "22222222-2222-4222-8222-222222222222,NQU6,NQ,LONG,1,2026-07-13T13:35:00.000000,2026-07-13T13:40:00.000000,300,29500,29510,10,4.68,195.32,WIN,CLOSED,evaluation,DemoBroker",
    ].join("\n");

    await expect(
      importForBattle(repos, {
        battleId: battle.id,
        userId: kevin.user.id,
        csvText: differentAccountCsv,
        importedAt: "2026-07-13T15:20:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_MISMATCH" });

    // The rejected import must not have persisted any events from the
    // second account alongside the first.
    const stored = await repos.battles.listImportedExecutions(battle.id, kevin.user.id);
    expect(stored.every((e) => e.tradingAccountId === stored[0].tradingAccountId)).toBe(true);
  });

  it("wraps unusable files in a typed CSV_INVALID error", async () => {
    const repos = freshRepos();
    const { kevin, battle } = await scheduledBattle(repos);
    await expect(
      importForBattle(repos, {
        battleId: battle.id,
        userId: kevin.user.id,
        csvText: "date,pnl\n2026-07-13,100",
        importedAt: IMPORTED_AT,
      }),
    ).rejects.toMatchObject({ code: "CSV_INVALID" });
  });
});

describe("importMarketBars", () => {
  it("parses and persists bars", async () => {
    const repos = freshRepos();
    const result = await importMarketBars(repos, { instrument: "NQ", csvText: BARS_CSV });
    expect(result.parsedBars).toBe(6);
    expect(result.saved).toEqual({ inserted: 6, replaced: 0 });
    const mark = await repos.marketData.getMarkPrice("NQ", "2026-07-13T15:00:00.000Z");
    expect(mark?.price).toBe(29650);
  });

  it("throws CSV_INVALID for an unusable bars file", async () => {
    const repos = freshRepos();
    await expect(
      importMarketBars(repos, { instrument: "NQ", csvText: "a,b\n1,2" }),
    ).rejects.toMatchObject({ code: "CSV_INVALID" });
  });
});

describe("settleScheduledBattle", () => {
  async function fullFlow(repos: Repositories, withBars = true) {
    const setup = await scheduledBattle(repos);
    await importForBattle(repos, {
      battleId: setup.battle.id,
      userId: setup.kevin.user.id,
      csvText: KEVIN_CSV,
      importedAt: IMPORTED_AT,
    });
    await importForBattle(repos, {
      battleId: setup.battle.id,
      userId: setup.delta.user.id,
      csvText: DELTA_CSV,
      importedAt: IMPORTED_AT,
    });
    if (withBars) {
      await importMarketBars(repos, { instrument: "NQ", csvText: BARS_CSV });
    }
    return setup;
  }

  it("settles the full battle: winner, scores, ratings, persistence", async () => {
    const repos = freshRepos();
    const { kevin, delta, battle } = await fullFlow(repos);

    const { settlement } = await settleScheduledBattle(repos, {
      battleId: battle.id,
      settledAt: SETTLED_AT,
    });

    // Hand-computed: Kevin 2066.60 + 15 = 2081.60; Delta 195.32 + 5 + 1000
    // mark-out = 1200.32. Ratings 1684 +26 → 1710, 1712 -26 → 1686.
    expect(settlement.winnerId).toBe(kevin.user.id);
    expect(settlement.resolution.decidedBy).toBe("SCORE");
    const [a, b] = settlement.participants;
    expect(a.score.score).toBe(2081.6);
    expect(b.score.score).toBe(1200.32);
    expect(b.score.markOut).toMatchObject({ status: "MARKED", pnl: 1000 });
    expect(a.rating.newRating).toBe(1710);
    expect(b.rating.newRating).toBe(1686);

    // Persisted: battle COMPLETED with results and updated profiles.
    const detail = await repos.battles.getById(battle.id);
    expect(detail?.battle.status).toBe("COMPLETED");
    expect(detail?.battle.winnerId).toBe(kevin.user.id);
    const kevinAfter = await repos.traders.getById(kevin.user.id);
    const deltaAfter = await repos.traders.getById(delta.user.id);
    expect(kevinAfter?.profile.rating).toBe(1710);
    expect(deltaAfter?.profile.rating).toBe(1686);
    expect(settlement.report.join("\n")).toContain("Decided by SCORE");

    // The persisted + rendered resolution detail names the traders (winner
    // first) — never the scoring engine's positional "A"/"B" labels.
    expect(settlement.resolutionDetail).toBe(
      "KevinV wins on score: 2081.6 vs 1200.32 points.",
    );
    expect(detail?.battle.resolutionDetail).toBe(settlement.resolutionDetail);
    expect(detail?.battle.resolutionDetail).not.toMatch(/\b[AB] wins/);
    expect(settlement.report.join("\n")).toContain("KevinV");
  });

  it("is idempotent: re-settling a COMPLETED battle yields the identical result", async () => {
    const repos = freshRepos();
    const { kevin, battle } = await fullFlow(repos);

    const first = await settleScheduledBattle(repos, { battleId: battle.id, settledAt: SETTLED_AT });
    const second = await settleScheduledBattle(repos, { battleId: battle.id, settledAt: SETTLED_AT });

    expect(second.settlement.settlementInput).toEqual(first.settlement.settlementInput);
    const kevinAfter = await repos.traders.getById(kevin.user.id);
    expect(kevinAfter?.profile.rating).toBe(1710); // not double-applied
  });

  it("excludes the open position honestly when no bars were imported", async () => {
    const repos = freshRepos();
    const { battle } = await fullFlow(repos, false);
    const { settlement } = await settleScheduledBattle(repos, {
      battleId: battle.id,
      settledAt: SETTLED_AT,
    });
    const delta = settlement.participants[1];
    expect(delta.score.markOut.status).toBe("EXCLUDED_NO_MARK");
    expect(delta.score.score).toBe(200.32); // 195.32 + 5, no mark-out
    expect(settlement.settlementInput.participants[1].markOutNote).toContain("no mark price");
  });

  it("refuses to settle before the window closes", async () => {
    const repos = freshRepos();
    const { battle } = await fullFlow(repos);
    await expect(
      settleScheduledBattle(repos, { battleId: battle.id, settledAt: "2026-07-13T14:00:00.000Z" }),
    ).rejects.toMatchObject({ code: "WINDOW_NOT_CLOSED" });
  });

  it("waits for both imports before settling", async () => {
    const repos = freshRepos();
    const { kevin, battle } = await scheduledBattle(repos);
    await importForBattle(repos, {
      battleId: battle.id,
      userId: kevin.user.id,
      csvText: KEVIN_CSV,
      importedAt: IMPORTED_AT,
    });
    try {
      await settleScheduledBattle(repos, { battleId: battle.id, settledAt: SETTLED_AT });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError);
      expect((error as ServiceError).code).toBe("WAITING_ON_IMPORT");
      expect((error as ServiceError).message).toContain("DeltaHunter");
    }
  });

  it("rejects unknown battles", async () => {
    const repos = freshRepos();
    await expect(
      settleScheduledBattle(repos, { battleId: "battle-nope", settledAt: SETTLED_AT }),
    ).rejects.toMatchObject({ code: "BATTLE_NOT_FOUND" });
  });
});
