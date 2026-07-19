/**
 * Small pure math/formatting helpers shared by the scoring components.
 * No I/O, no framework imports.
 */

import type { ScoreFactor } from "./types";

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Round to 2 decimals (scores are displayed to at most 1–2 decimals). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** "$1,234" / "-$56" — for human-readable factor details. */
export function fmtUsd(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

export function fmtPct(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}

interface FactorDef {
  key: string;
  label: string;
  /** Raw (un-normalized) weight from config. */
  weight: number;
  /** 0–100 (will be clamped). */
  score: number;
  detail: string;
}

/**
 * Normalize factor weights to sum to 1, clamp each score to 0–100, and
 * compute the weighted component score.
 */
export function combineFactors(defs: FactorDef[]): {
  score: number;
  factors: ScoreFactor[];
} {
  const totalWeight = defs.reduce((sum, d) => sum + d.weight, 0);
  if (!(totalWeight > 0)) {
    throw new Error("Scoring config error: factor weights must sum to > 0");
  }
  const factors: ScoreFactor[] = defs.map((d) => ({
    key: d.key,
    label: d.label,
    score: round2(clamp(d.score, 0, 100)),
    weight: d.weight / totalWeight,
    detail: d.detail,
  }));
  const score = round2(
    clamp(
      factors.reduce((sum, f) => sum + f.score * f.weight, 0),
      0,
      100,
    ),
  );
  return { score, factors };
}

/** Population standard deviation; 0 for fewer than 2 values. */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
