/**
 * `npm run db:seed` — load the deterministic demo dataset into Postgres.
 *
 * Idempotency model: scoped delete-and-insert. Every run deletes exactly the
 * seed dataset's rows (matched by their seed-authored ids, children first,
 * FK-safe order) and re-inserts them, so re-running converges to the same
 * seeded state — WITHOUT touching real rows. Real sign-ups (users with
 * auth_user_id set, their trader profiles, and any future real battle data)
 * are never deleted. Shared reference tables that real rows point at
 * (firms, achievements) are upserted in place rather than deleted, so FKs
 * from real trader profiles / user achievements always stay valid.
 *
 * Caveat: rows authored by an OLDER seed version whose ids are no longer in
 * the current dataset will linger; for a truly clean slate, reset the schema
 * (`npm run db:push` on a fresh database / Neon branch) and re-seed.
 *
 * Requires DATABASE_URL (reads .env.local / .env via scripts/load-env.ts).
 * Run `npm run db:migrate` first to create the schema. All seeded rows are
 * SIMULATED demo data — never PROVIDER_VERIFIED, no secrets stored.
 */

import { getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

import * as t from "../lib/data/schema/tables";
import { getSeedDataset, validateSeedDataset } from "../lib/data/seed";
import { loadLocalEnv } from "./load-env";

/** Keep statements comfortably under HTTP payload/parameter limits. */
const CHUNK = 100;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    out.push(rows.slice(i, i + CHUNK));
  }
  return out;
}

type Db = NeonHttpDatabase;

/** Delete only the rows whose key matches a seed-authored id. */
async function deleteSeedRows(
  db: Db,
  table: PgTable,
  keyColumn: PgColumn,
  ids: string[],
): Promise<void> {
  for (const c of chunks(ids)) {
    await db.delete(table).where(inArray(keyColumn, c));
  }
}

/** `excluded.*` update set for an upsert covering every non-key column. */
function excludedSet(table: PgTable, keyName: string): Record<string, SQL> {
  return Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([name]) => name !== keyName)
      .map(([name, column]) => [name, sql.raw(`excluded."${column.name}"`)]),
  );
}

async function main(): Promise<number> {
  loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(
      "db:seed requires DATABASE_URL (a Neon Postgres connection string).\n" +
        "Set it in .env.local or the environment, run `npm run db:migrate`, then retry.\n" +
        "Without DATABASE_URL the app serves the same dataset in-memory — no seeding needed.",
    );
    return 1;
  }

  console.log("Trader Battles — seeding Postgres with the deterministic demo dataset");
  const dataset = getSeedDataset();
  const errors = validateSeedDataset(dataset);
  if (errors.length > 0) {
    console.error(`Seed dataset failed validation with ${errors.length} error(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    return 1;
  }

  const db = drizzle(neon(databaseUrl));

  // Refresh ONLY seed-authored rows (children before parents, FK-safe).
  // Real accounts and their data are preserved by construction: every delete
  // is scoped to the seed dataset's own ids.
  console.log("Refreshing seed-authored rows (real accounts are preserved)...");
  const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);
  await deleteSeedRows(db, t.notifications, t.notifications.id, ids(dataset.notifications));
  await deleteSeedRows(db, t.userAchievements, t.userAchievements.id, ids(dataset.userAchievements));
  await deleteSeedRows(db, t.ratingHistory, t.ratingHistory.id, ids(dataset.ratingHistory));
  await deleteSeedRows(
    db,
    t.battleMetricSnapshots,
    t.battleMetricSnapshots.id,
    ids(dataset.battleMetricSnapshots),
  );
  await deleteSeedRows(db, t.accountSnapshots, t.accountSnapshots.id, ids(dataset.accountSnapshots));
  await deleteSeedRows(db, t.executionEvents, t.executionEvents.id, ids(dataset.executionEvents));
  await deleteSeedRows(
    db,
    t.battleParticipants,
    t.battleParticipants.id,
    ids(dataset.battleParticipants),
  );
  await deleteSeedRows(db, t.battles, t.battles.id, ids(dataset.battles));
  await deleteSeedRows(
    db,
    t.integrationConnections,
    t.integrationConnections.id,
    ids(dataset.integrationConnections),
  );
  await deleteSeedRows(db, t.tradingAccounts, t.tradingAccounts.id, ids(dataset.tradingAccounts));
  await deleteSeedRows(
    db,
    t.traderProfiles,
    t.traderProfiles.userId,
    dataset.traderProfiles.map((p) => p.userId),
  );
  await deleteSeedRows(db, t.users, t.users.id, ids(dataset.users));

  console.log("Inserting seed rows...");
  const log = (name: string, count: number) =>
    console.log(`  ${name.padEnd(26)} ${String(count).padStart(5)} rows`);

  for (const c of chunks(dataset.users)) await db.insert(t.users).values(c);
  log("users", dataset.users.length);
  // Firms + achievements are upserted: real rows (trader profiles, earned
  // achievements) hold FKs to them, so they must never be deleted.
  for (const c of chunks(dataset.firms)) {
    await db
      .insert(t.firms)
      .values(c)
      .onConflictDoUpdate({ target: t.firms.id, set: excludedSet(t.firms, "id") });
  }
  log("firms (upsert)", dataset.firms.length);
  for (const c of chunks(dataset.traderProfiles))
    await db.insert(t.traderProfiles).values(c);
  log("trader_profiles", dataset.traderProfiles.length);
  for (const c of chunks(dataset.tradingAccounts))
    await db.insert(t.tradingAccounts).values(c);
  log("trading_accounts", dataset.tradingAccounts.length);
  for (const c of chunks(dataset.integrationConnections))
    await db.insert(t.integrationConnections).values(c);
  log("integration_connections", dataset.integrationConnections.length);
  for (const c of chunks(dataset.battles)) await db.insert(t.battles).values(c);
  log("battles", dataset.battles.length);
  for (const c of chunks(dataset.battleParticipants))
    await db.insert(t.battleParticipants).values(c);
  log("battle_participants", dataset.battleParticipants.length);
  for (const c of chunks(dataset.executionEvents))
    await db.insert(t.executionEvents).values(c);
  log("execution_events", dataset.executionEvents.length);
  for (const c of chunks(dataset.accountSnapshots))
    await db.insert(t.accountSnapshots).values(c);
  log("account_snapshots", dataset.accountSnapshots.length);
  for (const c of chunks(dataset.battleMetricSnapshots))
    await db.insert(t.battleMetricSnapshots).values(c);
  log("battle_metric_snapshots", dataset.battleMetricSnapshots.length);
  for (const c of chunks(dataset.ratingHistory))
    await db.insert(t.ratingHistory).values(c);
  log("rating_history", dataset.ratingHistory.length);
  for (const c of chunks(dataset.achievements)) {
    await db
      .insert(t.achievements)
      .values(c)
      .onConflictDoUpdate({
        target: t.achievements.id,
        set: excludedSet(t.achievements, "id"),
      });
  }
  log("achievements (upsert)", dataset.achievements.length);
  for (const c of chunks(dataset.userAchievements))
    await db.insert(t.userAchievements).values(c);
  log("user_achievements", dataset.userAchievements.length);
  for (const c of chunks(dataset.notifications))
    await db.insert(t.notifications).values(c);
  log("notifications", dataset.notifications.length);

  console.log(
    "\nPostgres seeded. Every seeded row is SIMULATED demo data; real accounts untouched.",
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("db:seed failed:", error);
    process.exit(1);
  });
