/**
 * challengeService — DI'd orchestration of the v1 direct-challenge flow.
 *
 * "[decided] Direct challenges, same window, scheduled ahead" — a trader
 * challenges a specific opponent to a named future window (session date +
 * battle window); on accept the challenge materializes into a SCHEDULED
 * battle whose UTC bounds come from windowBoundsUtc. Both trade that same
 * window; settlement (settlementService) scores it afterwards.
 *
 * Every function takes a `Repositories` instance (dependency injection) and
 * explicit timestamps — no Date.now anywhere; "today" is a parameter.
 * Expected caller mistakes throw typed `ServiceError`s (see
 * serviceErrors.ts).
 */

import type { BattleWindow, Market } from "@/lib/data/schema";
import type { Battle, Challenge } from "@/lib/data/schema";
import type { Repositories } from "@/lib/data/repositories/types";
import { windowBoundsUtc } from "./battleWindows";
import { ServiceError } from "./serviceErrors";

// ---------------------------------------------------------------------------
// createChallenge
// ---------------------------------------------------------------------------

export interface CreateChallengeServiceInput {
  challengerUserId: string;
  opponentUserId: string;
  /** ISO calendar date of the proposed session, e.g. "2026-07-22". */
  sessionDate: string;
  battleWindow: BattleWindow;
  /** Optional instrument pin; null/omitted = open choice (the v1 default). */
  market?: Market | null;
  /** Account-size bracket both sides compete in, e.g. "50K". */
  accountBracket: string;
  message?: string | null;
}

export interface CreateChallengeOptions {
  /** ISO UTC — when the challenge is being created. */
  createdAt: string;
  /** Today's ISO calendar date ("YYYY-MM-DD") — the caller's clock, never
   * read here. The session must be today or later. */
  today: string;
}

