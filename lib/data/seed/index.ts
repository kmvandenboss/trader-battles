/**
 * Deterministic demo seed — public entrypoint.
 *
 * `getSeedDataset()` returns a lazily-built, process-wide singleton. The
 * build is pure and seeded (see buildDataset.ts), so every process — dev
 * server, Vercel lambda, test runner, seed script — sees the exact same
 * data. There is no database in the demo; the in-memory repositories in
 * lib/data/repositories consume this dataset directly.
 */

import { buildSeedDataset, type SeedDataset } from "./buildDataset";

export { buildSeedDataset } from "./buildDataset";
export type { SeedDataset } from "./buildDataset";
export { validateSeedDataset } from "./validateSeed";
export { DEMO_USER_ID, DEMO_OPPONENT_ID } from "./roster";
export { DEMO_TODAY, SEASON_NAME, SEASON_START } from "./constants";

let cached: SeedDataset | null = null;

/** The canonical demo dataset (cached; deterministic across processes). */
export function getSeedDataset(): SeedDataset {
  if (!cached) cached = buildSeedDataset();
  return cached;
}
