/**
 * battleScript — the provider-agnostic contract between the battle engine
 * and whatever supplies a battle's timeline.
 *
 * The engine orchestrates a battle from a `BattleScript`: a price tape plus
 * raw provider execution events for both participants. It does NOT care who
 * produced the script. The demo registers the mock provider's script source
 * as the default ("mock"); a live deployment registers a source that builds
 * the same shape from a real provider's quote + execution streams and the
 * engine is none the wiser.
 *
 * PLUG-IN POINT FOR REAL INTEGRATIONS: implement `BattleScriptSource` over a
 * live transport (NinjaTrader/Tradovate/Rithmic adapters + market data),
 * call `registerBattleScriptSource(...)`, and pass it (or its id) to
 * `createBattleState`. Serialized battle states carry only the source id, so
 * snapshots stay JSON round-trippable.
 *
 * No I/O, no framework imports; the registry is a tiny in-memory map.
 */

import type { BattleType, BattleWindow, Market } from "@/lib/data/schema";
import type { RawExecutionRecord } from "@/lib/integrations/types";
import type { BattleRiskLimits } from "@/lib/scoring/calculateBattleScore";

export type BattleParticipantKey = "demo" | "opponent";

export interface BattleScriptParticipant {
  key: BattleParticipantKey;
  userId: string;
  displayName: string;
  firmName: string;
  rating: number;
  /** Provider-scoped account id. */
  accountId: string;
  accountLabel: string;
  limits: BattleRiskLimits;
  severeDrawdownThreshold: number;
}

export interface BattlePricePoint {
  minute: number;
  timestampMs: number;
  price: number;
}

export type BattleScriptTimelineItem =
  | { kind: "PRICE"; timestampMs: number; price: number }
  | {
      kind: "EXECUTION";
      timestampMs: number;
      participantKey: BattleParticipantKey;
      record: RawExecutionRecord;
    };

export interface BattleScript {
  /** Script identifier within its source (demo: the scenario id). */
  scenarioId: string;
  battleId: string;
  market: Market;
  battleType: BattleType;
  battleWindow: BattleWindow;
  startTimestampMs: number;
  durationMs: number;
  participants: readonly [BattleScriptParticipant, BattleScriptParticipant];
  pricePath: BattlePricePoint[];
  timeline: BattleScriptTimelineItem[];
  expectedWinnerUserId: string;
}

/** A named supplier of battle scripts (mock today, live transport later). */
export interface BattleScriptSource {
  /** Stable id persisted in engine snapshots (e.g. "mock"). */
  id: string;
  /** Must be deterministic per scriptId for replay/resume to work. */
  getScript(scriptId: string): BattleScript;
}

const registry = new Map<string, BattleScriptSource>();

export function registerBattleScriptSource(source: BattleScriptSource): void {
  registry.set(source.id, source);
}

export function getBattleScriptSource(id: string): BattleScriptSource {
  const source = registry.get(id);
  if (!source) {
    throw new Error(
      `battle script source "${id}" is not registered — call registerBattleScriptSource() first`,
    );
  }
  return source;
}
