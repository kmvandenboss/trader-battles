/**
 * settlementService — DI'd orchestration of the v1 import → settle flow.
 *
 * Every function takes a `Repositories` instance (dependency injection —
 * this module NEVER constructs repositories itself) plus explicit
 * timestamps; there is no Date.now, no randomness, and no framework import
 * here, so the services are as testable as the pure modules they wire up.
 *
 *   importForBattle       CSV text -> pipeline -> persisted execution events
 *   importMarketBars      bars CSV -> MarketDataRepository.saveBars
 *   settleScheduledBattle replay persisted events -> settleBattle -> persist
 *
 * The pure logic lives elsewhere and is only CALLED here: parsing/pipeline
 * in lib/integrations/providers/csv + lib/executions/import, settlement math
 * in lib/battles/settleBattle (which itself calls lib/scoring +
 * lib/ratings). Expected caller mistakes throw typed `ServiceError`s with
 * honest, user-facing messages (see serviceErrors.ts).
 */

import type { Market, TradingAccount } from "@/lib/data/schema";
import type {
  ImportExecutionsResult,
  Repositories,
  SaveBarsResult,
  ScheduledBattle,
} from "@/lib/data/repositories/types";
import type { ExecutionEvent } from "@/lib/data/schema";
import type { RawExecutionRecord } from "@/lib/integrations/types";
import { parseBarsCsv } from "@/lib/integrations/providers/csv/parseBarsCsv";
import type { RowError } from "@/lib/integrations/providers/csv/csvParsing";
import {
  CsvImportError,
  importTradesFromCsv,
  replayExecutionRecords,
  type ImportTradesResult,
  type InstrumentImportResult,
} from "@/lib/executions/import/importTrades";
import {
  classifyWindow,
  settleBattle,
  type SettleBattleResult,
  type SettlementParticipantInput,
} from "./settleBattle";
import { ServiceError } from "./serviceErrors";

// ---------------------------------------------------------------------------
// importForBattle
// ---------------------------------------------------------------------------

export interface ImportForBattleInput {
  battleId: string;
  /** The participant importing their own trades. */
  userId: string;
  csvText: string;
  /** Account-size bracket for a newly created CSV account; defaults to the
   * battle's bracket. */
  bracket?: string;
  /** ISO UTC — when the import was received (stamped as receivedAt). */
  importedAt: string;
}

/** Honest pre-settlement preview so the UI can say what will actually count. */
export interface ImportWindowPreview {
  /** Realized trades that will count (entered AND exited in-window). */
  tradesInWindow: number;
  /** Realized trades that will be excluded (entered outside the window). */
  tradesOutsideWindow: number;
  /** Positions that were open at the buzzer (marked out at settlement). */
  openAtBuzzer: number;
}

export interface ImportForBattleResult {
  account: TradingAccount;
  import: ImportTradesResult;
  persisted: ImportExecutionsResult;
  preview: ImportWindowPreview;
}

