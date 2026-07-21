/**
 * challengeService — create / accept / decline / cancel against the
 * in-memory repositories, including every rejection path.
 */

import { describe, expect, it } from "vitest";

import { buildSeedDataset } from "@/lib/data/seed";
import { createInMemoryRepositories } from "@/lib/data/repositories/inMemory";
import type { Repositories } from "@/lib/data/repositories/types";
import {
  acceptChallenge,
  cancelChallenge,
  createChallenge,
  declineChallenge,
} from "@/lib/battles/challengeService";

function freshRepos(): Repositories {
  return createInMemoryRepositories(buildSeedDataset());
}

const CREATED_AT = "2026-07-18T12:00:00.000Z";
const TODAY = "2026-07-18";
const RESPONDED_AT = "2026-07-18T13:00:00.000Z";

async function seedTraders(repos: Repositories) {
  const kevin = await repos.traders.getByDisplayName("KevinV");
  const delta = await repos.traders.getByDisplayName("DeltaHunter");
  if (!kevin || !delta) throw new Error("seed traders missing");
  return { kevin, delta };
}

function challengeInput(kevinId: string, deltaId: string) {
  return {
    challengerUserId: kevinId,
    opponentUserId: deltaId,
    sessionDate: "2026-07-22",
    battleWindow: "OPENING_BELL" as const,
    accountBracket: "50K",
    message: "NY open, first to blink",
  };
}

describe("createChallenge", () => {
  it("creates a PENDING challenge for a valid future session", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await seedTraders(repos);
    const challenge = await createChallenge(
      repos,
      challengeInput(kevin.user.id, delta.user.id),
      { createdAt: CREATED_AT, today: TODAY },
    );
    expect(challenge).toMatchObject({
      status: "PENDING",
      challengerUserId: kevin.user.id,
      opponentUserId: delta.user.id,
      sessionDate: "2026-07-22",
      battleWindow: "OPENING_BELL",
      accountBracket: "50K",
      battleId: null,
    });
    const lists = await repos.challenges.listForUser(delta.user.id);
    expect(lists.incoming.map((c) => c.id)).toContain(challenge.id);
  });

  it("accepts a same-day session (today)", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await seedTraders(repos);
    const challenge = await createChallenge(
      repos,
      { ...challengeInput(kevin.user.id, delta.user.id), sessionDate: TODAY },
      { createdAt: CREATED_AT, today: TODAY },
    );
    expect(challenge.sessionDate).toBe(TODAY);
  });

  it("rejects self-challenges, unknown traders, and bad session dates", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await seedTraders(repos);
    const opts = { createdAt: CREATED_AT, today: TODAY };

    await expect(
      createChallenge(repos, challengeInput(kevin.user.id, kevin.user.id), opts),
    ).rejects.toMatchObject({ code: "SELF_CHALLENGE" });

    await expect(
      createChallenge(
        repos,
        { ...challengeInput(kevin.user.id, delta.user.id), opponentUserId: "user-ghost" },
        opts,
      ),
    ).rejects.toMatchObject({ code: "TRADER_NOT_FOUND" });

    for (const sessionDate of ["2026-07-17", "2026-02-30", "07/22/2026"]) {
      await expect(
        createChallenge(
          repos,
          { ...challengeInput(kevin.user.id, delta.user.id), sessionDate },
          opts,
        ),
      ).rejects.toMatchObject({ code: "INVALID_SESSION_DATE" });
    }
  });
});

