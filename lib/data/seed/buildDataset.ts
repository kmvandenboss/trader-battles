/**
 * Deterministic seed dataset builder.
 *
 * Everything here is derived from fixed authored inputs (roster.ts,
 * demoScript.ts, firms.ts, achievements.ts) plus seeded mulberry32 streams —
 * NO unseeded randomness. Calling buildSeedDataset() twice always produces
 * byte-identical output.
 *
 * Design rules honored here:
 *  - Every account / connection / battle / participant / event / snapshot
 *    carries verificationStatus "SIMULATED". Never PROVIDER_VERIFIED.
 *  - No secrets or access tokens anywhere.
 *  - Battle scores/ratings in historical seeds are AUTHORED demo data with
 *    the brief's weights kept internally consistent. The authoritative
 *    engines live in lib/scoring and lib/ratings (Phase 2); live battles are
 *    scored there, and seed regeneration should adopt those engines'
 *    configuration once they land.
 *  - Records/streaks/rating histories are DERIVED from the generated battles
 *    (never authored separately), so they can never disagree.
 */

import { leagueForRating } from "../leagues";
import type { BattleType, BattleWindow, Market } from "../schema/enums";
import type {
  AccountSnapshot,
  Achievement,
  Battle,
  BattleMetricSnapshot,
  BattleParticipant,
  ExecutionEvent,
  Firm,
  IntegrationConnection,
  Notification,
  RatingHistoryEntry,
  TraderProfile,
  TradingAccount,
  User,
  UserAchievement,
} from "../schema/types";
import { ACHIEVEMENTS } from "./achievements";
import {
  SCORE_WEIGHTS,
  SCORING_CONFIGURATION_ID,
  SEED,
  isoAt,
  seasonWeekdays,
  WINDOW_TIMES_UTC,
} from "./constants";
import {
  COMMISSION_PER_SIDE,
  DELTA_SHOWCASE_TRADES,
  KEVIN_SEASON,
  KEVIN_SHOWCASE_TRADES,
  SHOWCASE_SCORES,
  totalPnl,
  type ShowcaseTrade,
} from "./demoScript";
import { FIRMS, firmIdForSlug } from "./firms";
import { ROSTER, userIdFor, type RosterEntry } from "./roster";
import {
  chance,
  mulberry32,
  pick,
  randFloat,
  randInt,
  shuffle,
  type SeededRng,
} from "./rng";

export interface SeedDataset {
  users: User[];
  firms: Firm[];
  traderProfiles: TraderProfile[];
  tradingAccounts: TradingAccount[];
  integrationConnections: IntegrationConnection[];
  battles: Battle[];
  battleParticipants: BattleParticipant[];
  executionEvents: ExecutionEvent[];
  accountSnapshots: AccountSnapshot[];
  battleMetricSnapshots: BattleMetricSnapshot[];
  ratingHistory: RatingHistoryEntry[];
  achievements: Achievement[];
  userAchievements: UserAchievement[];
  notifications: Notification[];
}

// ---------------------------------------------------------------------------
// Internal planning types
// ---------------------------------------------------------------------------

interface PlannedBattle {
  day: string; // ISO date
  window: BattleWindow;
  battleType: BattleType;
  market: Market;
  winnerRosterId: string;
  loserRosterId: string;
  /** KevinV's scripted battle number, if part of his authored season. */
  kevinSeq?: number;
  showcase?: boolean;
}