export async function importForBattle(
  repos: Repositories,
  input: ImportForBattleInput,
): Promise<ImportForBattleResult> {
  const battle = await repos.battles.getScheduledById(input.battleId);
  if (!battle) {
    throw new ServiceError("BATTLE_NOT_FOUND", `Battle ${input.battleId} does not exist.`);
  }
  if (battle.battle.status === "CANCELLED") {
    throw new ServiceError(
      "BATTLE_NOT_SETTLEABLE",
      "This battle was cancelled — imports are closed.",
    );
  }
  const isParticipant = battle.participants.some(
    (p) => p.participant.userId === input.userId,
  );
  if (!isParticipant) {
    throw new ServiceError(
      "NOT_A_PARTICIPANT",
      "Only a participant of this battle can import trades for it.",
    );
  }
  const { scheduledStart, scheduledEnd } = battle.battle;
  if (!scheduledEnd) {
    throw new ServiceError(
      "BATTLE_NOT_SETTLEABLE",
      "This battle has no scheduled window end — it cannot take imports.",
    );
  }

  let imported: ImportTradesResult;
  try {
    imported = importTradesFromCsv({
      csvText: input.csvText,
      options: { receivedAt: input.importedAt },
    });
  } catch (error) {
    if (error instanceof CsvImportError) {
      throw new ServiceError("CSV_INVALID", `The file could not be imported: ${error.message}`);
    }
    throw error;
  }

  const accountId = imported.accountIds[0];
  if (!accountId) {
    throw new ServiceError(
      "EMPTY_IMPORT",
      "The file contained no valid trade rows — nothing to import." +
        (imported.summary.rejectedRows.length > 0
          ? ` ${imported.summary.rejectedRows.length} row(s) were rejected; the first reason: ` +
            imported.summary.rejectedRows[0].reason
          : ""),
    );
  }

  // One trading account per (battle, user): if this user already has
  // imported executions for this battle, the new file must resolve to the
  // SAME account, or a mixed-account ledger would corrupt round-trip
  // reconstruction at settlement (see settleScheduledBattle's replay guard).
  const existingEvents = await repos.battles.listImportedExecutions(
    input.battleId,
    input.userId,
  );
  const existingAccountId = existingEvents[0]?.tradingAccountId;

  const account = await repos.traders.findOrCreateCsvAccount(
    input.userId,
    accountId,
    { bracket: input.bracket ?? battle.battle.accountBracket ?? undefined },
  );

  if (existingAccountId && account.id !== existingAccountId) {
    throw new ServiceError(
      "ACCOUNT_MISMATCH",
      "This battle already has trades imported from a different trading " +
        "account. One account per battle — re-export from the same account, " +
        "or start a new battle to trade a different one.",
    );
  }

  const events = imported.perInstrument
    .flatMap((i) => i.events)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const persisted = await repos.battles.saveImportedExecutions(
    input.battleId,
    input.userId,
    account.id,
    events,
  );

  return {
    account,
    import: imported,
    persisted,
    preview: previewWindow(imported.perInstrument, scheduledStart, scheduledEnd),
  };
}

/**
 * Count what will/won't score. Delegates to `classifyWindow` — THE single
 * source of the window rules (settleBattle.ts) — so the preview and the
 * actual settlement can never drift apart. No mark prices are known yet at
 * preview time; that only affects `openPositionAtClose`, which this preview
 * doesn't use.
 */
function previewWindow(
  perInstrument: InstrumentImportResult[],
  startAt: string,
  endAt: string,
): ImportWindowPreview {
  const classified = classifyWindow(perInstrument, {}, Date.parse(startAt), Date.parse(endAt));
  return {
    tradesInWindow: classified.countedTrades.length,
    tradesOutsideWindow: classified.excludedTrades.length,
    openAtBuzzer:
      classified.openAtBuzzerTrades.length + classified.inWindowOpenPositionCount,
  };
}

// ---------------------------------------------------------------------------
// importMarketBars
// ---------------------------------------------------------------------------

export interface ImportMarketBarsInput {
  instrument: Market;
  csvText: string;
  /** Accepted for interface stability; the repository stamps its own
   * importedAt on the stored rows. */
  importedAt?: string;
}

export interface ImportMarketBarsResult {
  parsedBars: number;
  rejectedRows: RowError[];
  saved: SaveBarsResult;
}

export async function importMarketBars(
  repos: Repositories,
  input: ImportMarketBarsInput,
): Promise<ImportMarketBarsResult> {
  const { bars, errors } = parseBarsCsv(input.csvText);
  if (bars.length === 0) {
    throw new ServiceError(
      "CSV_INVALID",
      errors.length > 0
        ? `The bars file could not be imported: ${errors[0].reason}`
        : "The bars file contained no bars.",
    );
  }
  const saved = await repos.marketData.saveBars(input.instrument, bars, "csv");
  return { parsedBars: bars.length, rejectedRows: errors, saved };
}

// ---------------------------------------------------------------------------
// settleScheduledBattle
// ---------------------------------------------------------------------------

export interface SettleScheduledBattleInput {
  battleId: string;
  /** ISO UTC — when settlement is being run. Must be at/after the window
   * close (settle-after-the-fact, docs/v1-divergences.md). */
  settledAt: string;
}

export interface SettleScheduledBattleResult {
  battle: ScheduledBattle;
  settlement: SettleBattleResult;
}

/** Stored execution event -> the raw-record shape the pipeline replays. */
function storedEventToRawRecord(event: ExecutionEvent): RawExecutionRecord {
  return {
    providerEventId: event.providerEventId,
    sourceProvider: event.sourceProvider,
    accountId: event.tradingAccountId,
    instrument: event.instrument,
    side: event.side,
    quantity: event.quantity,
    price: event.price,
    commission: event.commission,
    occurredAt: event.occurredAt,
    eventType: event.eventType,
    verificationStatus: event.verificationStatus,
    rawPayload: event.rawPayload,
  };
}

