/**
 * Row normalizers for the Postgres repository implementation.
 *
 * The schema declares every timestamp column with { mode: "string" }, so the
 * in-memory impl serves ISO-8601 UTC strings ("2026-07-17T16:00:00.000Z")
 * while Postgres returns its own text form ("2026-07-17 16:00:00+00").
 * These mappers convert every timestamp back to the exact ISO shape the
 * in-memory impl returns, so string comparisons, date filtering, and UI
 * formatting behave identically on both backends.
 *
 * All other columns pass through unchanged — the drizzle $inferSelect row
 * types ARE the domain types (lib/data/schema/types.ts).
 */

import type {
  AccountSnapshot,
  Battle,
  BattleMetricSnapshot,
  Challenge,
  ExecutionEvent,
  IntegrationConnection,
  MarketBar,
  Notification,
  RatingHistoryEntry,
  TraderInvite,
  User,
  UserAchievement,
} from "../../schema/types";

/** Postgres timestamptz text → ISO-8601 UTC string (the in-memory shape). */
function toIso(value: string): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`unparseable timestamp from Postgres: "${value}"`);
  }
  return new Date(ms).toISOString();
}

function toIsoOrNull(value: string | null): string | null {
  return value === null ? null : toIso(value);
}

export function mapUser(row: User): User {
  return { ...row, createdAt: toIso(row.createdAt) };
}

export function mapIntegrationConnection(
  row: IntegrationConnection,
): IntegrationConnection {
  return {
    ...row,
    connectedAt: toIso(row.connectedAt),
    lastSyncedAt: toIso(row.lastSyncedAt),
  };
}

export function mapBattle(row: Battle): Battle {
  return {
    ...row,
    scheduledStart: toIso(row.scheduledStart),
    scheduledEnd: toIsoOrNull(row.scheduledEnd),
    actualStart: toIsoOrNull(row.actualStart),
    endTime: toIsoOrNull(row.endTime),
    createdAt: toIso(row.createdAt),
  };
}

export function mapChallenge(row: Challenge): Challenge {
  return {
    ...row,
    createdAt: toIso(row.createdAt),
    respondedAt: toIsoOrNull(row.respondedAt),
  };
}

export function mapTraderInvite(row: TraderInvite): TraderInvite {
  return { ...row, createdAt: toIso(row.createdAt) };
}

export function mapMarketBar(row: MarketBar): MarketBar {
  return {
    ...row,
    barStart: toIso(row.barStart),
    importedAt: toIso(row.importedAt),
  };
}

export function mapExecutionEvent(row: ExecutionEvent): ExecutionEvent {
  return {
    ...row,
    occurredAt: toIso(row.occurredAt),
    receivedAt: toIso(row.receivedAt),
  };
}

export function mapAccountSnapshot(row: AccountSnapshot): AccountSnapshot {
  return { ...row, timestamp: toIso(row.timestamp) };
}

export function mapBattleMetricSnapshot(
  row: BattleMetricSnapshot,
): BattleMetricSnapshot {
  return { ...row, timestamp: toIso(row.timestamp) };
}

export function mapRatingHistoryEntry(
  row: RatingHistoryEntry,
): RatingHistoryEntry {
  return { ...row, createdAt: toIso(row.createdAt) };
}

export function mapUserAchievement(row: UserAchievement): UserAchievement {
  return { ...row, earnedAt: toIso(row.earnedAt) };
}

export function mapNotification(row: Notification): Notification {
  return { ...row, createdAt: toIso(row.createdAt) };
}
