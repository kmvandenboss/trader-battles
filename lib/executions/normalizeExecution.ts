/**
 * normalizeExecution — provider event -> NormalizedExecutionEvent.
 *
 * First stage of the ingestion pipeline. Accepts an UNTRUSTED value (each
 * provider adapter emits a `RawExecutionRecord`, but we validate as if it
 * came off the wire) and either produces a fully-typed
 * `NormalizedExecutionEvent` or rejects with human-readable reasons.
 *
 * PLUG-IN POINT FOR REAL INTEGRATIONS: a future NinjaTrader/Tradovate/Rithmic
 * adapter maps its native payload into `RawExecutionRecord` and everything
 * from here on is identical to the mock path.
 *
 * Pure function — no I/O, no framework imports, no randomness.
 */

import {
  EXECUTION_EVENT_TYPES,
  INTEGRATION_PROVIDERS,
  MARKETS,
  ORDER_SIDES,
  VERIFICATION_STATUSES,
  type ExecutionEventType,
  type IntegrationProvider,
  type Market,
  type OrderSide,
  type VerificationStatus,
} from "@/lib/data/schema";
import type { NormalizedExecutionEvent } from "@/lib/integrations/types";

export type NormalizationResult =
  | { ok: true; event: NormalizedExecutionEvent }
  | { ok: false; errors: string[] };

/** Default verification level per provider. The demo is always SIMULATED. */
const PROVIDER_DEFAULT_VERIFICATION: Record<
  IntegrationProvider,
  VerificationStatus
> = {
  mock: "SIMULATED",
  ninjatrader: "CLIENT_VERIFIED",
  tradovate: "PROVIDER_VERIFIED",
  rithmic: "PROVIDER_VERIFIED",
  csv: "SELF_REPORTED",
};

/** Markets by code length (desc) so "MNQU6" resolves to MNQ, not NQ. */
const MARKETS_LONGEST_FIRST: readonly Market[] = [...MARKETS].sort(
  (a, b) => b.length - a.length,
);

/**
 * Resolve a raw provider symbol (possibly a dated contract like "NQU6" or
 * "MESZ6") to a supported market. Returns null when unsupported.
 */
export function resolveInstrument(rawSymbol: string): Market | null {
  const symbol = rawSymbol.trim().toUpperCase();
  for (const market of MARKETS_LONGEST_FIRST) {
    if (symbol === market) return market;
    if (symbol.startsWith(market)) {
      const rest = symbol.slice(market.length);
      // Allow contract month/year suffixes ("U6", "Z26") and separators.
      if (/^[\s\-_]?[FGHJKMNQUVXZ]?\d{0,4}$/.test(rest)) return market;
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function isValidIsoTimestamp(value: string): boolean {
  const ms = Date.parse(value);
  return Number.isFinite(ms);
}

function includes<T extends string>(
  values: readonly T[],
  candidate: string,
): candidate is T {
  return (values as readonly string[]).includes(candidate);
}

/**
 * Validate and normalize one raw provider record.
 *
 * @param raw        untrusted provider-adapter output (`RawExecutionRecord`).
 * @param receivedAt pipeline receipt time (ISO). Defaults to the event's own
 *                   `occurredAt` so replays stay deterministic.
 */
export function normalizeExecution(
  raw: unknown,
  receivedAt?: string,
): NormalizationResult {
  const errors: string[] = [];
  if (!isRecord(raw)) {
    return { ok: false, errors: ["event is not an object"] };
  }

  const providerEventId = asNonEmptyString(raw.providerEventId);
  if (!providerEventId) errors.push("providerEventId is required");

  const providerRaw = asNonEmptyString(raw.sourceProvider);
  let sourceProvider: IntegrationProvider | null = null;
  if (!providerRaw) {
    errors.push("sourceProvider is required");
  } else if (includes(INTEGRATION_PROVIDERS, providerRaw)) {
    sourceProvider = providerRaw;
  } else {
    errors.push(`unknown sourceProvider "${providerRaw}"`);
  }

  const accountId = asNonEmptyString(raw.accountId);
  if (!accountId) errors.push("accountId is required");

  const instrumentRaw = asNonEmptyString(raw.instrument);
  let instrument: Market | null = null;
  if (!instrumentRaw) {
    errors.push("instrument is required");
  } else {
    instrument = resolveInstrument(instrumentRaw);
    if (!instrument) errors.push(`unsupported instrument "${instrumentRaw}"`);
  }

  const sideRaw = asNonEmptyString(raw.side)?.toUpperCase() ?? null;
  let side: OrderSide | null = null;
  if (!sideRaw) {
    errors.push("side is required");
  } else if (includes(ORDER_SIDES, sideRaw)) {
    side = sideRaw;
  } else {
    errors.push(`invalid side "${sideRaw}" (expected BUY or SELL)`);
  }

  const eventTypeRaw = asNonEmptyString(raw.eventType)?.toUpperCase() ?? null;
  let eventType: ExecutionEventType | null = null;
  if (!eventTypeRaw) {
    errors.push("eventType is required");
  } else if (includes(EXECUTION_EVENT_TYPES, eventTypeRaw)) {
    eventType = eventTypeRaw;
  } else {
    errors.push(`unknown eventType "${eventTypeRaw}"`);
  }

  const quantity = raw.quantity;
  if (
    typeof quantity !== "number" ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    errors.push("quantity must be a positive integer");
  }

  const price = raw.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    errors.push("price must be a positive finite number");
  }

  const commission = raw.commission ?? 0;
  if (
    typeof commission !== "number" ||
    !Number.isFinite(commission) ||
    commission < 0
  ) {
    errors.push("commission must be a non-negative finite number");
  }

  const occurredAt = asNonEmptyString(raw.occurredAt);
  if (!occurredAt || !isValidIsoTimestamp(occurredAt)) {
    errors.push("occurredAt must be a valid ISO-8601 timestamp");
  }

  let verificationStatus: VerificationStatus | null = null;
  const verificationRaw = raw.verificationStatus;
  if (verificationRaw === undefined || verificationRaw === null) {
    verificationStatus = sourceProvider
      ? PROVIDER_DEFAULT_VERIFICATION[sourceProvider]
      : null;
  } else if (
    typeof verificationRaw === "string" &&
    includes(VERIFICATION_STATUSES, verificationRaw)
  ) {
    verificationStatus = verificationRaw;
  } else {
    errors.push(`invalid verificationStatus "${String(verificationRaw)}"`);
  }

  const rawPayload = isRecord(raw.rawPayload)
    ? raw.rawPayload
    : { ...raw };

  if (
    errors.length > 0 ||
    !providerEventId ||
    !sourceProvider ||
    !accountId ||
    !instrument ||
    !side ||
    !eventType ||
    !occurredAt ||
    !verificationStatus
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    event: {
      providerEventId,
      sourceProvider,
      accountId,
      instrument,
      side,
      quantity: quantity as number,
      price: price as number,
      commission: commission as number,
      occurredAt,
      receivedAt: receivedAt ?? occurredAt,
      eventType,
      verificationStatus,
      rawPayload,
    },
  };
}
