/**
 * Review-narrative derivation — turns an already-computed final battle result
 * into human-readable "why you won / lost" bullets, a component-edge summary,
 * and a short coaching paragraph for the standalone result + review screens.
 *
 * IMPORTANT (Rule 4 — scoring stays server-side and isolated):
 *   This module computes NO authoritative scores. It only COMPARES scores and
 *   metrics that lib/scoring already produced (persisted here as a final
 *   BattleMetricSnapshot) and renders sentences from them. It lives in lib/ —
 *   not in a React component — so the UI never reconstructs score-comparison
 *   logic. It is a pure, testable projection mirroring the battle engine's
 *   buildReasons() tone (see lib/battles/battleEngine.ts).
 *
 * No gambling language, no profitability claims: coaching copy frames outcomes
 * as competitive skill (discipline, risk efficiency, consistency), never money
 * to be made.
 */

import type { BattleMetricSnapshot } from "@/lib/data/schema";

/** One participant's already-computed final numbers. */
export interface ParticipantNarrativeInput {
  displayName: string;
  won: boolean;
  /** The end-of-battle authoritative snapshot (isFinal === true). */
  metrics: BattleMetricSnapshot;
}

export type ComponentKey =
  | "performance"
  | "riskEfficiency"
  | "discipline"
  | "consistency";

export interface ComponentEdge {
  key: ComponentKey;
  label: string;
  self: number;
  other: number;
  /** self - other, rounded to one decimal. */
  delta: number;
  favored: "self" | "other" | "even";
}

export interface ReviewNarrative {
  /** "Why you won / lost" bullets, most decisive first (max 5). */
  reasons: string[];
  /** Per-component comparison rows (self vs other). */
  componentEdges: ComponentEdge[];
  /** 2–3 sentence coaching summary framed as competitive improvement. */
  coaching: string;
}

const COMPONENTS: Array<{
  key: ComponentKey;
  label: string;
  field: keyof BattleMetricSnapshot;
}> = [
  { key: "performance", label: "Performance", field: "performanceScore" },
  { key: "riskEfficiency", label: "Risk efficiency", field: "riskEfficiencyScore" },
  { key: "discipline", label: "Discipline", field: "disciplineScore" },
  { key: "consistency", label: "Consistency", field: "consistencyScore" },
];

/** "$1,013" (unsigned magnitude). */
function fmtUsd(value: number): string {
  return `$${Math.abs(Math.round(value)).toLocaleString("en-US")}`;
}

/** "+$1,013" / "-$704" / "$0". */
function fmtSignedUsd(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "$0";
  return `${rounded > 0 ? "+" : "-"}${fmtUsd(rounded)}`;
}

function componentValue(
  metrics: BattleMetricSnapshot,
  field: keyof BattleMetricSnapshot,
): number {
  return metrics[field] as number;
}

/** Build the per-component comparison rows (self vs other). */
export function buildComponentEdges(
  self: BattleMetricSnapshot,
  other: BattleMetricSnapshot,
): ComponentEdge[] {
  return COMPONENTS.map(({ key, label, field }) => {
    const selfValue = componentValue(self, field);
    const otherValue = componentValue(other, field);
    const delta = Math.round((selfValue - otherValue) * 10) / 10;
    return {
      key,
      label,
      self: selfValue,
      other: otherValue,
      delta,
      favored: delta > 0.05 ? "self" : delta < -0.05 ? "other" : "even",
    };
  });
}

/**
 * Derive the full review narrative from two already-scored participants.
 * `self` is the perspective the copy is written for (the demo user).
 */
export function deriveReviewNarrative(
  self: ParticipantNarrativeInput,
  other: ParticipantNarrativeInput,
): ReviewNarrative {
  const reasons: string[] = [];
  const s = self.metrics;
  const o = other.metrics;
  const won = self.won;

  // Normalized-scoring headline: won with less raw P&L, or lost despite more.
  if (won && o.netPnl > s.netPnl) {
    reasons.push(
      `Won with less raw P&L (${fmtSignedUsd(s.netPnl)} vs ${fmtSignedUsd(o.netPnl)}) — normalized scoring rewarded efficiency over gross dollars.`,
    );
  }
  if (!won && s.netPnl > o.netPnl) {
    reasons.push(
      `Out-earned the opponent on net P&L (${fmtSignedUsd(s.netPnl)} vs ${fmtSignedUsd(o.netPnl)}) but gave the edge back through drawdown and risk.`,
    );
  }

  // Drawdown / risk utilization.
  if (Math.round(s.maximumDrawdown) !== Math.round(o.maximumDrawdown)) {
    reasons.push(
      `Max drawdown ${fmtUsd(s.maximumDrawdown)} (${Math.round(s.riskUtilization * 100)}% of permitted risk) vs opponent's ${fmtUsd(o.maximumDrawdown)}.`,
    );
  }

  // Component gaps that went the winner's way (>= 5 points, same direction).
  const edges = buildComponentEdges(s, o);
  for (const edge of edges) {
    if (Math.abs(edge.delta) >= 5 && edge.delta > 0 === won) {
      reasons.push(
        `${edge.label}: ${edge.self.toFixed(1)} vs ${edge.other.toFixed(1)}.`,
      );
    }
  }

  const trimmedReasons = reasons.slice(0, 5);

  return {
    reasons: trimmedReasons,
    componentEdges: edges,
    coaching: buildCoaching(self, other, edges),
  };
}

/**
 * Short coaching paragraph: lead with the trader's strongest edge, name the
 * biggest growth area, and close on the normalized-scoring takeaway. Framed as
 * competitive skill — never as money to be made.
 */
function buildCoaching(
  self: ParticipantNarrativeInput,
  other: ParticipantNarrativeInput,
  edges: ComponentEdge[],
): string {
  const name = self.displayName;
  const strongest = [...edges].sort((a, b) => b.self - a.self)[0];
  const weakest = [...edges].sort((a, b) => a.self - b.self)[0];
  const biggestGap = [...edges].sort((a, b) => a.delta - b.delta)[0]; // most negative

  const parts: string[] = [];

  if (self.won) {
    parts.push(
      `${name} controlled this battle on ${strongest.label.toLowerCase()} (${strongest.self.toFixed(0)}/100), holding a tighter risk profile than ${other.displayName} across the session.`,
    );
  } else {
    parts.push(
      `${name}'s ${strongest.label.toLowerCase()} (${strongest.self.toFixed(0)}/100) was the bright spot, but ${other.displayName} edged ahead where it counted on the normalized scorecard.`,
    );
  }

  // Growth area: the lowest own component, or the widest deficit vs opponent.
  const focus =
    biggestGap.favored === "other" && biggestGap.delta < -3
      ? biggestGap
      : weakest;
  parts.push(
    `The clearest area to build on is ${focus.label.toLowerCase()} (${focus.self.toFixed(0)}/100)${
      focus.favored === "other"
        ? `, where the opponent scored ${focus.other.toFixed(0)}`
        : ""
    } — small gains there move the total score the most.`,
  );

  parts.push(
    "Remember the scoring model rewards disciplined, risk-efficient trading over raw dollars, so consistency compounds your rating faster than chasing size.",
  );

  return parts.join(" ");
}