/**
 * Settle a scheduled battle from its persisted imports. Idempotent:
 * re-running on a COMPLETED battle replays the same stored events, computes
 * the same result (ratings key off the scheduling-time startingRating), and
 * `saveSettlement` replaces the prior settlement rows.
 */
export async function settleScheduledBattle(
  repos: Repositories,
  input: SettleScheduledBattleInput,
): Promise<SettleScheduledBattleResult> {
  const battle = await repos.battles.getScheduledById(input.battleId);
  if (!battle) {
    throw new ServiceError("BATTLE_NOT_FOUND", `Battle ${input.battleId} does not exist.`);
  }
  const { status, scheduledStart, scheduledEnd, accountBracket } = battle.battle;
  if (status === "CANCELLED" || status === "LIVE" || status === "MATCHMAKING") {
    throw new ServiceError(
      "BATTLE_NOT_SETTLEABLE",
      `This battle is ${status} — only scheduled (or already settled) v1 battles can be settled.`,
    );
  }
  if (!scheduledEnd) {
    throw new ServiceError(
      "BATTLE_NOT_SETTLEABLE",
      "This battle has no scheduled window end — it cannot be settled.",
    );
  }
  if (battle.participants.length !== 2) {
    throw new ServiceError(
      "BATTLE_NOT_SETTLEABLE",
      "Settlement requires exactly two participants.",
    );
  }
  if (Date.parse(input.settledAt) < Date.parse(scheduledEnd)) {
    throw new ServiceError(
      "WINDOW_NOT_CLOSED",
      `The battle window has not closed yet — it runs until ${scheduledEnd}.`,
    );
  }

  // Both sides must have imported before anything is scored.
  const storedEvents: ExecutionEvent[][] = [];
  for (const p of battle.participants) {
    const events = await repos.battles.listImportedExecutions(
      input.battleId,
      p.participant.userId,
    );
    if (events.length === 0) {
      throw new ServiceError(
        "WAITING_ON_IMPORT",
        `Waiting on ${p.trader.user.displayName}'s trade import — both ` +
          "participants must import before the battle can settle.",
      );
    }
    // Defense in depth: importForBattle rejects a second account for the
    // same (battle, user), but if stored events ever span more than one
    // account, replaying them together would silently corrupt round-trip
    // reconstruction — refuse rather than score a merged, wrong ledger.
    const accountIds = new Set(events.map((e) => e.tradingAccountId));
    if (accountIds.size > 1) {
      throw new ServiceError(
        "ACCOUNT_MISMATCH",
        `${p.trader.user.displayName}'s imported trades span more than ` +
          "one trading account for this battle — settlement cannot proceed.",
      );
    }
    storedEvents.push(events);
  }

  await repos.battles.updateStatus(input.battleId, "SETTLING");

  // Replay each side's persisted events through the same per-instrument
  // pipelines a fresh import uses (identical ledger reconstruction).
  const replays = storedEvents.map((events) =>
    replayExecutionRecords(events.map(storedEventToRawRecord)),
  );

  // Buzzer marks for every instrument present in either import (undefined
  // when no fresh bar exists — settleBattle then excludes and notes it).
  const instruments = new Set<Market>();
  for (const replay of replays) {
    for (const r of replay.perInstrument) instruments.add(r.instrument);
  }
  const markPrices: Partial<Record<Market, number>> = {};
  for (const instrument of instruments) {
    const mark = await repos.marketData.getMarkPrice(instrument, scheduledEnd);
    if (mark) markPrices[instrument] = mark.price;
  }

  const participants = battle.participants.map((p, index) => {
    const participantInput: SettlementParticipantInput = {
      userId: p.participant.userId,
      displayName: p.trader.user.displayName,
      tradingAccountId: storedEvents[index][0].tradingAccountId,
      rating: p.participant.startingRating,
      imports: replays[index].perInstrument.map((r) => ({
        instrument: r.instrument,
        trades: r.trades,
        openPosition: r.openPosition,
      })),
      markPrices,
    };
    return participantInput;
  }) as [SettlementParticipantInput, SettlementParticipantInput];

  const settlement = settleBattle({
    battleId: input.battleId,
    window: { startAt: scheduledStart, endAt: scheduledEnd },
    accountBracket,
    participants,
  });

  await repos.battles.saveSettlement(settlement.settlementInput);

  return { battle, settlement };
}
