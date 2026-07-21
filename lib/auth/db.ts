/**
 * Lazy Neon client for the bridge-auth layer.
 *
 * Separate from lib/data/repositories/postgres/client.ts on purpose: the
 * auth layer needs the `auth_*` adapter tables (lib/data/schema/authTables)
 * in its Drizzle schema alongside the domain tables it links to (users,
 * trader_profiles, firms), while the repositories deliberately know nothing
 * about auth tables.
 *
 * IMPORT-TIME SAFE: nothing here constructs a client at import time. The
 * connection is only built on the first getAuthDb() call, which every caller
 * guards behind isAuthEnabled() — so the zero-env demo build never touches
 * this path and `npm run build` passes with no environment at all.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as domainTables from "@/lib/data/schema/tables";
import * as authTables from "@/lib/data/schema/authTables";

const schema = { ...domainTables, ...authTables };

export type AuthDb = NeonHttpDatabase<typeof schema>;

let db: AuthDb | null = null;

let warnedMissingSecret = false;

/**
 * Bridge auth only functions on a database-backed deployment with a session
 * secret. Without DATABASE_URL the app serves the in-memory demo seed; with
 * DATABASE_URL but no AUTH_SECRET, auth stays disabled (demo-fallback
 * identity) instead of letting Auth.js throw MissingSecret on every
 * identity-resolving request — Postgres reads keep working either way.
 */
export function isAuthEnabled(): boolean {
  if (!process.env.DATABASE_URL) return false;
  const hasSecret = Boolean(process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET);
  if (!hasSecret && !warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn(
      "[auth] DATABASE_URL is set but AUTH_SECRET is missing — bridge auth is disabled " +
        "and all visitors resolve to the demo-fallback identity. Set AUTH_SECRET " +
        "(`npx auth secret` or `openssl rand -base64 32`) to enable sign-in.",
    );
  }
  return hasSecret;
}

/** Process-wide auth DB handle. Throws when DATABASE_URL is unset. */
export function getAuthDb(): AuthDb {
  if (!db) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        "getAuthDb() called without DATABASE_URL — bridge auth requires the Postgres-backed deployment.",
      );
    }
    db = drizzle(neon(databaseUrl), { schema });
  }
  return db;
}
