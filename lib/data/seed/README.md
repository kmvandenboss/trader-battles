# Seed data

Deterministic demo dataset, authored in TypeScript and served in-memory (no
database). Regenerate/verify with `npm run seed`; the same fixed seed always
produces byte-identical output (mulberry32 streams in `rng.ts` — never
unseeded `Math.random()`).

- `constants.ts` — master SEED, season calendar (2026-03-16 → 2026-07-18),
  ET battle windows, default score weights (mirrors the brief).
- `roster.ts` — 44 authored traders (all leagues/divisions covered) across
  the six demo firms. KevinV and DeltaHunter specs are locked by CLAUDE.md.
- `demoScript.ts` — KevinV's hand-authored 29-battle season (18-11, 3W
  streak, 7-2 morning NQ) and the showcase battle vs DeltaHunter mirroring
  the brief's worked scoring example (83.9 vs 73.6).
- `firms.ts` / `achievements.ts` — demo firm + badge catalogs (demo labels
  only; no real partnership implied).
- `buildDataset.ts` — generates 190 completed battles, rating chains that
  land exactly on each trader's target rating, derived records/streaks,
  execution events + snapshots, badges, notifications.
- `validateSeed.ts` — invariant checks shared by `npm run seed` and vitest.

Every account, connection, battle, participant, execution event, and
snapshot carries `verificationStatus: "SIMULATED"` — never PROVIDER_VERIFIED
— and no secrets are stored anywhere.
