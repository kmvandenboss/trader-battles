# Executions pipeline

Pure functions that turn raw provider events into account state. This is the
single path all trading activity flows through — mock today, real providers
later — so nothing downstream knows the source.

```
raw provider event -> normalizeExecution (validate)
  -> deduplicateExecution (provider + event id, at-most-once)
  -> positionLedger (positions, avg entry, realized/unrealized P&L,
     equity curve, peak equity, max drawdown, severe-drawdown time,
     completed round-trip trades)
  -> derivePipelineMetrics -> BattleMetricsInput (the scoring contract)
```

- `normalizeExecution.ts` — untrusted provider record → `NormalizedExecutionEvent`;
  malformed events are rejected with reasons, futures contract symbols
  (`NQU6`) resolve to markets.
- `deduplicateExecution.ts` — idempotent intake keyed by
  `sourceProvider:providerEventId`.
- `positionLedger.ts` — per-market point values (NQ $20/pt, tick 0.25, …),
  scale-ins/partials/reversals, everything scoring needs at any timestamp.
- `processExecutionEvent.ts` — the pipeline entrypoint the battle engine calls.

Rules: pure functions only — no I/O, no framework imports, fully
JSON-serializable state, unit-tested in `tests/executions.test.ts`.
