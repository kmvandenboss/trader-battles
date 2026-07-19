# Mock provider

The **only** source of demo trading activity in the entire app.

- `mockProvider.ts` — implements the full `TradingIntegrationProvider`
  interface from `lib/integrations/types.ts` (connect/disconnect, snapshots,
  historical executions, subscribe). Everything it emits is
  `verificationStatus: SIMULATED`.
- `scenarioDefinitions.ts` — the three authored demo scenarios: one shared
  NQ price tape + both traders' planned trades per scenario, each with its
  own PRNG seed.
- `mockEventGenerator.ts` — deterministic script generation: seeded
  (mulberry32) tick-aligned price path, raw order/fill events for both
  participants, and one intentional duplicate delivery so the pipeline's
  dedupe stage is exercised on every run. No unseeded `Math.random()`.

Raw events flow through `lib/executions/*` exactly like a future real
provider's would — downstream modules cannot tell the difference. Do not
generate demo data anywhere else (not in UI components, not in the scoring
engine).
