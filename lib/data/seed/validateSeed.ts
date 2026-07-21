/**
 * Seed dataset invariant checks.
 *
 * Shared by `npm run seed` (scripts/seed.ts) and the vitest suite. Every
 * violated invariant is returned as a human-readable error string; an empty
 * array means the dataset is sound.
 */

import { LEAGUES } from "../schema/enums";
import { leagueForRating } from "../leagues";
import { userIdFor } from "./roster";
import type { SeedDataset } from "./buildDataset";

export function validateSeedDataset(data: SeedDataset): string[] {
  const errors: string[] = [];
  const fail = (msg: string) => errors.push(msg);

  const userIds = new Set(data.users.map((u) => u.id));
  const firmIds = new Set(data.firms.map((f) => f.id));
  const accountIds = new Set(data.tradingAccounts.map((a) => a.id));
  const battleIds = new Set(data.battles.map((b) => b.id));
  const participantIds = new Set(data.battleParticipants.map((p) => p.id));
  const achievementIds = new Set(data.achievements.map((a) => a.id));

  // --- Volume minimums (product brief "Seed Data") -------------------------
  if (data.users.length < 40)
    fail(`expected >=40 traders, got ${data.users.length}`);
  if (data.firms.length < 5)
    fail(`expected >=5 firms/affiliations, got ${data.firms.length}`);
  const completed = data.battles.filter((b) => b.status === "COMPLETED");
  if (completed.length < 150)
    fail(`expected >=150 completed battles, got ${completed.length}`);
  if (data.achievements.length < 10)
    fail(`expected >=10 achievements, got ${data.achievements.length}`);
  if (data.notifications.length < 5)
    fail(`expected >=5 notifications, got ${data.notifications.length}`);
  if (data.ratingHistory.length === 0) fail("no rating history entries");
  if (data.executionEvents.length === 0) fail("no execution events");
  if (data.accountSnapshots.length === 0) fail("no account snapshots");

  // --- Verification: everything SIMULATED, never provider-verified ---------
  const verified: Array<[string, Array<{ verificationStatus: string }>]> = [
    ["tradingAccounts", data.tradingAccounts],
    ["integrationConnections", data.integrationConnections],
    ["battles", data.battles],
    ["battleParticipants", data.battleParticipants],
    ["executionEvents", data.executionEvents],
    ["accountSnapshots", data.accountSnapshots],
    ["battleMetricSnapshots", data.battleMetricSnapshots],
  ];
  for (const [name, rows] of verified) {
    const bad = rows.filter((r) => r.verificationStatus !== "SIMULATED");
    if (bad.length > 0)
      fail(`${name}: ${bad.length} rows are not SIMULATED (demo rule violation)`);
  }

  // --- No secrets in connection metadata ------------------------------------
  for (const conn of data.integrationConnections) {
    const json = JSON.stringify(conn.accessMetadata).toLowerCase();
    for (const needle of ["token", "secret", "password", "apikey", "api_key"]) {
      if (json.includes(needle))
        fail(`integrationConnections ${conn.id}: accessMetadata contains "${needle}"`);
    }
  }

  // --- Referential integrity -------------------------------------------------
  for (const p of data.traderProfiles) {
    if (!userIds.has(p.userId)) fail(`profile ${p.userId}: unknown user`);
    if (!firmIds.has(p.firmId)) fail(`profile ${p.userId}: unknown firm ${p.firmId}`);
  }
  for (const a of data.tradingAccounts)
    if (!userIds.has(a.userId)) fail(`account ${a.id}: unknown user ${a.userId}`);
  for (const c of data.integrationConnections)
    if (!userIds.has(c.userId)) fail(`connection ${c.id}: unknown user ${c.userId}`);
  for (const b of data.battles)
    if (b.winnerId && !userIds.has(b.winnerId))
      fail(`battle ${b.id}: unknown winner ${b.winnerId}`);
  for (const p of data.battleParticipants) {
    if (!battleIds.has(p.battleId)) fail(`participant ${p.id}: unknown battle`);
    if (!userIds.has(p.userId)) fail(`participant ${p.id}: unknown user`);
    // Nullable in the schema (v1 fills it at import time) but every SEEDED
    // participant must be linked to a seeded account.
    if (p.tradingAccountId === null || !accountIds.has(p.tradingAccountId))
      fail(`participant ${p.id}: unknown account ${p.tradingAccountId}`);
  }
  for (const e of data.executionEvents) {
    if (!accountIds.has(e.tradingAccountId))
      fail(`event ${e.id}: unknown account`);
    if (!userIds.has(e.userId)) fail(`event ${e.id}: unknown user`);
    if (e.battleId && !battleIds.has(e.battleId))
      fail(`event ${e.id}: unknown battle ${e.battleId}`);
  }
  for (const s of data.accountSnapshots) {
    if (!accountIds.has(s.tradingAccountId))
      fail(`account snapshot ${s.id}: unknown account`);
    if (s.battleId && !battleIds.has(s.battleId))
      fail(`account snapshot ${s.id}: unknown battle`);
  }
  for (const m of data.battleMetricSnapshots) {
    if (!battleIds.has(m.battleId)) fail(`metric snapshot ${m.id}: unknown battle`);
    if (!participantIds.has(m.participantId))
      fail(`metric snapshot ${m.id}: unknown participant ${m.participantId}`);
  }
  for (const r of data.ratingHistory) {
    if (!userIds.has(r.userId)) fail(`rating history ${r.id}: unknown user`);
    if (!battleIds.has(r.battleId)) fail(`rating history ${r.id}: unknown battle`);
  }
  for (const ua of data.userAchievements) {
    if (!userIds.has(ua.userId)) fail(`user achievement ${ua.id}: unknown user`);
    if (!achievementIds.has(ua.achievementId))
      fail(`user achievement ${ua.id}: unknown achievement ${ua.achievementId}`);
  }
  for (const n of data.notifications)
    if (!userIds.has(n.userId)) fail(`notification ${n.id}: unknown user`);

  // --- Dedupe keys -----------------------------------------------------------
  const providerKeys = new Set<string>();
  for (const e of data.executionEvents) {
    const key = `${e.sourceProvider}|${e.providerEventId}`;
    if (providerKeys.has(key)) fail(`duplicate provider event key ${key}`);
    providerKeys.add(key);
  }

  // --- Battle structure: exactly two participants, winner scores higher ------
  const participantsByBattle = new Map<string, typeof data.battleParticipants>();
  for (const p of data.battleParticipants) {
    const list = participantsByBattle.get(p.battleId) ?? [];
    list.push(p);
    participantsByBattle.set(p.battleId, list);
  }
  for (const b of data.battles) {
    const parts = participantsByBattle.get(b.id) ?? [];
    if (parts.length !== 2) {
      fail(`battle ${b.id}: expected 2 participants, got ${parts.length}`);
      continue;
    }
    const winner = parts.find((p) => p.result === "WIN");
    const loser = parts.find((p) => p.result === "LOSS");
    if (!winner || !loser) {
      fail(`battle ${b.id}: needs exactly one WIN and one LOSS participant`);
      continue;
    }
    if (b.winnerId !== winner.userId)
      fail(`battle ${b.id}: winnerId does not match WIN participant`);
    // Outcome columns are nullable in the schema (v1 battles fill them at
    // settlement) but every SEEDED battle is completed and must carry them.
    if (winner.finalScore === null || loser.finalScore === null) {
      fail(`battle ${b.id}: seeded participants must have final scores`);
      continue;
    }
    if (winner.finalScore <= loser.finalScore)
      fail(
        `battle ${b.id}: winner score ${winner.finalScore} not above loser ${loser.finalScore}`,
      );
    if (winner.userId === loser.userId)
      fail(`battle ${b.id}: trader battling themselves`);
  }

  // --- Final metric snapshot per participant, consistent with weights --------
  const finals = data.battleMetricSnapshots.filter((m) => m.isFinal);
  const finalsByParticipant = new Map(finals.map((m) => [m.participantId, m]));
  for (const p of data.battleParticipants) {
    const m = finalsByParticipant.get(p.id);
    if (!m) {
      fail(`participant ${p.id}: missing final metric snapshot`);
      continue;
    }
    if (p.finalScore === null) {
      fail(`participant ${p.id}: seeded participant missing finalScore`);
      continue;
    }
    if (Math.abs(m.totalBattleScore - p.finalScore) > 0.01)
      fail(`participant ${p.id}: finalScore differs from final metric snapshot`);
    const weighted =
      m.performanceScore * 0.4 +
      m.riskEfficiencyScore * 0.25 +
      m.disciplineScore * 0.2 +
      m.consistencyScore * 0.15;
    // Tolerance covers 0.1-rounding and the brief's authored worked example.
    if (Math.abs(weighted - m.totalBattleScore) > 1.0)
      fail(
        `participant ${p.id}: total ${m.totalBattleScore} inconsistent with weighted components (${weighted.toFixed(2)})`,
      );
    if (m.totalBattleScore < 0 || m.totalBattleScore > 100)
      fail(`participant ${p.id}: score out of 0-100 range`);
    if (m.maximumDrawdown < 0)
      fail(`participant ${p.id}: negative maximum drawdown`);
  }

  // --- Rating history chains + profile consistency ----------------------------
  const historyByUser = new Map<string, typeof data.ratingHistory>();
  for (const r of data.ratingHistory) {
    const list = historyByUser.get(r.userId) ?? [];
    list.push(r);
    historyByUser.set(r.userId, list);
  }
  const profileByUser = new Map(data.traderProfiles.map((p) => [p.userId, p]));
  const battleById = new Map(data.battles.map((b) => [b.id, b]));

  for (const profile of data.traderProfiles) {
    const history = (historyByUser.get(profile.userId) ?? [])
      .slice()
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) ||
          a.battleId.localeCompare(b.battleId),
      );
    if (history.length === 0) {
      fail(`profile ${profile.userId}: no rating history`);
      continue;
    }
    let current = profile.seasonStartRating;
    let wins = 0;
    let losses = 0;
    let streak = 0;
    for (const r of history) {
      if (r.previousRating !== current)
        fail(
          `rating chain broken for ${profile.userId} at ${r.battleId}: expected prev ${current}, got ${r.previousRating}`,
        );
      if (r.previousRating + r.change !== r.newRating)
        fail(`rating history ${r.id}: previous + change != new`);
      current = r.newRating;
      const battle = battleById.get(r.battleId);
      const won = battle?.winnerId === profile.userId;
      if (won) {
        wins++;
        streak = streak >= 0 ? streak + 1 : 1;
      } else {
        losses++;
        streak = streak <= 0 ? streak - 1 : -1;
      }
      if ((r.change > 0) !== won)
        fail(
          `rating history ${r.id}: change sign does not match battle outcome`,
        );
    }
    if (current !== profile.rating)
      fail(
        `profile ${profile.userId}: rating ${profile.rating} != end of chain ${current}`,
      );
    if (wins !== profile.seasonWins || losses !== profile.seasonLosses)
      fail(
        `profile ${profile.userId}: season record ${profile.seasonWins}-${profile.seasonLosses} != derived ${wins}-${losses}`,
      );
    if (streak !== profile.currentStreak)
      fail(
        `profile ${profile.userId}: currentStreak ${profile.currentStreak} != derived ${streak}`,
      );
    if (profile.lifetimeWins < profile.seasonWins)
      fail(`profile ${profile.userId}: lifetime wins below season wins`);
    if (profile.lifetimeLosses < profile.seasonLosses)
      fail(`profile ${profile.userId}: lifetime losses below season losses`);
    const placement = leagueForRating(profile.rating);
    if (placement.league !== profile.league || placement.division !== profile.division)
      fail(
        `profile ${profile.userId}: league ${profile.league} ${profile.division} does not match rating ${profile.rating}`,
      );
  }

  // --- League coverage + active streaks ---------------------------------------
  for (const league of LEAGUES) {
    if (!data.traderProfiles.some((p) => p.league === league))
      fail(`no traders seeded in league ${league}`);
  }
  const activeWinStreaks = data.traderProfiles.filter(
    (p) => p.currentStreak >= 3,
  );
  if (activeWinStreaks.length < 3)
    fail(
      `expected >=3 active win streaks of 3+, got ${activeWinStreaks.length}`,
    );

  // --- Demo user spec (CLAUDE.md, locked) --------------------------------------
  const kevinId = userIdFor("kevinv");
  const kevin = profileByUser.get(kevinId);
  const kevinUser = data.users.find((u) => u.id === kevinId);
  if (!kevin || !kevinUser) {
    fail("demo user KevinV missing");
  } else {
    const spec: Array<[string, unknown, unknown]> = [
      ["displayName", kevinUser.displayName, "KevinV"],
      ["isDemoUser", kevinUser.isDemoUser, true],
      ["rating", kevin.rating, 1684],
      ["league", kevin.league, "GOLD"],
      ["division", kevin.division, "II"],
      ["seasonWins", kevin.seasonWins, 18],
      ["seasonLosses", kevin.seasonLosses, 11],
      ["currentStreak", kevin.currentStreak, 3],
      ["primaryMarket", kevin.primaryMarket, "NQ"],
      ["secondaryMarkets", JSON.stringify(kevin.secondaryMarkets), '["ES"]'],
      ["battleStyle", kevin.battleStyle, "BALANCED"],
      ["disciplineScore", kevin.disciplineScore, 84],
      ["riskScore", kevin.riskScore, 79],
      ["performanceScore", kevin.performanceScore, 76],
      ["seasonStartRating", kevin.seasonStartRating, 1588],
      ["firmId", kevin.firmId, "firm-mffu"],
    ];
    for (const [field, actual, expected] of spec) {
      if (actual !== expected)
        fail(`KevinV.${field}: expected ${expected}, got ${actual}`);
    }
    const kevinAccount = data.tradingAccounts.find((a) => a.userId === kevinId);
    if (!kevinAccount) fail("KevinV has no trading account");
    else {
      if (kevinAccount.metadata.planName !== "50K Rapid")
        fail(`KevinV account plan: ${kevinAccount.metadata.planName}`);
      if (kevinAccount.connectionStatus !== "CONNECTED")
        fail("KevinV account not CONNECTED");
      if (kevinAccount.maximumContracts !== 5)
        fail("KevinV account maximumContracts != 5");
    }
  }

  // --- Example opponent spec ----------------------------------------------------
  const deltaId = userIdFor("deltahunter");
  const deltaProfile = profileByUser.get(deltaId);
  const deltaUser = data.users.find((u) => u.id === deltaId);
  if (!deltaProfile || !deltaUser) {
    fail("opponent DeltaHunter missing");
  } else {
    const spec: Array<[string, unknown, unknown]> = [
      ["displayName", deltaUser.displayName, "DeltaHunter"],
      ["rating", deltaProfile.rating, 1712],
      ["league", deltaProfile.league, "GOLD"],
      ["division", deltaProfile.division, "I"],
      ["seasonWins", deltaProfile.seasonWins, 21],
      ["seasonLosses", deltaProfile.seasonLosses, 13],
      ["primaryMarket", deltaProfile.primaryMarket, "NQ"],
      ["battleStyle", deltaProfile.battleStyle, "AGGRESSIVE"],
      ["firmId", deltaProfile.firmId, "firm-tradeify"],
    ];
    for (const [field, actual, expected] of spec) {
      if (actual !== expected)
        fail(`DeltaHunter.${field}: expected ${expected}, got ${actual}`);
    }
  }

  // --- KevinV insight: strong morning-NQ record --------------------------------
  if (kevin) {
    const kevinBattleIds = new Set(
      data.battleParticipants
        .filter((p) => p.userId === kevinId)
        .map((p) => p.battleId),
    );
    const morningNq = data.battles.filter(
      (b) =>
        kevinBattleIds.has(b.id) &&
        b.market === "NQ" &&
        b.battleWindow === "OPENING_BELL",
    );
    const morningWins = morningNq.filter((b) => b.winnerId === kevinId).length;
    if (morningNq.length !== 9 || morningWins !== 7)
      fail(
        `KevinV morning NQ record: expected 7-2, got ${morningWins}-${morningNq.length - morningWins}`,
      );
    if ((kevin.bestWinStreak ?? 0) < 5)
      fail("KevinV bestWinStreak should be >= 5 (Five-Win Streak badge)");
  }

  // --- Showcase battle mirrors the brief's worked example ----------------------
  const showcase = data.battles
    .filter((b) => {
      const parts = participantsByBattle.get(b.id) ?? [];
      const ids = new Set(parts.map((p) => p.userId));
      return ids.has(kevinId) && ids.has(deltaId);
    })
    .sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart))
    .at(-1);
  if (!showcase) {
    fail("no KevinV vs DeltaHunter battle found");
  } else {
    const parts = participantsByBattle.get(showcase.id) ?? [];
    const kevinPart = parts.find((p) => p.userId === kevinId);
    const deltaPart = parts.find((p) => p.userId === deltaId);
    if (showcase.winnerId !== kevinId)
      fail("showcase battle: KevinV should win the latest battle vs DeltaHunter");
    if (kevinPart?.finalScore !== 83.9)
      fail(`showcase battle: KevinV score ${kevinPart?.finalScore} != 83.9`);
    if (deltaPart?.finalScore !== 73.6)
      fail(`showcase battle: DeltaHunter score ${deltaPart?.finalScore} != 73.6`);
    const events = data.executionEvents.filter((e) => e.battleId === showcase.id);
    if (events.length === 0) fail("showcase battle: no execution events");
    const kevinFinal = finalsByParticipant.get(kevinPart?.id ?? "");
    const deltaFinal = finalsByParticipant.get(deltaPart?.id ?? "");
    if (kevinFinal && deltaFinal && kevinFinal.netPnl >= deltaFinal.netPnl)
      fail(
        "showcase battle: DeltaHunter should out-earn KevinV (discipline beats raw profit)",
      );
  }

  return errors;
}
