# docs/

Documentation for the Trader Battles demo. Start with the root [README](../README.md).

- [`PRODUCT_BRIEF.md`](PRODUCT_BRIEF.md) — the full product brief this build follows.
- [`architecture.md`](architecture.md) — the one-directional data flow, module boundaries, and the
  seams where real integrations, a real database, and a live event stream plug in later.
- [`scoring.md`](scoring.md) — both scoring modes: `PNL_V1` (realized PnL + participation bonus +
  tiebreaker cascade, used for settled v1 battles) and the retained `NORMALIZED_4F` model with its
  four weighted components, discipline penalties, and worked example; plus the Elo-style rating
  change.
- [`csv-import.md`](csv-import.md) — the v1 CSV formats (trade export + 1-minute bars), per-row
  integrity checks, deterministic dedupe, window rules, and mark-out — the reference for testers.
- [`v1-divergences.md`](v1-divergences.md) — where the real MFFU v1 diverges from the demo (the
  product decisions).
- [`integration-roadmap.md`](integration-roadmap.md) — how real trading-platform providers plug in
  behind the existing interfaces with zero changes to scoring, battles, or UI.
- [`integrity-and-verification.md`](integrity-and-verification.md) — verification states, the
  simulated-data labeling policy, dedupe/audit trail, and determinism guarantees.
- [`database.md`](database.md) — the Neon Postgres backend behind the repository interface and the
  env-switched in-memory fallback.
- [`auth.md`](auth.md) — the temporary Auth.js bridge: credentials + JWT sessions, the
  `getCurrentUser()`/`getCurrentTrader()` seam, and the demo fallback.
- [`handoffs/STATE.md`](handoffs/STATE.md) — build-state handoff doc for development sessions.
