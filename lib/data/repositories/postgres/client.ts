/**
 * Neon Postgres client for the v1 real-data path.
 *
 * Uses drizzle-orm's neon-http adapter over @neondatabase/serverless, which
 * works on Vercel serverless functions with Neon's POOLED connection string
 * (DATABASE_URL). Neon is standard Postgres, so this client — and the schema
 * in lib/data/schema — migrates to MFFU's own Postgres untouched (swap the
 * driver here if that DB isn't Neon; nothing else changes).
 *
 * IMPORTANT: nothing in this module runs at import time. The connection is
 * only constructed when createDb() is called, i.e. when getRepositories()
 * actually selects the Postgres backend, so builds without DATABASE_URL are
 * unaffected.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "../../schema/tables";

export type Db = NeonHttpDatabase<typeof schema>;

export function createDb(databaseUrl: string): Db {
  if (!databaseUrl) {
    throw new Error(
      "createDb() called without a database URL — set DATABASE_URL or run without it to use the in-memory demo seed.",
    );
  }
  return drizzle(neon(databaseUrl), { schema });
}
