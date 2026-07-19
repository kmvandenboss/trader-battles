/**
 * Seeded pseudo-random number generator (mulberry32) + helpers.
 *
 * HARD RULE (CLAUDE.md): no unseeded randomness anywhere in the demo. All
 * seed authoring and simulation must flow through a SeededRng so the same
 * scenario replays identically every run.
 */

export type SeededRng = () => number;

/** mulberry32 — small, fast, deterministic 32-bit PRNG. */
export function mulberry32(seed: number): SeededRng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive. */
export function randInt(rng: SeededRng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Float in [min, max), rounded to `decimals`. */
export function randFloat(
  rng: SeededRng,
  min: number,
  max: number,
  decimals = 2,
): number {
  const value = min + rng() * (max - min);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function pick<T>(rng: SeededRng, items: readonly T[]): T {
  if (items.length === 0) throw new Error("pick: empty array");
  return items[Math.floor(rng() * items.length)];
}

export function chance(rng: SeededRng, probability: number): boolean {
  return rng() < probability;
}

/** Deterministic Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(rng: SeededRng, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
