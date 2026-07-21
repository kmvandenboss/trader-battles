"use server";

/**
 * /battles/[id] server actions — the mutation surface of the v1
 * import → settle flow. Each action:
 *
 *   1. resolves the ACTING user from the server session via
 *      getCurrentIdentity() — form fields name the battle/instrument, never
 *      the actor,
 *   2. calls the settlementService (which owns every rule: participant
 *      checks, window checks, CSV validation, idempotent persistence) and
 *   3. returns serializable state for the client cards; ServiceError
 *      messages are rendered inline verbatim.
 *
 * No scoring, window, or P&L math here (Rule 4): the preview/counts in the
 * returned state are copied from the service result field-for-field.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getRepositories } from "@/lib/data/repositories";
import { getCurrentIdentity } from "@/lib/auth/currentUser";
import {
  importForBattle,
  importMarketBars,
  settleScheduledBattle,
} from "@/lib/battles/settlementService";
import { isServiceError } from "@/lib/battles/serviceErrors";
import { MARKETS, type Market } from "@/lib/data/schema";
import type {
  ImportBarsState,
  ImportTradesState,
  SettleState,
} from "@/components/battle-v1/action-state";

function fieldString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function readCsvFile(formData: FormData): Promise<string | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return file.text();
}

export async function importTradesAction(
  _prev: ImportTradesState,
  formData: FormData,
): Promise<ImportTradesState> {
  const identity = await getCurrentIdentity();
  const battleId = fieldString(formData, "battleId");
  const csvText = await readCsvFile(formData);
  if (!csvText) {
    return {
      status: "error",
      error: "Choose a CSV file to import.",
      result: null,
    };
  }

  try {
    const result = await importForBattle(getRepositories(), {
      battleId,
      userId: identity.trader.user.id,
      csvText,
      importedAt: new Date().toISOString(),
    });
    revalidatePath(`/battles/${battleId}`);
    return {
      status: "success",
      error: null,
      result: {
        accountLabel: result.account.externalAccountId,
        parsedRows: result.import.summary.parsedRows,
        accepted: result.import.summary.accepted,
        duplicates: result.import.summary.duplicates,
        rejectedRows: result.import.summary.rejectedRows.map((r) => ({
          line: r.line,
          reason: r.reason,
        })),
        inserted: result.persisted.inserted,
        skippedDuplicates: result.persisted.skippedDuplicates,
        preview: {
          tradesInWindow: result.preview.tradesInWindow,
          tradesOutsideWindow: result.preview.tradesOutsideWindow,
          openAtBuzzer: result.preview.openAtBuzzer,
        },
      },
    };
  } catch (error) {
    if (isServiceError(error)) {
      return { status: "error", error: error.message, result: null };
    }
    throw error;
  }
}

export async function importBarsAction(
  _prev: ImportBarsState,
  formData: FormData,
): Promise<ImportBarsState> {
  const identity = await getCurrentIdentity();
  const battleId = fieldString(formData, "battleId");
  const instrument = fieldString(formData, "instrument");
  if (!MARKETS.includes(instrument as Market)) {
    return {
      status: "error",
      error: "Pick the instrument the bars belong to.",
      result: null,
    };
  }
  const csvText = await readCsvFile(formData);
  if (!csvText) {
    return {
      status: "error",
      error: "Choose a bars CSV file to import.",
      result: null,
    };
  }

  // Bars feed the mark-out of open positions at window close, which enters
  // the score (lib/scoring/calculatePnlBattleScore.ts) — gate to a
  // participant of the battle they're attached to, same as settleBattleAction.
  if (battleId) {
    const repos = getRepositories();
    const scheduled = await repos.battles.getScheduledById(battleId);
    if (!scheduled) {
      return { status: "error", error: "This battle does not exist.", result: null };
    }
    const isParticipant = scheduled.participants.some(
      (p) => p.participant.userId === identity.trader.user.id,
    );
    if (!isParticipant) {
      return {
        status: "error",
        error: "Only a participant of this battle can import market data for it.",
        result: null,
      };
    }
  }

  try {
    const result = await importMarketBars(getRepositories(), {
      instrument: instrument as Market,
      csvText,
    });
    if (battleId) revalidatePath(`/battles/${battleId}`);
    return {
      status: "success",
      error: null,
      result: {
        instrument,
        parsedBars: result.parsedBars,
        rejectedRows: result.rejectedRows.map((r) => ({
          line: r.line,
          reason: r.reason,
        })),
        inserted: result.saved.inserted,
        replaced: result.saved.replaced,
      },
    };
  } catch (error) {
    if (isServiceError(error)) {
      return { status: "error", error: error.message, result: null };
    }
    throw error;
  }
}

export async function settleBattleAction(
  _prev: SettleState,
  formData: FormData,
): Promise<SettleState> {
  const identity = await getCurrentIdentity();
  const battleId = fieldString(formData, "battleId");
  const repos = getRepositories();

  // The settlement service is actor-agnostic (settlement is deterministic
  // from persisted imports), so gate it here: only a participant may
  // trigger it from the UI.
  const scheduled = await repos.battles.getScheduledById(battleId);
  if (!scheduled) {
    return { error: "This battle does not exist." };
  }
  const isParticipant = scheduled.participants.some(
    (p) => p.participant.userId === identity.trader.user.id,
  );
  if (!isParticipant) {
    return { error: "Only a participant of this battle can settle it." };
  }

  try {
    await settleScheduledBattle(repos, {
      battleId,
      settledAt: new Date().toISOString(),
    });
  } catch (error) {
    if (isServiceError(error)) return { error: error.message };
    throw error;
  }

  revalidatePath(`/battles/${battleId}`);
  redirect(`/battles/${battleId}`);
}
