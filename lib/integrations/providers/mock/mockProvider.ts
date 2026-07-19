/**
 * mockProvider — the demo's TradingIntegrationProvider implementation.
 *
 * Implements the EXACT interface a real NinjaTrader / Tradovate / Rithmic
 * adapter will implement (lib/integrations/types.ts), backed by the
 * deterministic scenario scripts in mockEventGenerator.ts instead of a live
 * connection. Everything it emits is verificationStatus SIMULATED and must
 * be surfaced in the UI as "Simulated Demo Data" / "Demo Verified".
 *
 * PLUG-IN POINT FOR REAL INTEGRATIONS: drop a sibling provider folder in,
 * implement `TradingIntegrationProvider`, and nothing downstream changes —
 * the pipeline, battle engine, scoring, and UI cannot tell the difference.
 *
 * The subscription mechanic keeps a tiny in-memory registry (connection
 * state is inherently stateful); all data it serves remains pure and seeded.
 */

import type {
  ConnectAccountInput,
  ConnectedAccount,
  DateRange,
  NormalizedAccountSnapshot,
  NormalizedExecutionEvent,
  TradingIntegrationProvider,
  UnsubscribeFunction,
} from "@/lib/integrations/types";
import { normalizeExecution } from "@/lib/executions/normalizeExecution";
import { applyFill, createLedger } from "@/lib/executions/positionLedger";
import {
  MFFU_50K_RAPID,
  TRADEIFY_50K_ADVANCED,
} from "@/lib/battles/battleRules";
import {
  generateBattleScript,
  type MockBattleScript,
} from "./mockEventGenerator";
import { SCENARIO_IDS, type ScenarioId } from "./scenarioDefinitions";

/** The demo accounts this provider can serve (matches the seed dataset). */
const KNOWN_ACCOUNTS: Record<
  string,
  { displayName: string; startingBalance: number }
> = {
  [MFFU_50K_RAPID.externalAccountId]: {
    displayName: MFFU_50K_RAPID.accountLabel,
    startingBalance: MFFU_50K_RAPID.startingBalance,
  },
  [TRADEIFY_50K_ADVANCED.externalAccountId]: {
    displayName: TRADEIFY_50K_ADVANCED.accountLabel,
    startingBalance: TRADEIFY_50K_ADVANCED.startingBalance,
  },
};

/** Which scenario an account snapshot/history reflects (Demo Controls). */
let activeScenarioId: ScenarioId = SCENARIO_IDS[0];

export function setMockActiveScenario(scenarioId: ScenarioId): void {
  activeScenarioId = scenarioId;
}

function scriptFor(scenarioId: ScenarioId): MockBattleScript {
  return generateBattleScript(scenarioId);
}

/** All normalized executions for one account within the active scenario. */
function normalizedExecutionsFor(
  accountId: string,
  scenarioId: ScenarioId,
): NormalizedExecutionEvent[] {
  const script = scriptFor(scenarioId);
  const events: NormalizedExecutionEvent[] = [];
  const seen = new Set<string>();
  for (const item of script.timeline) {
    if (item.kind !== "EXECUTION") continue;
    if (item.record.accountId !== accountId) continue;
    // Provider-side re-deliveries stay in the raw stream (the pipeline's
    // dedupe stage handles them); history reads are already unique.
    if (seen.has(item.record.providerEventId)) continue;
    seen.add(item.record.providerEventId);
    const normalized = normalizeExecution(item.record);
    if (normalized.ok) events.push(normalized.event);
  }
  return events;
}

const connectedAccounts = new Map<string, ConnectedAccount>();

export const mockProvider: TradingIntegrationProvider = {
  providerName: "mock",

  async connectAccount(input: ConnectAccountInput): Promise<ConnectedAccount> {
    const known = KNOWN_ACCOUNTS[input.externalAccountId];
    if (!known) {
      throw new Error(
        `mock provider: unknown demo account "${input.externalAccountId}"`,
      );
    }
    const account: ConnectedAccount = {
      accountId: input.externalAccountId,
      provider: "mock",
      externalAccountId: input.externalAccountId,
      displayName: known.displayName,
      status: "CONNECTED",
      verificationStatus: "SIMULATED",
    };
    connectedAccounts.set(account.accountId, account);
    return account;
  },

  async disconnectAccount(accountId: string): Promise<void> {
    connectedAccounts.delete(accountId);
  },

  async getAccountSnapshot(
    accountId: string,
  ): Promise<NormalizedAccountSnapshot> {
    const known = KNOWN_ACCOUNTS[accountId];
    if (!known) {
      throw new Error(`mock provider: unknown demo account "${accountId}"`);
    }
    // End-of-session snapshot for the active scenario, derived by replaying
    // the account's fills through the same position ledger the pipeline uses.
    const script = scriptFor(activeScenarioId);
    let ledger = createLedger(script.market);
    let lastTimestamp = script.startTimestampMs;
    for (const event of normalizedExecutionsFor(accountId, activeScenarioId)) {
      if (event.eventType === "FILL" || event.eventType === "PARTIAL_FILL") {
        ledger = applyFill(ledger, event);
        lastTimestamp = Date.parse(event.occurredAt);
      }
    }
    return {
      accountId,
      sourceProvider: "mock",
      balance: known.startingBalance + ledger.realizedPnl,
      equity: known.startingBalance + ledger.equity,
      realizedPnl: ledger.realizedPnl,
      unrealizedPnl: ledger.unrealizedPnl,
      openPosition: ledger.open
        ? ledger.open.side === "LONG"
          ? ledger.open.quantity
          : -ledger.open.quantity
        : 0,
      drawdown: ledger.maxDrawdown,
      timestamp: new Date(lastTimestamp).toISOString(),
      verificationStatus: "SIMULATED",
    };
  },

  async getHistoricalExecutions(
    accountId: string,
    range: DateRange,
  ): Promise<NormalizedExecutionEvent[]> {
    const startMs = Date.parse(range.start);
    const endMs = Date.parse(range.end);
    return normalizedExecutionsFor(accountId, activeScenarioId).filter(
      (event) => {
        const occurredMs = Date.parse(event.occurredAt);
        return occurredMs >= startMs && occurredMs <= endMs;
      },
    );
  },

  async subscribeToExecutions(
    accountId: string,
    callback: (event: NormalizedExecutionEvent) => void,
  ): Promise<UnsubscribeFunction> {
    // Demo transport: replay the active scenario's stream asynchronously in
    // order. The live-battle UI drives battles through the engine's stepping
    // API instead; this exists so the provider contract is fully honored and
    // can be swapped for a real event stream later.
    let cancelled = false;
    const events = normalizedExecutionsFor(accountId, activeScenarioId);
    void Promise.resolve().then(() => {
      for (const event of events) {
        if (cancelled) return;
        callback(event);
      }
    });
    return () => {
      cancelled = true;
    };
  },
};
