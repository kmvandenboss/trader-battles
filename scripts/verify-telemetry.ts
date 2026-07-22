/**
 * One-off verification for v1 battle telemetry reconstruction (Phase 2.5).
 *
 * Inspects the test battle, ensures GC bars are imported, re-settles it
 * (idempotent by design), and dumps the reconstructed telemetry so we can
 * eyeball the score progression + 4-factor insight before building UI.
 *
 * Read-mostly; the only writes are (a) importing OHLCV bars if missing and
 * (b) re-settling, both idempotent. Run: npx tsx scripts/verify-telemetry.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadLocalEnv } from "./load-env";

loadLocalEnv();

const BATTLE_ID = "battle-v1-2c0c0937-0c2d-4ab6-b9c1-6ee412b93beb";
const BARS_CSV = "test-battles/GC_1min_2026-07-21_2000ET_to_2026-07-22_0030ET.csv";
const KEVIN_CSV = "test-battles/kevin-trades-2026-07-21.csv";
const OPP_CSV = "test-battles/opponent-trades-2026-07-21.csv";

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

async function main(): Promise<void> {
  const { getRepositories } = await import("../lib/data/repositories");
  const { importForBattle, importMarketBars, settleScheduledBattle } =
    await import("../lib/battles/settlementService");
  const repos = getRepositories();

  console.log("DATABASE_URL set:", Boolean(process.env.DATABASE_URL));

  const scheduled = await repos.battles.getScheduledById(BATTLE_ID);
  if (!scheduled) {
    console.error("Battle not found:", BATTLE_ID);
    return;
  }
  const b = scheduled.battle;
  console.log("\n=== BATTLE ===");
  console.log({
    id: b.id,
    status: b.status,
    scoringMode: b.scoringMode,
    market: b.market,
    accountBracket: b.accountBracket,
    scheduledStart: b.scheduledStart,
    scheduledEnd: b.scheduledEnd,
  });

  console.log("\n=== PARTICIPANTS ===");
  for (const p of scheduled.participants) {
    const events = await repos.battles.listImportedExecutions(
      BATTLE_ID,
      p.participant.userId,
    );
    console.log({
      userId: p.participant.userId,
      name: p.trader.user.displayName,
      startingRating: p.participant.startingRating,
      importedExecutions: events.length,
    });
  }

  // Ensure GC bars exist across the window.
  const start = b.scheduledStart;
  const end = b.scheduledEnd ?? b.scheduledStart;
  const bars = await repos.marketData.listBars("GC", start, end);
  console.log("\nGC bars in window before:", bars.length);
  if (bars.length === 0) {
    const r = await importMarketBars(repos, {
      instrument: "GC",
      csvText: read(BARS_CSV),
    });
    console.log("Imported bars:", r.parsedBars, "saved:", r.saved);
  }

  // Ensure both sides have imported trades (only if missing).
  for (const p of scheduled.participants) {
    const events = await repos.battles.listImportedExecutions(
      BATTLE_ID,
      p.participant.userId,
    );
    if (events.length > 0) continue;
    const name = p.trader.user.displayName.toLowerCase();
    const csv = name.includes("kevin") ? read(KEVIN_CSV) : read(OPP_CSV);
    const r = await importForBattle(repos, {
      battleId: BATTLE_ID,
      userId: p.participant.userId,
      csvText: csv,
      importedAt: new Date().toISOString(),
    });
    console.log(`Imported trades for ${p.trader.user.displayName}:`, r.persisted);
  }

  // Re-settle (idempotent) — regenerates telemetry with the new pipeline.
  console.log("\n=== RE-SETTLING ===");
  const settledAt = new Date().toISOString();
  const result = await settleScheduledBattle(repos, {
    battleId: BATTLE_ID,
    settledAt,
  });
  console.log("winnerId:", result.settlement.winnerId);
  console.log("decidedBy:", result.settlement.settlementInput.decidedBy);
  console.log("resolutionDetail:", result.settlement.resolutionDetail);
  for (const line of result.settlement.report) console.log("  ·", line);

  // Inspect persisted telemetry.
  const detail = await repos.battles.getById(BATTLE_ID);
  if (!detail) {
    console.error("getById returned null after settle");
    return;
  }
  console.log("\n=== PERSISTED TELEMETRY ===");
  console.log("accountSnapshots:", detail.accountSnapshots.length);
  console.log("metricTimeline total:", detail.metricTimeline.length);
  console.log(
    "  non-final:",
    detail.metricTimeline.filter((m) => !m.isFinal).length,
    "final:",
    detail.metricTimeline.filter((m) => m.isFinal).length,
  );

  const startMs = Date.parse(start);
  for (const part of detail.participants) {
    const pid = part.participant.id;
    const mine = detail.metricTimeline
      .filter((m) => m.participantId === pid)
      .sort((x, y) => Date.parse(x.timestamp) - Date.parse(y.timestamp));
    const finalRow = mine.find((m) => m.isFinal);
    console.log(`\n--- ${part.trader.user.displayName} (${pid}) ---`);
    console.log("finalScore:", part.participant.finalScore, "result:", part.participant.result);
    console.log("final 4-factor:", {
      performance: finalRow?.performanceScore,
      riskEfficiency: finalRow?.riskEfficiencyScore,
      discipline: finalRow?.disciplineScore,
      consistency: finalRow?.consistencyScore,
    });
    console.log("score progression (min → PNL_V1 running / 4f components):");
    for (const m of mine) {
      const min = Math.round((Date.parse(m.timestamp) - startMs) / 60000);
      console.log(
        `   t+${String(min).padStart(3)}m  score=${m.totalBattleScore
          .toFixed(2)
          .padStart(9)}  net=${m.netPnl.toFixed(2).padStart(9)}  dd=${m.maximumDrawdown
          .toFixed(0)
          .padStart(6)}  trades=${m.tradeCount}  perf=${m.performanceScore.toFixed(
          0,
        )} risk=${m.riskEfficiencyScore.toFixed(0)} disc=${m.disciplineScore.toFixed(
          0,
        )} cons=${m.consistencyScore.toFixed(0)}${m.isFinal ? "  [FINAL]" : ""}`,
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
