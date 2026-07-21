# Repositories

Swappable data-access layer. The rest of the app obtains data ONLY through
`getRepositories()` (index.ts), which returns the `Repositories` interface
set defined in `types.ts`.

- `types.ts` — repository interfaces + composite read models
  (TraderWithProfile, BattleSummary/Detail, FirmStandings, ...). All methods
  async so persistence can change without caller changes.
- `derive.ts` — pure derivation helpers (leaderboards, standings,
  percentiles, firm records, battle summaries) shared by BOTH
  implementations so they can never drift. Derived from traders + battles at
  read time, never stored.
- `inMemory.ts` — the demo implementation, backed by the deterministic seed
  dataset in `lib/data/seed`. The default when `DATABASE_URL` is unset.
- `postgres/` — the v1 real-data implementation (Drizzle + Neon via
  neon-http). Standard Postgres; migrates to MFFU's own DB untouched. See
  `docs/database.md`.
- `index.ts` — `getRepositories()` selects the backend by env:
  `DATABASE_URL` set → Postgres, unset → in-memory seed. Zero changes to
  scoring, battles, or UI either way.
