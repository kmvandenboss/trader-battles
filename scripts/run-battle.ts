/**
 * `npm run battle -- <scenario-id>` — headless end-to-end battle run.
 *
 * Proof the whole stack works without any UI: mock provider events ->
 * normalization -> dedupe -> position ledger -> battle metrics -> scoring
 * engine -> lead changes / commentary -> final score -> rating changes.
 *
 * Scenarios: discipline-beats-raw-profit (default) | comeback-victory |
 * aggression-backfires. Deterministic: same scenario, same output, always.
 */

import {
  advanceBattle,
  createBattleState,
  type BattleEngineState,
  type BattleFeedEvent,
} from "../lib/battles/battleEngine";
import { SCENARIOS, isScenarioId } from "../lib/battles/scenarios";
import { generateBattleScript } from "../lib/integrations/providers/mock/mockEventGenerator";

function mmss(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function money(value: number): string {
  const sign = value < 0 ? "-" : "+";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function feedLine(event: BattleFeedEvent): string {
  const tag = event.type.padEnd(19);
  return `  [${mmss(event.elapsedMs)}] ${tag} ${event.message}`;
}

function printScoreProgression(state: BattleEngineState): void {
  console.log("\nScore progression (battle score / net P&L):");
  const demo = state.participants[state.demoUserId];
  const opponent = state.participants[state.opponentUserId];
  console.log(
    `  ${"elapsed".padEnd(9)}${demo.displayName.padEnd(24)}${opponent.displayName}`,
  );
  for (const point of demo.history) {
    const minute = point.elapsedMs / 60_000;
    if (minute % 15 !== 0) continue;
    const other = opponent.history.find(
      (p) => p.elapsedMs === point.elapsedMs,
    );
    if (!other) continue;
    const left = `${point.score.toFixed(1)} / ${money(point.netPnl)}`;
    const right = `${other.score.toFixed(1)} / ${money(other.netPnl)}`;
    console.log(`  ${mmss(point.elapsedMs).padEnd(9)}${left.padEnd(24)}${right}`);
  }
}

function main(): number {
  const arg = process.argv[2] ?? "discipline-beats-raw-profit";
  if (!isScenarioId(arg)) {
    console.error(`Unknown scenario "${arg}". Available scenarios:`);
    for (const scenario of SCENARIOS) {
      console.error(`  - ${scenario.id}: ${scenario.title}`);
    }
    return 1;
  }

  const listing = SCENARIOS.find((s) => s.id === arg)!;
  const script = generateBattleScript(arg);
  console.log("=".repeat(76));
  console.log(`Trader Battles — headless battle run  [Simulated Demo Data]`);
  console.log(`Scenario : ${listing.title} (${listing.id})`);
  console.log(`          ${listing.description}`);
  console.log(
    `Battle   : ${script.market} · ${script.battleType} · ${script.battleWindow} · ${Math.round(script.durationMs / 60_000)} min · seed 0x${listing.seed.toString(16)}`,
  );
  console.log("=".repeat(76));

  // Drive the battle through the same stepping API the live UI will use.
  let state = createBattleState(arg);
  while (state.status !== "COMPLETED") {
    state = advanceBattle(state, 25);
  }

  console.log("\nTimeline (key events + commentary):");
  for (const event of state.feed) {
    console.log(feedLine(event));
  }

  printScoreProgression(state);

  const final = state.finalResult;
  if (!final) {
    console.error("\nERROR: battle completed without a final result");
    return 1;
  }

  console.log("\nFinal component breakdown:");
  for (const participant of final.participants) {
    const c = participant.finalScore.components;
    console.log(
      `  ${participant.displayName.padEnd(12)} total ${participant.finalScore.total.toFixed(2).padStart(6)}  ` +
        `perf ${c.performance.score.toFixed(1).padStart(5)} · risk ${c.riskEfficiency.score.toFixed(1).padStart(5)} · ` +
        `disc ${c.discipline.score.toFixed(1).padStart(5)} · cons ${c.consistency.score.toFixed(1).padStart(5)}  ` +
        `| net ${money(participant.netPnl).padStart(9)} · maxDD $${participant.maxDrawdown.toFixed(0)} · ${participant.tradeCount} trades`,
    );
    for (const violation of participant.violations) {
      console.log(`    penalty: ${violation.label} (-${violation.penalty})`);
    }
  }

  console.log(`\n${final.headline}`);
  console.log(`Lead changes: ${final.leadChanges}`);

  console.log("\nRating changes:");
  for (const participant of final.participants) {
    const rc = participant.ratingChange;
    const sign = rc.change >= 0 ? "+" : "";
    console.log(
      `  ${participant.displayName.padEnd(12)} ${participant.result.padEnd(5)} ${sign}${rc.change} → ${rc.newRating}`,
    );
  }

  console.log("\nWhy it ended this way:");
  for (const participant of final.participants) {
    console.log(`  ${participant.displayName}:`);
    for (const reason of participant.reasons) {
      console.log(`    • ${reason}`);
    }
  }

  const expectedOk = final.winnerUserId === listing.expectedWinnerUserId;
  console.log(
    `\nExpected winner ${listing.expectedWinnerName}: ${expectedOk ? "CONFIRMED" : "MISMATCH"}`,
  );
  console.log("=".repeat(76));
  return expectedOk ? 0 : 1;
}

process.exit(main());
