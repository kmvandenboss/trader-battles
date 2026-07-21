/**
 * Repository accessor — the single place the app obtains data access.
 *
 * Backend selection (server-side only; repositories are never imported by
 * client components):
 *   - DATABASE_URL set   → Postgres (Neon) implementation (./postgres),
 *     the v1 real-data path.
 *   - DATABASE_URL unset → in-memory deterministic demo seed (./inMemory),
 *     zero external services — the demo and Vercel preview default.
 *
 * Both implementations share the derivation helpers in ./derive.ts, so
 * standings, leaderboards, and percentiles are identical on either backend.
 */

import { getSeedDataset } from "../seed";
import { createInMemoryRepositories } from "./inMemory";
import { createPostgresRepositories } from "./postgres";
import type { Repositories } from "./types";

export * from "./types";
export { createInMemoryRepositories } from "./inMemory";
export { createPostgresRepositories } from "./postgres";

let repositories: Repositories | null = null;

/**
 * Process-wide repository set: Postgres when DATABASE_URL is set, otherwise
 * the deterministic in-memory demo seed.
 */
export function getRepositories(): Repositories {
  if (!repositories) {
    const databaseUrl = process.env.DATABASE_URL;
    repositories = databaseUrl
      ? createPostgresRepositories(databaseUrl)
      : createInMemoryRepositories(getSeedDataset());
  }
  return repositories;
}
