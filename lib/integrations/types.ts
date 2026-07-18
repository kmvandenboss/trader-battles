/**
 * Integration layer contract (Phase 0 placeholder).
 *
 * This module will define the `TradingIntegrationProvider` interface and the
 * raw provider event types described in docs/PRODUCT_BRIEF.md. Every source
 * of trading activity — the mock provider today, NinjaTrader / Tradovate /
 * Rithmic later — implements this contract and feeds the same normalization
 * pipeline in lib/executions/. Nothing downstream may depend on a concrete
 * provider.
 *
 * Real types land in Phase 1 (domain model). Do not put scoring, battle, or
 * UI concerns in this file.
 */

/** Known provider identifiers. Only "mock" is implemented in the demo. */
export type IntegrationProviderId =
  | "mock"
  | "ninjatrader"
  | "tradovate"
  | "rithmic";
