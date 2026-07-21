# docs/

Documentation for the Trader Battles demo. Start with the root [README](../README.md).

- [`PRODUCT_BRIEF.md`](PRODUCT_BRIEF.md) — the full product brief this build follows.
- [`architecture.md`](architecture.md) — the one-directional data flow, module boundaries, and the
  seams where real integrations, a real database, and a live event stream plug in later.
- [`scoring.md`](scoring.md) — the 0–100 battle score, its four weighted components, discipline
  penalties, the Elo-style rating change, and the worked example.
- [`integration-roadmap.md`](integration-roadmap.md) — how real trading-platform providers plug in
  behind the existing interfaces with zero changes to scoring, battles, or UI.
- [`integrity-and-verification.md`](integrity-and-verification.md) — verification states, the
  simulated-data labeling policy, dedupe/audit trail, and determinism guarantees.
- [`database.md`](database.md) — the Neon Postgres backend behind the repository interface and the
  env-switched in-memory fallback.
- [`auth.md`](auth.md) — the temporary Auth.js bridge: credentials + JWT sessions, the
  `getCurrentUser()`/`getCurrentTrader()` seam, and the demo fallback.
- [`handoffs/STATE.md`](handoffs/STATE.md) — build-state handoff doc for development sessions.
