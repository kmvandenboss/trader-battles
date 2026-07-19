# Repositories

Swappable data-access layer. The rest of the app obtains data ONLY through
`getRepositories()` (index.ts), which returns the `Repositories` interface
set defined in `types.ts`.

- `types.ts` — repository interfaces + composite read models
  (TraderWithProfile, BattleSummary/Detail, FirmStandings, ...). All methods
  async so persistence can change without caller changes.
- `inMemory.ts` — the demo implementation, backed by the deterministic seed
  dataset in `lib/data/seed`. Firm standings, leaderboards, and ranks are
  derived from traders + battles so they can never drift.
- `index.ts` — `getRepositories()` accessor and the future plug-in point:
  a Postgres implementation (Drizzle + `lib/data/schema`) drops in here
  behind the same interfaces with zero changes to scoring, battles, or UI.
