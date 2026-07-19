# Integration roadmap

How real trading-platform integrations would plug into Trader Battles later.

**Status today: nothing is connected.** This demo runs on 100% simulated data from the mock provider.
The `ninjatrader/`, `tradovate/`, and `rithmic/` folders under `lib/integrations/providers/` contain
README stubs only — no implementation, no API access, and **no partnership, endorsement, or confirmed
integration with any firm or platform is implied** by anything in this document or the product. The
in-app `/integrations` page is a coming-soon placeholder. Phases below are a design plan, not
commitments.

## The contracts that make integrations drop-in

The demo was built so that real providers replace simulated data with **zero changes to scoring,
battles, matchmaking, or UI**. Five seams already exist in the code:

1. **`TradingIntegrationProvider`** (`lib/integrations/types.ts`) — every source of trading activity
   implements `connectAccount` / `disconnectAccount` / `getAccountSnapshot` /
   `getHistoricalExecutions` / optional `subscribeToExecutions`. The mock provider
   (`providers/mock/mockProvider.ts`) implements this exact interface today, including the optional
   subscription, so the contract is already exercised.
2. **The normalized-execution-event boundary** — adapters emit `RawExecutionRecord`s, which
   `lib/executions/normalizeExecution.ts` validates into `NormalizedExecutionEvent`s (the only shape
   allowed into the pipeline, field-for-field aligned with the `execution_events` table). Past this
   boundary it is impossible to tell mock data from real data: dedupe, the position ledger, battle
   metrics, scoring, and ratings all consume the same shapes.
3. **`BattleScriptSource`** (`lib/battles/battleScript.ts`) — the battle engine consumes a
   provider-agnostic script (price tape + raw execution events). The mock source is only the
   registered demo default; a live deployment registers a source built from a real provider's quote
   and execution streams and calls the same `createBattleState(scriptId, source)`.
4. **The BattleClock transport** (`components/battle/useBattleClock.ts`) — the demo's timed client
   tick loop is the documented seam to swap for an SSE/WebSocket subscription delivering
   server-computed engine snapshots. `BattleClockOutput` stays identical, so no UI component changes.
5. **The repository interface** (`lib/data/repositories/`) — all reads go through `Repositories`
   (async by design). The in-memory seed implementation is swapped for a Postgres implementation
   built on the **existing Drizzle schema** (`lib/data/schema/`) behind `getRepositories()`, with
   zero caller changes.

Verification status travels with every account, event, and battle: live data would arrive as
`PROVIDER_VERIFIED` (or `CLIENT_VERIFIED` for desktop-add-on paths) instead of today's universal
`SIMULATED` — see [integrity-and-verification.md](integrity-and-verification.md).

## Phase 1 — NinjaTrader desktop add-on

A desktop add-on running alongside the user's NinjaTrader installation:

- Reads executions, order events, position changes, and account snapshots locally.
- Authenticates the user and binds the specific account to their Trader Battles identity
  (ownership verification, not just data access).
- Sends **signed, normalized events** to the ingestion endpoint; the server validates signatures,
  then runs the exact pipeline in `lib/executions/` (normalize → dedupe → ledger). Because events are
  attested by client software rather than the provider itself, they enter as `CLIENT_VERIFIED`.
- Supports live battle scoring by streaming events during a battle window (feeding a live
  `BattleScriptSource`).
- Provides a **CSV fallback** for post-session import when live streaming is unavailable (the schema
  already models this as the `FILE_IMPORT` connection type; imported events would be
  `SELF_REPORTED`/`CLIENT_VERIFIED` and deduped like any other delivery).

## Phase 2 — Direct Tradovate integration

Server-to-server integration, subject to API availability:

- User authorization (OAuth-style grant); tokens held in a secrets store and referenced by the opaque
  `credentialRef` already present in `ConnectAccountInput` — secrets never travel through the adapter
  interface or land on domain rows.
- Historical executions via `getHistoricalExecutions` and account snapshots via
  `getAccountSnapshot`.
- Live event stream where supported, via `subscribeToExecutions`.
- Provider-level verification: events arrive as `PROVIDER_VERIFIED`, the strongest state.

## Phase 3 — Additional providers

- **Rithmic** — provider-level connection, subject to commercial access and technical approval.
- **CQG**, **ProjectX**, and other broker or prop-firm systems — same adapter pattern.
- Each is one new folder implementing `TradingIntegrationProvider` plus an entry in the
  `INTEGRATION_PROVIDERS` enum (`lib/data/schema/enums.ts`); the enum currently lists
  `mock | ninjatrader | tradovate | rithmic`, so CQG/ProjectX would be additive entries.
- TradingView is deliberately **not** planned as an execution-data source; at most a future charting
  or alert layer, never an authoritative record of manual trades.

## Phase 4 — Partner infrastructure

Once multiple live providers exist:

- Firm dashboards (team standings, roster activity) built on the same repositories.
- Sponsored leagues and private communities.
- Webhooks and enterprise APIs for firms consuming battle results.
- Fraud and abuse monitoring at scale — collusion detection, multi-account controls, and dispute
  tooling as outlined in [integrity-and-verification.md](integrity-and-verification.md).

## What never changes

`lib/scoring/`, `lib/ratings/`, `lib/executions/`, `lib/battles/battleEngine.ts`, and every UI
component consume normalized shapes and already-computed results. Swapping the mock provider for a
real one touches only: a new provider folder, a live `BattleScriptSource`, a server transport behind
the BattleClock seam, and a Postgres-backed `Repositories` implementation. See
[architecture.md](architecture.md) for the full module map.