describe("acceptChallenge", () => {
  it("materializes a SCHEDULED battle with the computed UTC window and current ratings", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await seedTraders(repos);
    const challenge = await createChallenge(
      repos,
      challengeInput(kevin.user.id, delta.user.id),
      { createdAt: CREATED_AT, today: TODAY },
    );

    const { challenge: accepted, battle } = await acceptChallenge(repos, {
      challengeId: challenge.id,
      actingUserId: delta.user.id,
      respondedAt: RESPONDED_AT,
    });

    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.battleId).toBe(battle.id);
    expect(accepted.respondedAt).toBe(RESPONDED_AT);
    // 2026-07-22 is EDT: OPENING_BELL 9:30–11:00 ET = 13:30–15:00Z.
    expect(battle.scheduledStart).toBe("2026-07-22T13:30:00.000Z");
    expect(battle.scheduledEnd).toBe("2026-07-22T15:00:00.000Z");
    expect(battle.status).toBe("SCHEDULED");
    expect(battle.battleWindow).toBe("OPENING_BELL");
    expect(battle.accountBracket).toBe("50K");
    expect(battle.market).toBeNull(); // open instrument choice (v1 default)

    const scheduled = await repos.battles.getScheduledById(battle.id);
    expect(scheduled?.participants).toHaveLength(2);
    const ratings = Object.fromEntries(
      (scheduled?.participants ?? []).map((p) => [
        p.participant.userId,
        p.participant.startingRating,
      ]),
    );
    expect(ratings[kevin.user.id]).toBe(1684);
    expect(ratings[delta.user.id]).toBe(1712);
  });

  it("only the opponent can accept; only PENDING challenges respond", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await seedTraders(repos);
    const challenge = await createChallenge(
      repos,
      challengeInput(kevin.user.id, delta.user.id),
      { createdAt: CREATED_AT, today: TODAY },
    );

    await expect(
      acceptChallenge(repos, {
        challengeId: challenge.id,
        actingUserId: kevin.user.id,
        respondedAt: RESPONDED_AT,
      }),
    ).rejects.toMatchObject({ code: "NOT_CHALLENGE_OPPONENT" });

    await acceptChallenge(repos, {
      challengeId: challenge.id,
      actingUserId: delta.user.id,
      respondedAt: RESPONDED_AT,
    });
    await expect(
      acceptChallenge(repos, {
        challengeId: challenge.id,
        actingUserId: delta.user.id,
        respondedAt: RESPONDED_AT,
      }),
    ).rejects.toMatchObject({ code: "CHALLENGE_NOT_PENDING" });

    await expect(
      acceptChallenge(repos, {
        challengeId: "challenge-nope",
        actingUserId: delta.user.id,
        respondedAt: RESPONDED_AT,
      }),
    ).rejects.toMatchObject({ code: "CHALLENGE_NOT_FOUND" });
  });

  it("two concurrent accepts materialize exactly one battle", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await seedTraders(repos);
    const challenge = await createChallenge(
      repos,
      challengeInput(kevin.user.id, delta.user.id),
      { createdAt: CREATED_AT, today: TODAY },
    );

    const results = await Promise.allSettled([
      acceptChallenge(repos, {
        challengeId: challenge.id,
        actingUserId: delta.user.id,
        respondedAt: RESPONDED_AT,
      }),
      acceptChallenge(repos, {
        challengeId: challenge.id,
        actingUserId: delta.user.id,
        respondedAt: RESPONDED_AT,
      }),
    ]);

    // Exactly one accept wins the PENDING->ACCEPTED guard; the other sees
    // the already-flipped status and creates NO battle (the guard runs
    // before battle creation — see acceptChallenge's header comment).
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const loser = results.find((r) => r.status === "rejected");
    expect((loser as PromiseRejectedResult).reason).toMatchObject({
      code: "CHALLENGE_NOT_PENDING",
    });

    const scheduled = await repos.battles.listScheduledForUser(kevin.user.id);
    const forThisChallenge = scheduled.filter(
      (s) => s.battle.battleWindow === challenge.battleWindow,
    );
    expect(forThisChallenge).toHaveLength(1);
  });
});

describe("declineChallenge / cancelChallenge", () => {
  it("lets the opponent decline and the challenger cancel — and nobody else", async () => {
    const repos = freshRepos();
    const { kevin, delta } = await seedTraders(repos);
    const opts = { createdAt: CREATED_AT, today: TODAY };

    const toDecline = await createChallenge(
      repos,
      challengeInput(kevin.user.id, delta.user.id),
      opts,
    );
    await expect(
      declineChallenge(repos, {
        challengeId: toDecline.id,
        actingUserId: kevin.user.id,
        respondedAt: RESPONDED_AT,
      }),
    ).rejects.toMatchObject({ code: "NOT_CHALLENGE_OPPONENT" });
    const declined = await declineChallenge(repos, {
      challengeId: toDecline.id,
      actingUserId: delta.user.id,
      respondedAt: RESPONDED_AT,
    });
    expect(declined.status).toBe("DECLINED");
    expect(declined.battleId).toBeNull();

    const toCancel = await createChallenge(
      repos,
      challengeInput(kevin.user.id, delta.user.id),
      opts,
    );
    await expect(
      cancelChallenge(repos, {
        challengeId: toCancel.id,
        actingUserId: delta.user.id,
        respondedAt: RESPONDED_AT,
      }),
    ).rejects.toMatchObject({ code: "NOT_CHALLENGER" });
    const cancelled = await cancelChallenge(repos, {
      challengeId: toCancel.id,
      actingUserId: kevin.user.id,
      respondedAt: RESPONDED_AT,
    });
    expect(cancelled.status).toBe("CANCELLED");

    // Responded challenges cannot be cancelled either.
    await expect(
      cancelChallenge(repos, {
        challengeId: toCancel.id,
        actingUserId: kevin.user.id,
        respondedAt: RESPONDED_AT,
      }),
    ).rejects.toMatchObject({ code: "CHALLENGE_NOT_PENDING" });
  });
});
