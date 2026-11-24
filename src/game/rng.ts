/**
 * Deterministic pseudo-random numbers. Only 32-bit integer math (`Math.imul`, shifts) and exact
 * IEEE-754 divisions are used, so every JS engine produces the same sequence for a seed.
 */

const UINT32_RANGE = 4_294_967_296;

export interface Rng {
  /** Next unsigned 32-bit integer. */
  nextUint32(): number;
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Integer in [min, max] (both inclusive). */
  range(min: number, max: number): number;
}

/** mulberry32 seeded PRNG. */
export const createRng = (seed: number): Rng => {
  let state = seed >>> 0;
  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
  const next = (): number => nextUint32() / UINT32_RANGE;
  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error(`rng.int needs a positive integer, got ${maxExclusive}`);
    }
    return Math.floor(next() * maxExclusive);
  };
  const range = (min: number, max: number): number => min + int(max - min + 1);
  return { nextUint32, next, int, range };
};

/** FNV-1a 32-bit hash of a string's UTF-16 code units. */
export const hashString = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

/** Fisher–Yates shuffle into a new array; the input is not modified. */
export const shuffle = <T>(rng: Rng, items: readonly T[]): T[] => {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    const a = result[i] as T;
    result[i] = result[j] as T;
    result[j] = a;
  }
  return result;
};
