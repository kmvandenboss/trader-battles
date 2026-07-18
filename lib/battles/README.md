# Battles

Battle orchestration built on the execution pipeline and scoring engine.

Will contain (Phase 5+):

- `battleEngine.ts` — drives a battle from normalized execution events to
  metrics, scores, and snapshots.
- `matchmaking.ts` — queueing and opponent selection.
- `battleRules.ts` — rule definitions and violation detection.

The engine consumes `lib/executions/*` output and calls `lib/scoring/*`; it
must not care whether events came from the mock provider or a real one.
