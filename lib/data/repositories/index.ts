/**
 * Repository accessor — the single place the app obtains data access.
 *
 * PLUG-IN POINT for real persistence: when a Postgres database exists,
 * construct a PostgresRepositories implementation of `Repositories` here
 * (e.g. based on process.env.DATABASE_URL) instead of the in-memory seed
 * implementation. No server component, API route, or engine changes.
 */

import { getSeedDataset } from "../seed";
import { createInMemoryRepositories } from "./inMemory";
import type { Repositories } from "./types";

export * from "./types";
export { createInMemoryRepositories } from "./inMemory";

let repositories: Repositories | null = null;

/** Process-wide repository set backed by the deterministic demo seed. */
export function getRepositories(): Repositories {
  if (!repositories) {
    repositories = createInMemoryRepositories(getSeedDataset());
  }
  return repositories;
}