interface ComponentScores {
  performance: number;
  riskEfficiency: number;
  discipline: number;
  consistency: number;
  total: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

function weightedTotal(c: Omit<ComponentScores, "total">): number {
  return round1(
    c.performance * SCORE_WEIGHTS.performance +
      c.riskEfficiency * SCORE_WEIGHTS.riskEfficiency +
      c.discipline * SCORE_WEIGHTS.discipline +
      c.consistency * SCORE_WEIGHTS.consistency,
  );
}

function genComponents(rng: SeededRng, bias: number): ComponentScores {
  const base = {
    performance: round1(randFloat(rng, 45, 90) + bias),
    riskEfficiency: round1(randFloat(rng, 42, 92) + bias),
    discipline: round1(randFloat(rng, 45, 93) + bias),
    consistency: round1(randFloat(rng, 40, 90) + bias),
  };
  const clamp = (n: number) => Math.min(97, Math.max(18, n));
  const clamped = {
    performance: clamp(base.performance),
    riskEfficiency: clamp(base.riskEfficiency),
    discipline: clamp(base.discipline),
    consistency: clamp(base.consistency),
  };
  return { ...clamped, total: weightedTotal(clamped) };
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1_000).toISOString();
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildSeedDataset(): SeedDataset {
  // Independent streams so a change in one generation area does not cascade
  // into unrelated areas. All derive from the single master SEED.
  const rngRoster = mulberry32(SEED ^ 0x1a2b3c4d);
  const rngPlan = mulberry32(SEED ^ 0x2b3c4d5e);
  const rngMetrics = mulberry32(SEED ^ 0x3c4d5e6f);
  const rngRatings = mulberry32(SEED ^ 0x4d5e6f70);
  const rngExtras = mulberry32(SEED ^ 0x5e6f7081);

  const weekdays = seasonWeekdays();
  const rosterById = new Map(ROSTER.map((r) => [r.id, r]));
  const delta = rosterById.get("deltahunter")!;

  // --- Users -----------------------------------------------------------------
  const users: User[] = ROSTER.map((entry) => {
    const joinOffset = randInt(rngRoster, 0, 280);
    const createdAt = addMinutes(
      "2025-05-15T14:00:00.000Z",
      joinOffset * 24 * 60,
    );
    return {
      id: userIdFor(entry.id),
      displayName: entry.displayName,
      email: `${entry.id}@demo.traderbattles.test`,
      avatarUrl: null,
      isDemoUser: entry.id === "kevinv",
      createdAt,
    };
  });

  // --- Trading accounts + integration connections ----------------------------
  const PLANS: Record<string, Array<{ name: string; balance: number }>> = {
    mffu: [
      { name: "50K Rapid", balance: 50_000 },
      { name: "50K Rapid", balance: 100_000 },
    ],
    tradeify: [
      { name: "50K Rapid", balance: 50_000 },
      { name: "50K Rapid", balance: 100_000 },
    ],
    apex: [
      { name: "50K Rapid", balance: 50_000 },
      { name: "50K Rapid", balance: 150_000 },
    ],
    topstep: [
      { name: "50K Rapid", balance: 50_000 },
      { name: "50K Rapid", balance: 100_000 },
    ],
    independent: [{ name: "50K Rapid", balance: 75_000 }],
    brokerage: [{ name: "50K Rapid", balance: 60_000 }],
  };

  const tradingAccounts: TradingAccount[] = ROSTER.map((entry) => {
    const plan = pick(rngRoster, PLANS[entry.firmSlug]);
    const isProp = entry.firmSlug !== "independent" && entry.firmSlug !== "brokerage";
    const dailyLossLimit = pick(rngRoster, [1000, 1250, 1500, 2000, 2500]);
    const account: TradingAccount = {
      id: `acct-${entry.id}`,
      userId: userIdFor(entry.id),
      provider: "mock",
      externalAccountId: `SIM-${entry.id.toUpperCase().slice(0, 10)}-${randInt(rngRoster, 10_000, 99_999)}`,
      accountType: isProp
        ? chance(rngRoster, 0.7)
          ? "PROP_FUNDED"
          : "PROP_EVALUATION"
        : "BROKERAGE",
      propFirm: FIRMS.find((f) => f.slug === entry.firmSlug)!.name,
      startingBalance: plan.balance,
      currentBalance: round2(plan.balance * randFloat(rngRoster, 0.955, 1.14, 4)),
      status: "ACTIVE",
      connectionStatus: "CONNECTED",
      maximumContracts: randInt(rngRoster, 3, 10),
      dailyLossLimit,
      metadata: {
        planName: plan.name,
        dailyDrawdownRemaining: Math.round(
          dailyLossLimit * randFloat(rngRoster, 0.5, 1.0),
        ),
        note: "Simulated demo account",
      },
      verificationStatus: "SIMULATED",
    };
    return account;
  });

  // Authored overrides for the demo pair (spec + showcase battle math).
  const kevinAccount = tradingAccounts.find((a) => a.id === "acct-kevinv")!;
  Object.assign(kevinAccount, {
    externalAccountId: "SIM-50K-84127",
    accountType: "PROP_FUNDED",
    propFirm: "MFFU",
    startingBalance: 50_000,
    currentBalance: 52_840.0, // 52,061.40 pre-battle + 778.60 showcase net
    maximumContracts: 5,
    dailyLossLimit: 1250,
    metadata: {
      planName: "50K Rapid",
      dailyDrawdownRemaining: 980,
      note: "Simulated demo account",
    },
  } satisfies Partial<TradingAccount>);
  const deltaAccount = tradingAccounts.find((a) => a.id === "acct-deltahunter")!;
  Object.assign(deltaAccount, {
    externalAccountId: "SIM-50K-31552",
    accountType: "PROP_FUNDED",
    propFirm: "Tradeify",
    startingBalance: 50_000,
    currentBalance: 50_732.24, // 49,820.00 pre-battle + 912.24 showcase net
    maximumContracts: 6,
    dailyLossLimit: 1500,
    metadata: {
      planName: "50K Rapid",
      dailyDrawdownRemaining: 610,
      note: "Simulated demo account",
    },
  } satisfies Partial<TradingAccount>);

  const integrationConnections: IntegrationConnection[] = ROSTER.map(
    (entry, i) => ({
      id: `conn-${entry.id}`,
      userId: userIdFor(entry.id),
      provider: "mock",
      connectionType: "SIMULATED",
      status: "CONNECTED",
      externalUserId: `sim-${entry.id}`,
      accessMetadata: {
        scopes: ["executions:read", "account:read"],
        note: "Simulated demo connection. No credentials are stored.",
      },
      connectedAt: users[i].createdAt,
      lastSyncedAt: isoAt("2026-07-17", "20:05:00"),
      verificationStatus: "SIMULATED",
    }),
  );

  // --- Battle planning --------------------------------------------------------
  const planned: PlannedBattle[] = [];
  const busy = new Set<string>(); // `${rosterId}|${day}`
  const reserve = (rosterId: string, day: string) => busy.add(`${rosterId}|${day}`);
  const isBusy = (rosterId: string, day: string) => busy.has(`${rosterId}|${day}`);

  // 1) KevinV's authored 29-battle season.
  //    Battles 1..26 evenly spaced Mar 16 - Jul 14; 27/28/29 on the final
  //    three weekdays (Jul 15/16/17) so the 3-win streak is fresh.
  const kevinDays: string[] = KEVIN_SEASON.map((scripted, i) => {
    if (i >= 26) return weekdays[weekdays.length - (29 - i)];
    return weekdays[Math.round((i * (weekdays.length - 4)) / 25)];
  });
  KEVIN_SEASON.forEach((scripted, i) => {
    const day = kevinDays[i];
    const opponent = scripted.opponentId;
    planned.push({
      day,
      window: scripted.window,
      battleType: scripted.battleType,
      market: scripted.market,
      winnerRosterId: scripted.result === "W" ? "kevinv" : opponent,
      loserRosterId: scripted.result === "W" ? opponent : "kevinv",
      kevinSeq: scripted.seq,
      showcase: scripted.seq === 29,
    });
    reserve("kevinv", day);
    reserve(opponent, day);
  });

  // 2) DeltaHunter's remaining season: 31 extra battles at exactly 20W-11L
  //    (plus 1W-2L vs KevinV above = 21-13 total, per spec).
  const deltaKevinDays = new Set(
    KEVIN_SEASON.filter((s) => s.opponentId === "deltahunter").map(
      (s) => kevinDays[s.seq - 1],
    ),
  );
  const deltaDays = shuffle(rngPlan, weekdays)
    .filter((d) => !deltaKevinDays.has(d))
    .slice(0, 31)
    .sort();
  const deltaLossSlots = new Set(
    shuffle(rngPlan, Array.from({ length: 31 }, (_, i) => i)).slice(0, 11),
  );
  const deltaOpponents = ROSTER.filter(
    (r) =>
      r.id !== "kevinv" &&
      r.id !== "deltahunter" &&
      Math.abs(r.targetRating - delta.targetRating) <= 220,
  );
  deltaDays.forEach((day, i) => {
    let opponent = pick(rngPlan, deltaOpponents);
    for (let attempt = 0; attempt < 25 && isBusy(opponent.id, day); attempt++) {
      opponent = pick(rngPlan, deltaOpponents);
    }
    const deltaWins = !deltaLossSlots.has(i);
    planned.push({
      day,
      window: pickWindow(rngPlan),
      battleType: pickBattleType(rngPlan),
      market: chance(rngPlan, 0.75) ? "NQ" : pick(rngPlan, ["MNQ", "ES"] as const),
      winnerRosterId: deltaWins ? "deltahunter" : opponent.id,
      loserRosterId: deltaWins ? opponent.id : "deltahunter",
    });
    reserve("deltahunter", day);
    reserve(opponent.id, day);
  });

  // 3) The wider ladder: 130 battles among the other 42 traders, paired by
  //    rating proximity, outcome probability Elo-weighted on target ratings.
  const others = ROSTER.filter((r) => r.id !== "kevinv" && r.id !== "deltahunter");
  for (let i = 0; i < 130; i++) {
    let a = pick(rngPlan, others);
    let day = pick(rngPlan, weekdays);
    for (let attempt = 0; attempt < 25 && isBusy(a.id, day); attempt++) {
      a = pick(rngPlan, others);
      day = pick(rngPlan, weekdays);
    }
    const nearby = others.filter(
      (r) => r.id !== a.id && Math.abs(r.targetRating - a.targetRating) <= 160,
    );
    const pool = nearby.length > 0 ? nearby : others.filter((r) => r.id !== a.id);
    let b = pick(rngPlan, pool);
    for (let attempt = 0; attempt < 25 && isBusy(b.id, day); attempt++) {
      b = pick(rngPlan, pool);
    }
    const pWinA = 1 / (1 + 10 ** ((b.targetRating - a.targetRating) / 400));
    const aWins = rngPlan() < pWinA;
    planned.push({
      day,
      window: pickWindow(rngPlan),
      battleType: pickBattleType(rngPlan),
      market: pickMarket(rngPlan, a, b),
      winnerRosterId: aWins ? a.id : b.id,
      loserRosterId: aWins ? b.id : a.id,
    });
    reserve(a.id, day);
    reserve(b.id, day);
  }

  // 4) Fix-up: guarantee every trader appears in at least two battles.
  for (const entry of others) {
    const count = planned.filter(
      (p) => p.winnerRosterId === entry.id || p.loserRosterId === entry.id,
    ).length;
    for (let extra = count; extra < 2; extra++) {
      const pool = others.filter((r) => r.id !== entry.id);
      const opponent = pool.reduce((best, r) =>
        Math.abs(r.targetRating - entry.targetRating) <
        Math.abs(best.targetRating - entry.targetRating)
          ? r
          : best,
      );
      const day = pick(rngPlan, weekdays);
      const pWin =
        1 /
        (1 + 10 ** ((opponent.targetRating - entry.targetRating) / 400));
      const wins = rngPlan() < pWin;
      planned.push({
        day,
        window: pickWindow(rngPlan),
        battleType: pickBattleType(rngPlan),
        market: pickMarket(rngPlan, entry, opponent),
        winnerRosterId: wins ? entry.id : opponent.id,
        loserRosterId: wins ? opponent.id : entry.id,
      });
    }
  }

  // Chronological order, stable tie-break on authored insertion order.
  const withIndex = planned.map((p, i) => ({ p, i }));
  withIndex.sort((x, y) => {
    const dayCmp = x.p.day.localeCompare(y.p.day);
    if (dayCmp !== 0) return dayCmp;
    const startCmp = WINDOW_TIMES_UTC[x.p.window].start.localeCompare(
      WINDOW_TIMES_UTC[y.p.window].start,
    );
    if (startCmp !== 0) return startCmp;
    return x.i - y.i;
  });
  const ordered = withIndex.map((x) => x.p);

  // --- Battle rows + participants + final metric snapshots -------------------
  const battles: Battle[] = [];
  const battleParticipants: BattleParticipant[] = [];
  const battleMetricSnapshots: BattleMetricSnapshot[] = [];
  /** battleId -> authored rating-change magnitudes (winner gain, loser loss). */
  const deltaMagnitudes = new Map<string, { winner: number; loser: number }>();
  /** rosterId -> chronological list of their battles. */
  const perTrader = new Map<
    string,
    Array<{ battleId: string; won: boolean; endTime: string; opponentTarget: number; market: Market; window: BattleWindow }>
  >();
  ROSTER.forEach((r) => perTrader.set(r.id, []));

  let showcaseBattleId = "";
  const kevinBattleIdBySeq = new Map<number, string>();

  ordered.forEach((plan, index) => {
    const battleId = `battle-${String(index + 1).padStart(3, "0")}`;
    const times = WINDOW_TIMES_UTC[plan.window];
    const scheduledStart = isoAt(plan.day, times.start);
    const endTime = isoAt(plan.day, times.end);
    const winner = rosterById.get(plan.winnerRosterId)!;
    const loser = rosterById.get(plan.loserRosterId)!;

    battles.push({
      id: battleId,
      battleType: plan.battleType,
      market: plan.market,
      status: "COMPLETED",
      scheduledStart,
      actualStart: scheduledStart,
      endTime,
      battleWindow: plan.window,
      scoringConfigurationId: SCORING_CONFIGURATION_ID,
      winnerId: userIdFor(winner.id),
      verificationStatus: "SIMULATED",
      createdAt: addMinutes(scheduledStart, -12),
    });
    if (plan.showcase) showcaseBattleId = battleId;
    if (plan.kevinSeq) kevinBattleIdBySeq.set(plan.kevinSeq, battleId);

    // Scores: two generated component sets; the higher total belongs to the
    // winner. The showcase battle uses the brief's authored worked example.
    let winnerScores: ComponentScores;
    let loserScores: ComponentScores;
    if (plan.showcase) {
      winnerScores = {
        performance: SHOWCASE_SCORES.kevinv.performance,
        riskEfficiency: SHOWCASE_SCORES.kevinv.riskEfficiency,
        discipline: SHOWCASE_SCORES.kevinv.discipline,
        consistency: SHOWCASE_SCORES.kevinv.consistency,
        total: SHOWCASE_SCORES.kevinv.total,
      };
      loserScores = {
        performance: SHOWCASE_SCORES.deltahunter.performance,
        riskEfficiency: SHOWCASE_SCORES.deltahunter.riskEfficiency,
        discipline: SHOWCASE_SCORES.deltahunter.discipline,
        consistency: SHOWCASE_SCORES.deltahunter.consistency,
        total: SHOWCASE_SCORES.deltahunter.total,
      };
    } else {
      const setA = genComponents(rngMetrics, 4);
      const setB = genComponents(rngMetrics, -4);
      [winnerScores, loserScores] =
        setA.total >= setB.total ? [setA, setB] : [setB, setA];
      if (winnerScores.total === loserScores.total) {
        winnerScores = {
          ...winnerScores,
          consistency: Math.min(97, winnerScores.consistency + 3),
        };
        winnerScores.total = weightedTotal(winnerScores);
      }
    }

    // P&L / drawdown / trade counts. ~18% of battles are "discipline beats
    // raw profit": the loser out-earns the winner but loses on score.
    let winnerPnl: number;
    let loserPnl: number;
    let winnerDd: number;
    let loserDd: number;
    if (plan.showcase) {
      winnerPnl = totalPnl(KEVIN_SHOWCASE_TRADES);
      loserPnl = totalPnl(DELTA_SHOWCASE_TRADES);
      winnerDd = SHOWCASE_SCORES.kevinv.maxDrawdown;
      loserDd = SHOWCASE_SCORES.deltahunter.maxDrawdown;
    } else {
      const roll = rngMetrics();
      if (roll < 0.18) {
        winnerPnl = randInt(rngMetrics, 150, 900);
        loserPnl = winnerPnl + randInt(rngMetrics, 100, 620);
        winnerDd = randInt(rngMetrics, 90, 480);
        loserDd = randInt(rngMetrics, 900, 1800);
      } else if (roll < 0.3) {
        winnerPnl = randInt(rngMetrics, -380, -40);
        loserPnl = winnerPnl - randInt(rngMetrics, 80, 640);
        winnerDd = randInt(rngMetrics, 220, 700);
        loserDd = randInt(rngMetrics, 420, 1400);
      } else {
        winnerPnl = randInt(rngMetrics, 140, 1400);
        loserPnl = chance(rngMetrics, 0.62)
          ? randInt(rngMetrics, -950, -60)
          : randInt(rngMetrics, 20, Math.max(40, Math.floor(winnerPnl * 0.7)));
        winnerDd = randInt(rngMetrics, 90, 680);
        loserDd = randInt(rngMetrics, 200, 1300);
      }
    }

    const winnerParticipantId = `bp-${battleId}-${winner.id}`;
    const loserParticipantId = `bp-${battleId}-${loser.id}`;
    battleParticipants.push(
      {
        id: winnerParticipantId,
        battleId,
        userId: userIdFor(winner.id),
        tradingAccountId: `acct-${winner.id}`,
        startingRating: 0, // filled by the rating-chain pass below
        endingRating: 0,
        finalScore: winnerScores.total,
        result: "WIN",
        verificationStatus: "SIMULATED",
      },
      {
        id: loserParticipantId,
        battleId,
        userId: userIdFor(loser.id),
        tradingAccountId: `acct-${loser.id}`,
        startingRating: 0,
        endingRating: 0,
        finalScore: loserScores.total,
        result: "LOSS",
        verificationStatus: "SIMULATED",
      },
    );

    const finalSnapshot = (
      participantId: string,
      rosterId: string,
      scores: ComponentScores,
      netPnl: number,
      maxDd: number,
      tradeCount: number,
      riskUtilization: number,
    ): BattleMetricSnapshot => ({
      id: `bms-${battleId}-${rosterId}-final`,
      battleId,
      participantId,
      netPnl,
      maximumDrawdown: maxDd,
      tradeCount,
      riskUtilization,
      performanceScore: scores.performance,
      riskEfficiencyScore: scores.riskEfficiency,
      disciplineScore: scores.discipline,
      consistencyScore: scores.consistency,
      totalBattleScore: scores.total,
      isFinal: true,
      timestamp: endTime,
      verificationStatus: "SIMULATED",
    });

    battleMetricSnapshots.push(
      finalSnapshot(
        winnerParticipantId,
        winner.id,
        winnerScores,
        winnerPnl,
        winnerDd,
        plan.showcase ? KEVIN_SHOWCASE_TRADES.length : randInt(rngMetrics, 3, 11),
        plan.showcase
          ? SHOWCASE_SCORES.kevinv.riskUtilization
          : randFloat(rngMetrics, 0.15, 0.6),
      ),
      finalSnapshot(
        loserParticipantId,
        loser.id,
        loserScores,
        loserPnl,
        loserDd,
        plan.showcase ? DELTA_SHOWCASE_TRADES.length : randInt(rngMetrics, 4, 14),
        plan.showcase
          ? SHOWCASE_SCORES.deltahunter.riskUtilization
          : randFloat(rngMetrics, 0.3, 0.95),
      ),
    );

    // Authored Elo-style movement magnitude (rating-gap aware, jittered).
    // NOTE: plug-in point — once lib/ratings/calculateRatingChange.ts exists
    // (Phase 2), historical regeneration should route through it instead.
    const gap = loser.targetRating - winner.targetRating;
    const base = Math.min(26, Math.max(6, Math.round(14 + gap / 25)));
    deltaMagnitudes.set(battleId, {
      winner: Math.min(30, Math.max(5, base + randInt(rngRatings, -2, 2))),
      loser: Math.min(28, Math.max(5, base + randInt(rngRatings, -2, 2))),
    });

    perTrader.get(winner.id)!.push({
      battleId,
      won: true,
      endTime,
      opponentTarget: loser.targetRating,
      market: plan.market,
      window: plan.window,
    });
    perTrader.get(loser.id)!.push({
      battleId,
      won: false,
      endTime,
      opponentTarget: winner.targetRating,
      market: plan.market,
      window: plan.window,
    });
  });

  // --- Rating chains (per trader, chronological) ------------------------------
  // KevinV's season delta is pinned to exactly +96 (1588 -> 1684) by
  // distributing the correction across his wins.
  const kevinLedger = perTrader.get("kevinv")!;
  {
    const signed = kevinLedger.map((b) => {
      const mags = deltaMagnitudes.get(b.battleId)!;
      return b.won ? mags.winner : -mags.loser;
    });
    let diff = 96 - signed.reduce((s, d) => s + d, 0);
    let guard = 0;
    while (diff !== 0 && guard < 10_000) {
      for (let i = 0; i < kevinLedger.length && diff !== 0; i++) {
        if (!kevinLedger[i].won) continue;
        const mags = deltaMagnitudes.get(kevinLedger[i].battleId)!;
        if (diff > 0 && mags.winner < 30) {
          mags.winner += 1;
          diff -= 1;
        } else if (diff < 0 && mags.winner > 5) {
          mags.winner -= 1;
          diff += 1;
        }
      }
      guard++;
    }
    if (diff !== 0) throw new Error("seed: unable to pin KevinV season delta to +96");
  }

  const ratingHistory: RatingHistoryEntry[] = [];
  const participantByKey = new Map(
    battleParticipants.map((p) => [`${p.battleId}|${p.userId}`, p]),
  );
  const chainStats = new Map<
    string,
    {
      start: number;
      final: number;
      high: number;
      seasonWins: number;
      seasonLosses: number;
      currentStreak: number;
      bestWinStreak: number;
    }
  >();

  for (const entry of ROSTER) {
    const ledger = perTrader.get(entry.id)!; // already chronological
    const signedDeltas = ledger.map((b) => {
      const mags = deltaMagnitudes.get(b.battleId)!;
      return b.won ? mags.winner : -mags.loser;
    });
    const total = signedDeltas.reduce((s, d) => s + d, 0);
    const start = entry.targetRating - total;

    let current = start;
    let high = start;
    let wins = 0;
    let losses = 0;
    let streak = 0;
    let bestWinStreak = 0;
    ledger.forEach((b, i) => {
      const change = signedDeltas[i];
      const previous = current;
      current += change;
      high = Math.max(high, current);
      if (b.won) {
        wins++;
        streak = streak >= 0 ? streak + 1 : 1;
        bestWinStreak = Math.max(bestWinStreak, streak);
      } else {
        losses++;
        streak = streak <= 0 ? streak - 1 : -1;
      }
      const participant = participantByKey.get(
        `${b.battleId}|${userIdFor(entry.id)}`,
      )!;
      participant.startingRating = previous;
      participant.endingRating = current;
      ratingHistory.push({
        id: `rh-${b.battleId}-${entry.id}`,
        userId: userIdFor(entry.id),
        battleId: b.battleId,
        previousRating: previous,
        newRating: current,
        change,
        createdAt: b.endTime,
      });
    });

    chainStats.set(entry.id, {
      start,
      final: current,
      high,
      seasonWins: wins,
      seasonLosses: losses,
      currentStreak: streak,
      bestWinStreak,
    });
  }

  // --- Trader profiles (records/streaks derived from battles) -----------------
  const traderProfiles: TraderProfile[] = ROSTER.map((entry) => {
    const stats = chainStats.get(entry.id)!;
    const placement = leagueForRating(entry.targetRating);
    const priorWins = randInt(rngRoster, 12, 120);
    const priorLosses = Math.round(priorWins * randFloat(rngRoster, 0.75, 1.25));
    const lowDiscipline =
      entry.battleStyle === "AGGRESSIVE" || entry.battleStyle === "HIGH_FREQUENCY";
    const profile: TraderProfile = {
      userId: userIdFor(entry.id),
      firmId: firmIdForSlug(entry.firmSlug),
      rating: stats.final,
      league: placement.league,
      division: placement.division,
      primaryMarket: entry.primaryMarket,
      secondaryMarkets: entry.secondaryMarkets,
      battleStyle: entry.battleStyle,
      disciplineScore: randInt(rngRoster, 55, 93) - (lowDiscipline ? 8 : 0),
      riskScore: randInt(rngRoster, 55, 92),
      performanceScore: randInt(rngRoster, 55, 92),
      seasonWins: stats.seasonWins,
      seasonLosses: stats.seasonLosses,
      lifetimeWins: stats.seasonWins + priorWins,
      lifetimeLosses: stats.seasonLosses + priorLosses,
      currentStreak: stats.currentStreak,
      bestWinStreak: stats.bestWinStreak,
      seasonStartRating: stats.start,
      seasonHighRating: stats.high,
    };
    return profile;
  });

  // Spec-locked profile numbers for the demo pair.
  const kevinProfile = traderProfiles.find((p) => p.userId === userIdFor("kevinv"))!;
  Object.assign(kevinProfile, {
    disciplineScore: 84,
    riskScore: 79,
    performanceScore: 76,
  } satisfies Partial<TraderProfile>);
  const deltaProfile = traderProfiles.find(
    (p) => p.userId === userIdFor("deltahunter"),
  )!;
  Object.assign(deltaProfile, {
    disciplineScore: 68,
    riskScore: 64,
    performanceScore: 85,
  } satisfies Partial<TraderProfile>);

  // --- Showcase battle detail: executions, account & metric timelines --------
  const executionEvents: ExecutionEvent[] = [];
  const accountSnapshots: AccountSnapshot[] = [];
  const showcaseStart = isoAt(kevinDays[28], WINDOW_TIMES_UTC.MIDDAY.start);

  const emitTrades = (rosterId: string, trades: ShowcaseTrade[]) => {
    trades.forEach((trade, t) => {
      const entryAt = addMinutes(showcaseStart, trade.entryMinute);
      const exitAt = addMinutes(showcaseStart, trade.exitMinute);
      const entrySide = trade.direction === "LONG" ? "BUY" : "SELL";
      const exitSide = trade.direction === "LONG" ? "SELL" : "BUY";
      const mk = (
        n: number,
        eventType: ExecutionEvent["eventType"],
        side: ExecutionEvent["side"],
        price: number,
        occurredAt: string,
        commission: number,
      ): ExecutionEvent => ({
        id: `evt-${showcaseBattleId}-${rosterId}-${t + 1}-${n}`,
        providerEventId: `mock-${showcaseBattleId}-${rosterId}-${t + 1}-${n}`,
        sourceProvider: "mock",
        tradingAccountId: `acct-${rosterId}`,
        battleId: showcaseBattleId,
        userId: userIdFor(rosterId),
        instrument: "NQ",
        side,
        quantity: trade.quantity,
        price,
        commission,
        occurredAt,
        receivedAt: addSeconds(occurredAt, 1),
        eventType,
        verificationStatus: "SIMULATED",
        rawPayload: {
          simulated: true,
          provider: "mock",
          orderId: `mock-ord-${rosterId}-${t + 1}-${n}`,
          note: "Simulated demo execution — no live trading data",
        },
      });
      executionEvents.push(
        mk(1, "FILL", entrySide, trade.entryPrice, entryAt, round2(COMMISSION_PER_SIDE * trade.quantity)),
        mk(2, "POSITION_OPENED", entrySide, trade.entryPrice, addSeconds(entryAt, 2), 0),
        mk(3, "FILL", exitSide, trade.exitPrice, exitAt, round2(COMMISSION_PER_SIDE * trade.quantity)),
        mk(4, "POSITION_CLOSED", exitSide, trade.exitPrice, addSeconds(exitAt, 2), 0),
      );
    });
  };
  emitTrades("kevinv", KEVIN_SHOWCASE_TRADES);
  emitTrades("deltahunter", DELTA_SHOWCASE_TRADES);

  interface SnapshotScript {
    rosterId: string;
    preBattleBalance: number;
    offsets: number[];
    realized: number[];
    unrealized: number[];
    openPosition: number[];
    drawdown: number[];
  }
  const snapshotScripts: SnapshotScript[] = [
    {
      rosterId: "kevinv",
      preBattleBalance: 52_061.4,
      offsets: [0, 20, 50, 74, 90, 105, 120],
      realized: [0, 190.72, 401.44, 267.16, 657.88, 657.88, 778.6],
      unrealized: [0, 0, 0, -275.72, 0, 62.0, 0],
      openPosition: [0, 0, 0, 1, 0, 1, 0],
      drawdown: [0, 0, 0, 410.0, 0, 0, 0],
    },
    {
      rosterId: "deltahunter",
      preBattleBalance: 49_820.0,
      offsets: [0, 20, 44, 58, 84, 105, 120],
      realized: [0, 451.44, 860.76, 512.2, 733.64, 420.8, 912.24],
      unrealized: [0, -300.0, 0, 0, -1112.88, 350.0, 0],
      openPosition: [0, 3, 0, 0, 3, 2, 0],
      drawdown: [0, 300.0, 0, 348.56, 1240.0, 89.96, 0],
    },
  ];
  for (const script of snapshotScripts) {
    script.offsets.forEach((offset, i) => {
      accountSnapshots.push({
        id: `as-${showcaseBattleId}-${script.rosterId}-${i}`,
        tradingAccountId: `acct-${script.rosterId}`,
        battleId: showcaseBattleId,
        balance: round2(script.preBattleBalance + script.realized[i]),
        equity: round2(
          script.preBattleBalance + script.realized[i] + script.unrealized[i],
        ),
        realizedPnl: script.realized[i],
        unrealizedPnl: script.unrealized[i],
        openPosition: script.openPosition[i],
        drawdown: script.drawdown[i],
        timestamp: addMinutes(showcaseStart, offset),
        sourceProvider: "mock",
        verificationStatus: "SIMULATED",
      });
    });
  }

  // Intra-battle score timeline for the showcase battle (lead changes:
  // DeltaHunter's gross profit leads mid-battle, drawdown decides it late).
  interface MetricTimeline {
    rosterId: string;
    totals: number[]; // at minutes 20/50/80/105
    netPnl: number[];
    drawdown: number[];
    trades: number[];
    riskUtil: number[];
    final: (typeof SHOWCASE_SCORES)["kevinv"] | (typeof SHOWCASE_SCORES)["deltahunter"];
  }
  const timelines: MetricTimeline[] = [
    {
      rosterId: "kevinv",
      totals: [54.0, 62.5, 58.8, 76.2],
      netPnl: [190.72, 401.44, 267.16, 657.88],
      drawdown: [0, 0, 410.0, 410.0],
      trades: [1, 2, 3, 4],
      riskUtil: [0.1, 0.14, 0.33, 0.33],
      final: SHOWCASE_SCORES.kevinv,
    },
    {
      rosterId: "deltahunter",
      totals: [58.5, 66.0, 71.5, 64.8],
      netPnl: [451.44, 860.76, 733.64, 420.8],
      drawdown: [300.0, 300.0, 348.56, 1240.0],
      trades: [1, 3, 5, 6],
      riskUtil: [0.25, 0.4, 0.55, 0.72],
      final: SHOWCASE_SCORES.deltahunter,
    },
  ];
  for (const tl of timelines) {
    const participantId = `bp-${showcaseBattleId}-${tl.rosterId}`;
    [20, 50, 80, 105].forEach((offset, i) => {
      const k = tl.totals[i] / tl.final.total;
      battleMetricSnapshots.push({
        id: `bms-${showcaseBattleId}-${tl.rosterId}-t${i}`,
        battleId: showcaseBattleId,
        participantId,
        netPnl: tl.netPnl[i],
        maximumDrawdown: tl.drawdown[i],
        tradeCount: tl.trades[i],
        riskUtilization: tl.riskUtil[i],
        performanceScore: round1(tl.final.performance * k),
        riskEfficiencyScore: round1(tl.final.riskEfficiency * k),
        disciplineScore: round1(tl.final.discipline * k),
        consistencyScore: round1(tl.final.consistency * k),
        totalBattleScore: tl.totals[i],
        isFinal: false,
        timestamp: addMinutes(showcaseStart, offset),
        verificationStatus: "SIMULATED",
      });
    });
  }

  // --- Achievements earned -----------------------------------------------------
  const userAchievements: UserAchievement[] = [];
  const kevinEnd = (seq: number) => {
    const battleId = kevinBattleIdBySeq.get(seq)!;
    return battles.find((b) => b.id === battleId)!.endTime!;
  };
  const kevinGoldCrossing =
    ratingHistory.find(
      (r) => r.userId === userIdFor("kevinv") && r.newRating >= 1600,
    )?.createdAt ?? kevinEnd(29);
  const kevinEarned: Array<{ achievementId: string; earnedAt: string }> = [
    { achievementId: "ach-first-victory", earnedAt: kevinEnd(1) },
    { achievementId: "ach-risk-manager", earnedAt: kevinEnd(2) },
    { achievementId: "ach-clean-battle", earnedAt: kevinEnd(5) },
    { achievementId: "ach-five-win-streak", earnedAt: kevinEnd(8) },
    { achievementId: "ach-ten-battles", earnedAt: kevinEnd(10) },
    { achievementId: "ach-opening-bell", earnedAt: kevinEnd(12) },
    { achievementId: "ach-nq-contender", earnedAt: kevinEnd(18) },
    { achievementId: "ach-gold-league", earnedAt: kevinGoldCrossing },
    { achievementId: "ach-giant-slayer", earnedAt: kevinEnd(23) },
    { achievementId: "ach-comeback-win", earnedAt: kevinEnd(25) },
  ];
  kevinEarned.forEach((e, i) => {
    userAchievements.push({
      id: `ua-kevinv-${i}`,
      userId: userIdFor("kevinv"),
      achievementId: e.achievementId,
      earnedAt: e.earnedAt,
    });
  });
  for (const entry of ROSTER) {
    if (entry.id === "kevinv") continue;
    const stats = chainStats.get(entry.id)!;
    const earned: string[] = [];
    if (stats.seasonWins > 0) earned.push("ach-first-victory");
    earned.push("ach-ten-battles"); // all seeded traders have prior seasons
    if (stats.bestWinStreak >= 5) earned.push("ach-five-win-streak");
    if (entry.targetRating >= 1600) earned.push("ach-gold-league");
    const optional = [
      "ach-risk-manager",
      "ach-clean-battle",
      "ach-comeback-win",
      "ach-opening-bell",
      "ach-nq-contender",
      "ach-giant-slayer",
    ];
    for (const achievementId of optional) {
      if (chance(rngExtras, 0.22)) earned.push(achievementId);
    }
    earned.forEach((achievementId, i) => {
      userAchievements.push({
        id: `ua-${entry.id}-${i}`,
        userId: userIdFor(entry.id),
        achievementId,
        earnedAt: isoAt(pick(rngExtras, weekdays), "20:10:00"),
      });
    });
  }

  // --- Notifications for the demo user ----------------------------------------
  const kevinFinalChange = ratingHistory
    .filter((r) => r.userId === userIdFor("kevinv"))
    .at(-1)!;
  const goldTwoCrossing = ratingHistory.find(
    (r) => r.userId === userIdFor("kevinv") && r.newRating >= 1650,
  );
  const notifications: Notification[] = [
    {
      id: "notif-kevinv-1",
      userId: userIdFor("kevinv"),
      type: "LEAGUE_PROMOTION",
      title: "Promoted to Gold II",
      body: "Your rating crossed 1,650. Welcome to Gold II — keep it above the line to stay.",
      href: "/leagues",
      read: true,
      createdAt: goldTwoCrossing?.createdAt ?? kevinEnd(20),
    },
    {
      id: "notif-kevinv-2",
      userId: userIdFor("kevinv"),
      type: "RIVAL_PASSED",
      title: "DeltaHunter passed you",
      body: "DeltaHunter moved past you on the NQ leaderboard at 1,712.",
      href: "/leaderboards",
      read: true,
      createdAt: isoAt(weekdays[weekdays.length - 6], "21:15:00"),
    },
    {
      id: "notif-kevinv-3",
      userId: userIdFor("kevinv"),
      type: "MATCH_FOUND",
      title: "Match found",
      body: "Opponent: DeltaHunter (Gold I, 1,712). Midday window on NQ.",
      href: `/battle`,
      read: true,
      createdAt: addMinutes(showcaseStart, -5),
    },
    {
      id: "notif-kevinv-4",
      userId: userIdFor("kevinv"),
      type: "BATTLE_STARTING",
      title: "Battle starting",
      body: "Your Midday NQ battle against DeltaHunter begins in five minutes.",
      href: `/battle`,
      read: true,
      createdAt: addMinutes(showcaseStart, -5),
    },
    {
      id: "notif-kevinv-5",
      userId: userIdFor("kevinv"),
      type: "BATTLE_RESULT",
      title: "Victory over DeltaHunter",
      body: "Final score 83.9 - 73.6. Lower drawdown and cleaner discipline decided it.",
      href: `/history`,
      read: false,
      createdAt: addMinutes(showcaseStart, 122),
    },
    {
      id: "notif-kevinv-6",
      userId: userIdFor("kevinv"),
      type: "RATING_INCREASED",
      title: "Rating increased",
      body: `Your rating moved +${kevinFinalChange.change} to 1,684 — a three-battle win streak.`,
      href: "/profile",
      read: false,
      createdAt: addMinutes(showcaseStart, 122),
    },
    {
      id: "notif-kevinv-7",
      userId: userIdFor("kevinv"),
      type: "NEW_CHALLENGE",
      title: "New challenge available",
      body: "An Opening Bell battle window on NQ opens Monday at 9:30 a.m. ET.",
      href: "/battle",
      read: false,
      createdAt: isoAt("2026-07-18", "12:00:00"),
    },
  ];

  return {
    users,
    firms: FIRMS,
    traderProfiles,
    tradingAccounts,
    integrationConnections,
    battles,
    battleParticipants,
    executionEvents,
    accountSnapshots,
    battleMetricSnapshots,
    ratingHistory,
    achievements: ACHIEVEMENTS,
    userAchievements,
    notifications,
  };
}

// ---------------------------------------------------------------------------
// Weighted pick helpers (deterministic)
// ---------------------------------------------------------------------------

function pickWindow(rng: SeededRng): BattleWindow {
  const roll = rng();
  if (roll < 0.35) return "OPENING_BELL";
  if (roll < 0.6) return "MIDDAY";
  if (roll < 0.85) return "AFTERNOON";
  return "FULL_SESSION";
}

function pickBattleType(rng: SeededRng): BattleType {
  const roll = rng();
  if (roll < 0.82) return "LIVE_PERFORMANCE";
  if (roll < 0.94) return "DISCIPLINE_BATTLE";
  return "REPLAY_CHALLENGE";
}

function pickMarket(rng: SeededRng, a: RosterEntry, b: RosterEntry): Market {
  const roll = rng();
  if (roll < 0.5) return a.primaryMarket;
  if (roll < 0.8) return b.primaryMarket;
  const secondaries = [...a.secondaryMarkets, ...b.secondaryMarkets];
  return secondaries.length > 0 ? pick(rng, secondaries) : a.primaryMarket;
}
