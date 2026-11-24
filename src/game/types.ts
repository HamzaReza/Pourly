/** One unit of liquid. `color` indexes the palette (0..13). */
export interface Segment {
  readonly color: number;
  /** A mystery segment drawn as "?" until a pour exposes it. Never true for a tube's top. */
  readonly hidden: boolean;
}

/** Segments from the bottom (index 0) to the top (last index). */
export type Tube = readonly Segment[];

/**
 * Immutable board. Pours return a new board that shares every untouched tube with the old one,
 * so keeping the previous board is an exact, cheap undo snapshot.
 */
export interface Board {
  readonly tubes: readonly Tube[];
  readonly capacity: number;
}

export interface Move {
  readonly from: number;
  readonly to: number;
}

export interface PourResult {
  /** Segments moved from the source to the destination. */
  readonly count: number;
  /** Indices (inside the source tube) of hidden segments that this pour revealed. */
  readonly revealed: readonly number[];
}

export interface PourOutcome {
  readonly board: Board;
  readonly result: PourResult;
}

export interface LevelConfig {
  /** Level number (1-based). 0 for the daily challenge. */
  readonly level: number;
  /** Distinct colors, each filling exactly one tube (`capacity` segments). */
  readonly colors: number;
  readonly emptyTubes: number;
  /** Share (0..1) of non-top segments that start hidden. */
  readonly hiddenRatio: number;
  /** Every 10th level: one empty tube, crown badge, double coins. */
  readonly hard: boolean;
  readonly capacity: number;
  /** The best solution found must be at least this many pours long. */
  readonly minSolutionLength: number;
  /** True when this is the conservative fallback config used after 50 failed attempts. */
  readonly fallback: boolean;
}

export interface Level {
  /** `level-<n>` for numbered levels, `daily-YYYY-MM-DD` for the daily challenge. */
  readonly id: string;
  /** The seed that produced this board (the base seed plus the attempt offset). */
  readonly seed: number;
  readonly config: LevelConfig;
  readonly board: Board;
  /** Shortest solution length found; drives the star thresholds. */
  readonly par: number;
}