export async function createChallenge(
  repos: Repositories,
  input: CreateChallengeServiceInput,
  options: CreateChallengeOptions,
): Promise<Challenge> {
  if (input.opponentUserId === input.challengerUserId) {
    throw new ServiceError("SELF_CHALLENGE", "You cannot challenge yourself.");
  }
  const challenger = await repos.traders.getById(input.challengerUserId);
  if (!challenger) {
    throw new ServiceError(
      "TRADER_NOT_FOUND",
      `Challenger ${input.challengerUserId} does not exist.`,
    );
  }
  const opponent = await repos.traders.getById(input.opponentUserId);
  if (!opponent) {
    throw new ServiceError(
      "TRADER_NOT_FOUND",
      "That opponent does not exist.",
    );
  }

  // Validates the date string itself (throws on malformed/impossible dates).
  try {
    windowBoundsUtc(input.sessionDate, input.battleWindow);
  } catch (error) {
    throw new ServiceError(
      "INVALID_SESSION_DATE",
      error instanceof Error ? error.message : "Invalid session date.",
    );
  }
  // ISO calendar dates compare correctly as strings.
  if (input.sessionDate < options.today) {
    throw new ServiceError(
      "INVALID_SESSION_DATE",
      `The session date ${input.sessionDate} is in the past — challenges ` +
        "must name today or a future session.",
    );
  }

  return repos.challenges.create({
    challengerUserId: input.challengerUserId,
    opponentUserId: input.opponentUserId,
    sessionDate: input.sessionDate,
    battleWindow: input.battleWindow,
    market: input.market ?? null,
    accountBracket: input.accountBracket,
    message: input.message ?? null,
    createdAt: options.createdAt,
  });
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface ChallengeResponseInput {
  challengeId: string;
  /** The signed-in user performing the action. */
  actingUserId: string;
  /** ISO UTC. */
  respondedAt: string;
}

export interface AcceptChallengeResult {
  challenge: Challenge;
  /** The SCHEDULED battle materialized from the challenge. */
  battle: Battle;
}

async function requirePendingChallenge(
  repos: Repositories,
  challengeId: string,
): Promise<Challenge> {
  const challenge = await repos.challenges.getById(challengeId);
  if (!challenge) {
    throw new ServiceError("CHALLENGE_NOT_FOUND", `Challenge ${challengeId} does not exist.`);
  }
  if (challenge.status !== "PENDING") {
    throw new ServiceError(
      "CHALLENGE_NOT_PENDING",
      `This challenge is already ${challenge.status} — only pending challenges can be responded to.`,
    );
  }
  return challenge;
}

/**
 * Accept a pending challenge (opponent only): computes the UTC window from
 * the named ET session, captures both traders' CURRENT ratings as the
 * battle's starting ratings, creates the SCHEDULED battle (challenger is
 * participant 0), links it to the challenge, and marks it ACCEPTED.
 *
 * Race safety: neon-http has no transactions, so this can't be one atomic
 * step. The conditional `respond` (PENDING->ACCEPTED) runs FIRST, before
 * anything is created — a concurrent accept/decline/cancel that already
 * flipped the status makes this call a no-op (null), and NO battle is ever
 * materialized for the loser. The remaining gap is narrower: if battle
 * creation fails AFTER this challenge is marked ACCEPTED (e.g. a downstream
 * write error), the challenge is accepted with no battle — a genuine
 * failure surfaces to the caller rather than silently duplicating a battle.
 */
export async function acceptChallenge(
  repos: Repositories,
  input: ChallengeResponseInput,
): Promise<AcceptChallengeResult> {
  const challenge = await requirePendingChallenge(repos, input.challengeId);
  if (input.actingUserId !== challenge.opponentUserId) {
    throw new ServiceError(
      "NOT_CHALLENGE_OPPONENT",
      "Only the challenged trader can accept this challenge.",
    );
  }

  // Side-effect-free checks up front, so a doomed accept never flips the
  // challenge's status before failing.
  const bounds = windowBoundsUtc(challenge.sessionDate, challenge.battleWindow);
  const challenger = await repos.traders.getById(challenge.challengerUserId);
  const opponent = await repos.traders.getById(challenge.opponentUserId);
  if (!challenger || !opponent) {
    throw new ServiceError(
      "TRADER_NOT_FOUND",
      "A participant of this challenge no longer exists.",
    );
  }

  const updated = await repos.challenges.respond(
    challenge.id,
    "ACCEPTED",
    input.respondedAt,
    { expectedStatus: "PENDING" },
  );
  if (!updated) {
    throw new ServiceError(
      "CHALLENGE_NOT_PENDING",
      "This challenge was just responded to by someone else.",
    );
  }

  // Only the accept that won the guard above ever creates a battle.
  const battle = await repos.battles.create({
    scheduledStart: bounds.startAt,
    scheduledEnd: bounds.endAt,
    battleWindow: challenge.battleWindow,
    market: challenge.market,
    accountBracket: challenge.accountBracket,
    participants: [
      {
        userId: challenge.challengerUserId,
        startingRating: challenger.profile.rating,
      },
      {
        userId: challenge.opponentUserId,
        startingRating: opponent.profile.rating,
      },
    ],
    createdAt: input.respondedAt,
  });
  await repos.challenges.linkBattle(challenge.id, battle.id);

  return { challenge: updated, battle };
}

/** Decline a pending challenge (opponent only). */
export async function declineChallenge(
  repos: Repositories,
  input: ChallengeResponseInput,
): Promise<Challenge> {
  const challenge = await requirePendingChallenge(repos, input.challengeId);
  if (input.actingUserId !== challenge.opponentUserId) {
    throw new ServiceError(
      "NOT_CHALLENGE_OPPONENT",
      "Only the challenged trader can decline this challenge.",
    );
  }
  const updated = await repos.challenges.respond(
    challenge.id,
    "DECLINED",
    input.respondedAt,
    { expectedStatus: "PENDING" },
  );
  if (!updated) {
    throw new ServiceError(
      "CHALLENGE_NOT_PENDING",
      "This challenge was just responded to by someone else.",
    );
  }
  return updated;
}

/** Cancel a pending challenge (challenger only). */
export async function cancelChallenge(
  repos: Repositories,
  input: ChallengeResponseInput,
): Promise<Challenge> {
  const challenge = await requirePendingChallenge(repos, input.challengeId);
  if (input.actingUserId !== challenge.challengerUserId) {
    throw new ServiceError(
      "NOT_CHALLENGER",
      "Only the challenger can cancel this challenge.",
    );
  }
  const updated = await repos.challenges.respond(
    challenge.id,
    "CANCELLED",
    input.respondedAt,
    { expectedStatus: "PENDING" },
  );
  if (!updated) {
    throw new ServiceError(
      "CHALLENGE_NOT_PENDING",
      "This challenge was just responded to by someone else.",
    );
  }
  return updated;
}
