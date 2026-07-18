# Mock provider

The **only** source of demo trading activity in the entire app.

Will contain (Phase 5):

- `mockProvider.ts` — implements the `TradingIntegrationProvider` interface
  from `lib/integrations/types.ts`.
- `mockEventGenerator.ts` — deterministic, seeded execution-event generation
  for the demo scenarios. No unseeded `Math.random()`.

Do not generate demo data anywhere else (not in UI components, not in the
scoring engine). Downstream modules must not know events came from this
provider rather than a real one.
