/**
 * deduplicateExecution — idempotent event intake.
 *
 * Providers (real ones especially) can and will deliver the same execution
 * more than once: reconnect replays, at-least-once webhooks, overlapping
 * history pulls. Every event is keyed by `sourceProvider + providerEventId`
 * and applied at most once.
 *
 * State is a plain serializable object (no Set/Map) so battle snapshots can
 * be JSON round-tripped. Pure functions — callers get a new state back.
 */

import type { NormalizedExecutionEvent } from "@/lib/integrations/types";

export interface DedupeState {
  /** Keys already applied, `${sourceProvider}:${providerEventId}` -> true. */
  seenKeys: Record<string, true>;
}

export function createDedupeState(): DedupeState {
  return { seenKeys: {} };
}

export function dedupeKeyFor(event: NormalizedExecutionEvent): string {
  return `${event.sourceProvider}:${event.providerEventId}`;
}

export interface DedupeResult {
  /** True when this event was seen before and must NOT be applied again. */
  duplicate: boolean;
  state: DedupeState;
}

/**
 * Check an event against the seen-set and record it. Returns the same state
 * object when the event is a duplicate (nothing changed).
 */
export function deduplicateExecution(
  state: DedupeState,
  event: NormalizedExecutionEvent,
): DedupeResult {
  const key = dedupeKeyFor(event);
  if (state.seenKeys[key]) {
    return { duplicate: true, state };
  }
  return {
    duplicate: false,
    state: { seenKeys: { ...state.seenKeys, [key]: true } },
  };
}
