/**
 * `npm run db:seed` — load the deterministic demo dataset into Postgres.
 *
 * Idempotency model: truncate-and-insert. Every run deletes all rows
 * (children first, FK-safe order) and re-inserts the seed dataset, so
 * re-running always converges to the exact same database state — the same
 * determinism guarantee the in-memory backend gets from getSeedDataset().
 *
 * Requires DATABASE_URL (reads .env.local / .env via scripts/load-env.ts).
 * Run `npm run db:migrate` first to create the schema. All seeded rows are
 * SIMULATED demo data — never PROVIDER_VERIFIED, no secrets stored.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as t from "../lib/data/schema/tables";
import { getSeedDataset, validateSeedDataset } from "../lib/data/seed";
import { loadLocalEnv } from "./load-env";

/** Keep insert statements comfortably under HTTP payload/parameter limits. */
const INSERT_CHUNK = 100;

function chunks<T>(rows: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    out.push(rows.slice(i, i + INSERT_CHUNK));
  }
  return out;
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

  // Delete children before parents (FK-safe), then insert parents first.
  console.log("Clearing existing rows (truncate-and-insert idempotency)...");
  await db.delete(t.notifications);
  await db.delete(t.userAchievements);
  await db.delete(t.ratingHistory);
  await db.delete(t.battleMetricSnapshots);
  await db.delete(t.accountSnapshots);
  await db.delete(t.executionEvents);
  await db.delete(t.battleParticipants);
  await db.delete(t.battles);
  await db.delete(t.integrationConnections);
  await db.delete(t.tradingAccounts);
  await db.delete(t.traderProfiles);
  await db.delete(t.achievements);
  await db.delete(t.firms);
  await db.delete(t.users);

  console.log("Inserting seed rows...");
  const log = (name: string, count: number) =>
    console.log(`  ${name.padEnd(26)} ${String(count).padStart(5)} rows`);

  for (const c of chunks(dataset.users)) await db.insert(t.users).values(c);
  log("users", dataset.users.length);
  for (const c of chunks(dataset.firms)) await db.insert(t.firms).values(c);
  log("firms", dataset.firms.length);
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
  for (const c of chunks(dataset.achievements))
    await db.insert(t.achievements).values(c);
  log("achievements", dataset.achievements.length);
  for (const c of chunks(dataset.userAchievements))
    await db.insert(t.userAchievements).values(c);
  log("user_achievements", dataset.userAchievements.length);
  for (const c of chunks(dataset.notifications))
    await db.insert(t.notifications).values(c);
  log("notifications", dataset.notifications.length);

  console.log("\nPostgres seeded. Every row is SIMULATED demo data (Demo Verified).");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("db:seed failed:", error);
    process.exit(1);
  });
