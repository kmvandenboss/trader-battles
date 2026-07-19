/**
 * `npm run seed` — deterministic seed verification.
 *
 * The demo dataset is authored TypeScript served in-memory (no database),
 * so "seeding" means: rebuild the dataset from its fixed seed, check every
 * invariant (volumes, referential integrity, verification labeling, rating
 * chains, demo-user spec, determinism), and print a summary. Exits non-zero
 * if any invariant is violated.
 */

import {
  buildSeedDataset,
  validateSeedDataset,
  DEMO_TODAY,
  SEASON_START,
} from "../lib/data/seed";

function main(): number {
  console.log("Trader Battles — deterministic seed check");
  console.log(`  season ${SEASON_START} → demo today ${DEMO_TODAY}\n`);

  const dataset = buildSeedDataset();

  // Determinism: a second independent build must be byte-identical.
  const second = buildSeedDataset();
  const deterministic = JSON.stringify(dataset) === JSON.stringify(second);

  const errors = validateSeedDataset(dataset);
  if (!deterministic) {
    errors.push("dataset is not deterministic across builds");
  }

  const counts: Array<[string, number]> = [
    ["users", dataset.users.length],
    ["traderProfiles", dataset.traderProfiles.length],
    ["firms", dataset.firms.length],
    ["tradingAccounts", dataset.tradingAccounts.length],
    ["integrationConnections", dataset.integrationConnections.length],
    ["battles (completed)", dataset.battles.filter((b) => b.status === "COMPLETED").length],
    ["battleParticipants", dataset.battleParticipants.length],
    ["battleMetricSnapshots", dataset.battleMetricSnapshots.length],
    ["executionEvents", dataset.executionEvents.length],
    ["accountSnapshots", dataset.accountSnapshots.length],
    ["ratingHistory", dataset.ratingHistory.length],
    ["achievements", dataset.achievements.length],
    ["userAchievements", dataset.userAchievements.length],
    ["notifications", dataset.notifications.length],
  ];
  console.log("Entity counts:");
  for (const [name, count] of counts) {
    console.log(`  ${name.padEnd(24)} ${String(count).padStart(5)}`);
  }

  const leagues = new Map<string, number>();
  for (const p of dataset.traderProfiles) {
    leagues.set(p.league, (leagues.get(p.league) ?? 0) + 1);
  }
  console.log("\nTraders per league:");
  for (const league of ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "ELITE"]) {
    console.log(`  ${league.padEnd(10)} ${leagues.get(league) ?? 0}`);
  }

  const streaks = dataset.traderProfiles.filter((p) => p.currentStreak >= 3);
  console.log(`\nActive win streaks (3+): ${streaks.length}`);
  const simulated = dataset.battles.every(
    (b) => b.verificationStatus === "SIMULATED",
  );
  console.log(`All battles SIMULATED:   ${simulated ? "yes" : "NO"}`);
  console.log(`Deterministic rebuild:   ${deterministic ? "yes" : "NO"}`);

  if (errors.length > 0) {
    console.error(`\nSeed validation FAILED with ${errors.length} error(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    return 1;
  }
  console.log("\nSeed validation passed. Dataset is ready to serve in-memory.");
  return 0;
}

process.exit(main());
