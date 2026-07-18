# Executions pipeline

Pure functions that turn raw provider events into account state. This is the
single path all trading activity flows through — mock today, real providers
later — so nothing downstream knows the source.

Will contain (Phase 5):

- `normalizeExecution.ts` — provider event → `NormalizedExecutionEvent`.
- `deduplicateExecution.ts` — idempotent event intake.
- `positionLedger.ts` — positions, realized/unrealized P&L, drawdown.
- `processExecutionEvent.ts` — the pipeline entrypoint.

Rules: pure functions only — no I/O, no framework imports, unit-testable.
