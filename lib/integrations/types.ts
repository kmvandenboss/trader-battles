/**
 * Integration layer contract — the `TradingIntegrationProvider` interface and
 * the normalized shapes every provider adapter must emit.
 *
 * PLUG-IN POINT FOR REAL INTEGRATIONS: the mock provider
 * (providers/mock/mockProvider.ts) implements this exact interface today;
 * future NinjaTrader / Tradovate / Rithmic adapters implement it too and feed
 * the same normalization pipeline in lib/executions/. Nothing downstream
 * (pipeline, battle engine, scoring, UI) may depend on a concrete provider —
 * it must be impossible to tell mock data from real data past this boundary.
 *
 * No framework imports, no I/O in the types. Scoring, battle, and UI concerns
 * do not belong in this file.
 */

import type {
  ExecutionEventType,
  IntegrationProvider,
  Market,
  OrderSide,
  VerificationStatus,
} from "@/lib/data/schema";

/** Known provider identifiers. Only "mock" is implemented in the demo. */
export type IntegrationProviderId = IntegrationProvider;

/** ISO-8601 UTC bounds, inclusive. */
export interface DateRange {
  start: string;
  end: string;
}

export type UnsubscribeFunction = () => void;

/**
 * What a caller supplies to connect an account through a provider.
 * Real providers will exchange `credentialRef` for tokens held in a secrets
 * store — secrets never travel through this interface or get persisted on
 * domain rows.
 */
export interface ConnectAccountInput {
  userId: string;
  /** Provider-native account identifier (e.g. "SIM-50K-84127"). */
  externalAccountId: string;
  /** Opaque reference to credentials in a secrets store. Unused by mock. */
  credentialRef?: string;
}

/** A provider-connected account, as reported back by the adapter. */
export interface ConnectedAccount {
  /** Provider-scoped account id used for all subsequent calls. */
  accountId: string;
  provider: IntegrationProviderId;
  externalAccountId: string;
  displayName: string;
  status: "CONNECTED" | "DISCONNECTED" | "PENDING" | "ERROR";
  /** Demo accounts are always SIMULATED (surfaced as "Demo Verified"). */
  verificationStatus: VerificationStatus;
}

/**
 * Point-in-time account state, normalized across providers.
 * Mirrors the `account_snapshots` table (lib/data/schema/tables.ts).
 */
export interface NormalizedAccountSnapshot {
  accountId: string;
  sourceProvider: IntegrationProviderId;
  balance: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  /** Signed contracts: positive long, negative short, 0 flat. */
  openPosition: number;
  drawdown: number;
  /** ISO-8601 UTC. */
  timestamp: string;
  verificationStatus: VerificationStatus;
}

/**
 * A fully normalized execution event — the ONLY shape that may enter the
 * pipeline (lib/executions/processExecutionEvent.ts). Field-for-field aligned
 * with the `execution_events` table so persisted rows and live events match.
 */
export interface NormalizedExecutionEvent {
  /** Provider-native event id — dedupe key together with sourceProvider. */
  providerEventId: string;
  sourceProvider: IntegrationProviderId;
  /** Provider-scoped account the execution belongs to. */
  accountId: string;
  instrument: Market;
  side: OrderSide;
  /** Contracts, positive integer. */
  quantity: number;
  price: number;
  /** Dollars, >= 0, for this event. */
  commission: number;
  /** ISO-8601 UTC — when the provider says it happened. */
  occurredAt: string;
  /** ISO-8601 UTC — when our pipeline received it. */
  receivedAt: string;
  eventType: ExecutionEventType;
  /** Mock provider events are always SIMULATED. */
  verificationStatus: VerificationStatus;
  /** Provider payload as received, for audit/replay. */
  rawPayload: Record<string, unknown>;
}

/**
 * The common pre-validation shape a provider-specific adapter emits.
 * `lib/executions/normalizeExecution.ts` validates one of these (accepted as
 * `unknown`) into a `NormalizedExecutionEvent` — malformed records are
 * rejected with reasons, never silently coerced.
 */
export interface RawExecutionRecord {
  providerEventId: string;
  sourceProvider: string;
  accountId: string;
  /** Raw symbol; futures month codes are allowed (e.g. "NQU6" -> NQ). */
  instrument: string;
  side: string;
  quantity: number;
  price: number;
  commission?: number;
  occurredAt: string;
  eventType: string;
  verificationStatus?: string;
  rawPayload?: Record<string, unknown>;
}

/**
 * The provider adapter interface (docs/PRODUCT_BRIEF.md, "Integration
 * Adapter Architecture"). Every source of trading activity — mock today,
 * NinjaTrader / Tradovate / Rithmic / CQG / ProjectX later — implements this.
 */
export interface TradingIntegrationProvider {
  providerName: IntegrationProviderId;
  connectAccount(input: ConnectAccountInput): Promise<ConnectedAccount>;
  disconnectAccount(accountId: string): Promise<void>;
  getAccountSnapshot(accountId: string): Promise<NormalizedAccountSnapshot>;
  getHistoricalExecutions(
    accountId: string,
    range: DateRange,
  ): Promise<NormalizedExecutionEvent[]>;
  /**
   * Optional live stream. The demo drives battles through a timed tick loop
   * instead, but the mock provider implements this too so the transport can
   * later be swapped for a real event stream without touching downstream code.
   */
  subscribeToExecutions?(
    accountId: string,
    callback: (event: NormalizedExecutionEvent) => void,
  ): Promise<UnsubscribeFunction>;
}
