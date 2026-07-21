"use server";

/**
 * /challenges server actions — the ONLY mutation surface of the challenge
 * flow. Each action:
 *
 *   1. resolves the ACTING user from the server session via
 *      getCurrentIdentity() — user ids from the form are never trusted as
 *      identity (a challengeId names the challenge; who is acting comes from
 *      the session alone),
 *   2. validates enum-shaped fields against the schema tuples,
 *   3. calls the challengeService (which owns all business rules and throws
 *      typed ServiceErrors with user-facing messages), and
 *   4. returns the serializable state the client forms render inline.
 *
 * No scoring, rating, or window math here — timestamps come from the server
 * clock; everything else is the service's job.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getRepositories } from "@/lib/data/repositories";
import { getCurrentIdentity } from "@/lib/auth/currentUser";
import {
  acceptChallenge,
  cancelChallenge,
  createChallenge,
  declineChallenge,
} from "@/lib/battles/challengeService";
import { isServiceError } from "@/lib/battles/serviceErrors";
import {
  BATTLE_WINDOWS,
  MARKETS,
  type BattleWindow,
  type Market,
} from "@/lib/data/schema";
import {
  ACCOUNT_BRACKETS,
  type AccountBracket,
} from "@/components/battle-v1/labels";
import { etTodayIso } from "@/components/challenges/et-date";
import type {
  ChallengeFormState,
  ChallengeResponseState,
} from "@/components/challenges/action-state";

const MAX_MESSAGE_LENGTH = 280;

function fieldString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createChallengeAction(
  _prev: ChallengeFormState,
  formData: FormData,
): Promise<ChallengeFormState> {
  const identity = await getCurrentIdentity();
  const challengerUserId = identity.trader.user.id;

  const opponentUserId = fieldString(formData, "opponentUserId");
  const sessionDate = fieldString(formData, "sessionDate");
  const battleWindow = fieldString(formData, "battleWindow");
  const marketRaw = fieldString(formData, "market");
  const accountBracket = fieldString(formData, "accountBracket");
  const message = fieldString(formData, "message").trim();

  if (!opponentUserId) {
    return { status: "error", error: "Pick an opponent to challenge." };
  }
  if (!BATTLE_WINDOWS.includes(battleWindow as BattleWindow)) {
    return { status: "error", error: "Pick a battle window." };
  }
  if (marketRaw !== "" && !MARKETS.includes(marketRaw as Market)) {
    return { status: "error", error: "That instrument is not supported." };
  }
  if (!ACCOUNT_BRACKETS.includes(accountBracket as AccountBracket)) {
    return { status: "error", error: "Pick an account-size bracket." };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      status: "error",
      error: `Keep the message under ${MAX_MESSAGE_LENGTH} characters.`,
    };
  }

  try {
    await createChallenge(
      getRepositories(),
      {
        challengerUserId,
        opponentUserId,
        sessionDate,
        battleWindow: battleWindow as BattleWindow,
        market: marketRaw === "" ? null : (marketRaw as Market),
        accountBracket,
        message: message === "" ? null : message,
      },
      { createdAt: new Date().toISOString(), today: etTodayIso() },
    );
  } catch (error) {
    if (isServiceError(error)) {
      return { status: "error", error: error.message };
    }
    throw error;
  }

  revalidatePath("/challenges");
  return { status: "success", error: null };
}

export async function acceptChallengeAction(
  _prev: ChallengeResponseState,
  formData: FormData,
): Promise<ChallengeResponseState> {
  const identity = await getCurrentIdentity();
  const challengeId = fieldString(formData, "challengeId");

  let battleId: string;
  try {
    const result = await acceptChallenge(getRepositories(), {
      challengeId,
      actingUserId: identity.trader.user.id,
      respondedAt: new Date().toISOString(),
    });
    battleId = result.battle.id;
  } catch (error) {
    if (isServiceError(error)) return { error: error.message };
    throw error;
  }

  revalidatePath("/challenges");
  redirect(`/battles/${battleId}`);
}

export async function declineChallengeAction(
  _prev: ChallengeResponseState,
  formData: FormData,
): Promise<ChallengeResponseState> {
  const identity = await getCurrentIdentity();
  const challengeId = fieldString(formData, "challengeId");

  try {
    await declineChallenge(getRepositories(), {
      challengeId,
      actingUserId: identity.trader.user.id,
      respondedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (isServiceError(error)) return { error: error.message };
    throw error;
  }

  revalidatePath("/challenges");
  return { error: null };
}

export async function cancelChallengeAction(
  _prev: ChallengeResponseState,
  formData: FormData,
): Promise<ChallengeResponseState> {
  const identity = await getCurrentIdentity();
  const challengeId = fieldString(formData, "challengeId");

  try {
    await cancelChallenge(getRepositories(), {
      challengeId,
      actingUserId: identity.trader.user.id,
      respondedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (isServiceError(error)) return { error: error.message };
    throw error;
  }

  revalidatePath("/challenges");
  return { error: null };
}
