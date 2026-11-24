import { PALETTE_SIZE } from '@/config/game';

import { fallbackConfig, getLevelConfig } from './difficulty';
import { decodeLevel } from './levelCodec';
import { LEVELS } from './levels.generated';
import { createRng, hashString, shuffle, type Rng } from './rng';
import { isUniform } from './rules';
import {
  GENERATION_NODE_CAP,
  HINT_NODE_CAP,
  IMPROVE_NODE_BUDGET,
  improveWork,
  solveWork,
} from './solver';
import { createTask, runWork, type Task, type Work } from './task';
import type { Board, Level, LevelConfig, Segment, Tube } from './types';

/** Attempts per config (`seed`, `seed + 1`, …) before falling back. */
export const MAX_ATTEMPTS = 50;

export interface GenerateOptions {
  /** Level id; defaults to `level-<config.level>`. */
  readonly id?: string;
  readonly nodeCap?: number;
  readonly improveBudget?: number;
}

export interface GenerationStats {
  /** Candidates built, across the base and fallback configs. */
  readonly attempts: number;
  readonly fallback: boolean;
  /** Largest node count of a single solver or improve run. */
  readonly maxNodes: number;
}

export interface GeneratedLevel {
  readonly level: Level;
  readonly stats: GenerationStats;
}

const assertConfig = (config: LevelConfig): void => {
  if (!Number.isInteger(config.colors) || config.colors < 1 || config.colors > PALETTE_SIZE) {
    throw new Error(`colors must be 1..${PALETTE_SIZE}, got ${config.colors}`);
  }
  if (!Number.isInteger(config.emptyTubes) || config.emptyTubes < 0) {
    throw new Error(`emptyTubes must be a non-negative integer, got ${config.emptyTubes}`);
  }
  if (!Number.isInteger(config.capacity) || config.capacity < 2) {
    throw new Error(`capacity must be an integer >= 2, got ${config.capacity}`);
  }
  if (!(config.hiddenRatio >= 0 && config.hiddenRatio <= 1)) {
    throw new Error(`hiddenRatio must be within 0..1, got ${config.hiddenRatio}`);
  }
};

/**
 * Boards with at most this many empty tubes use the paired-top deal: a uniform shuffle with a
 * single empty tube is solvable well under 2% of the time from 8 colors up (see DECISIONS.md).
 */
export const PAIRED_TOP_MAX_EMPTY_TUBES = 1;

const usesPairedTops = (config: LevelConfig): boolean =>
  config.emptyTubes <= PAIRED_TOP_MAX_EMPTY_TUBES && config.capacity >= 3;

/**
 * Colors of every tube, bottom first. Standard deal (spec §7.2): every segment shuffled into
 * `colors` full tubes. Paired-top deal: each tube is topped by a same-colored pair (one pair per
 * color, assigned in shuffled order) over a shuffle of all remaining segments.
 */
const dealColors = (config: LevelConfig, palette: readonly number[], rng: Rng): number[][] => {
  const capacity = config.capacity;
  const pairs = usesPairedTops(config) ? shuffle(rng, palette) : [];
  const perColor = pairs.length > 0 ? capacity - 2 : capacity;
  const pool: number[] = [];
  for (const color of palette) {
    for (let i = 0; i < perColor; i += 1) pool.push(color);
  }
  const dealt = shuffle(rng, pool);
  const tubes: number[][] = [];
  for (let tube = 0; tube < config.colors; tube += 1) {
    const colors = dealt.slice(tube * perColor, (tube + 1) * perColor);
    const pair = pairs[tube];
    if (pair !== undefined) colors.push(pair, pair);
    tubes.push(colors);
  }
  return tubes;
};

/**
 * Spec §7.2 candidate: pick the palette colors, deal every segment into `colors` full tubes, hide
 * `round(hiddenRatio × eligible slots)` segments, then append the empty tubes. Eligible slots are
 * all non-top slots (standard deal) or the slots below the top pair (paired-top deal), so a
 * segment on top is never hidden.
 */
export const buildCandidate = (config: LevelConfig, seed: number): Board => {
  const rng = createRng(seed);
  const capacity = config.capacity;
  const palette = shuffle(
    rng,
    Array.from({ length: PALETTE_SIZE }, (_, index) => index),
  ).slice(0, config.colors);
  const dealt = dealColors(config, palette, rng);

  const shownFromTop = usesPairedTops(config) ? 2 : 1;
  const slots: number[] = [];
  for (let tube = 0; tube < config.colors; tube += 1) {
    for (let index = 0; index < capacity - shownFromTop; index += 1) {
      slots.push(tube * capacity + index);
    }
  }
  const permille = Math.round(config.hiddenRatio * 1000);
  const hiddenCount = Math.floor((permille * slots.length + 500) / 1000);
  const hidden = new Set(shuffle(rng, slots).slice(0, hiddenCount));

  const tubes: Tube[] = dealt.map((colors, tube) =>
    colors.map((color, index): Segment => ({
      color,
      hidden: hidden.has(tube * capacity + index),
    })),
  );
  for (let i = 0; i < config.emptyTubes; i += 1) tubes.push([]);
  return { tubes, capacity };
};

/** A full tube of one true color would start complete (or one reveal away from it). */
const hasCompleteTube = (board: Board): boolean =>
  board.tubes.some((tube) => tube.length === board.capacity && isUniform(tube));

interface Validation {
  readonly par: number | null;
  readonly maxNodes: number;
}

/**
 * Solver validation: no complete tube at the start, solvable within the node cap, the first
 * solution found within `HINT_NODE_CAP` nodes (so a hint on the opening position always
 * succeeds), and the best solution found (par) at least `minSolutionLength` pours long.
 */
function* validateWork(
  board: Board,
  config: LevelConfig,
  nodeCap: number,
  improveBudget: number,
): Work<Validation> {
  if (hasCompleteTube(board)) return { par: null, maxNodes: 0 };
  const solved = yield* solveWork(board, { nodeCap });
  const hintable = solved.nodes <= Math.min(nodeCap, HINT_NODE_CAP);
  if (!solved.solvable || !hintable || solved.moves.length < config.minSolutionLength) {
    return { par: null, maxNodes: solved.nodes };
  }
  const improved = yield* improveWork(board, solved.moves, improveBudget);
  const maxNodes = Math.max(solved.nodes, improved.nodes);
  const par = improved.moves.length;
  return { par: par >= config.minSolutionLength ? par : null, maxNodes };
}

/** Cooperative form of `generateLevelWithStats`. */
export function* generateWork(
  config: LevelConfig,
  seed: number,
  options: GenerateOptions = {},
): Work<GeneratedLevel> {
  assertConfig(config);
  const nodeCap = options.nodeCap ?? GENERATION_NODE_CAP;
  const improveBudget = options.improveBudget ?? IMPROVE_NODE_BUDGET;
  const id = options.id ?? `level-${config.level}`;
  let attempts = 0;
  let maxNodes = 0;
  for (const candidateConfig of [config, fallbackConfig(config)]) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const candidateSeed = (seed + attempt) >>> 0;
      const board = buildCandidate(candidateConfig, candidateSeed);
      attempts += 1;
      yield;
      const validation = yield* validateWork(board, candidateConfig, nodeCap, improveBudget);
      maxNodes = Math.max(maxNodes, validation.maxNodes);
      if (validation.par !== null) {
        return {
          level: { id, seed: candidateSeed, config: candidateConfig, board, par: validation.par },
          stats: { attempts, fallback: candidateConfig.fallback, maxNodes },
        };
      }
    }
  }
  throw new Error(`No valid level for ${id} (seed ${seed}) after ${attempts} attempts`);
}

/** Generates and validates a level, also returning generation statistics. */
export const generateLevelWithStats = (
  config: LevelConfig,
  seed: number,
  options: GenerateOptions = {},
): GeneratedLevel => runWork(generateWork(config, seed, options));

/**
 * Generates a validated level (spec §7.2). Deterministic: the same config and seed always give
 * the same level. Throws if neither the config nor its fallback yields a valid level.
 */
export const generateLevel = (
  config: LevelConfig,
  seed: number,
  options: GenerateOptions = {},
): Level => generateLevelWithStats(config, seed, options).level;

/** Time-sliceable generation, for building runtime levels during idle time. */
export const createGenerateTask = (
  config: LevelConfig,
  seed: number,
  options: GenerateOptions = {},
): Task<Level> =>
  createTask(
    (function* levelOnly(): Work<Level> {
      const generated = yield* generateWork(config, seed, options);
      return generated.level;
    })(),
  );

/** Deterministic base seed of a numbered level. */
export const levelSeed = (level: number): number => hashString(`pourly:level:${level}`);

/** Levels shipped precomputed in `levels.generated.ts`. */
export const PRECOMPUTED_LEVEL_COUNT = LEVELS.length;

const decodedLevels = new Map<number, Level>();
const RUNTIME_CACHE_SIZE = 4;
const runtimeLevels = new Map<number, Level>();

const rememberRuntime = (level: number, value: Level): Level => {
  runtimeLevels.set(level, value);
  const oldest = runtimeLevels.keys().next();
  if (runtimeLevels.size > RUNTIME_CACHE_SIZE && oldest.done !== true) {
    runtimeLevels.delete(oldest.value);
  }
  return value;
};

const precomputedLevel = (level: number): Level | null => {
  const cached = decodedLevels.get(level);
  if (cached !== undefined) return cached;
  const encoded = LEVELS[level - 1];
  if (encoded === undefined) return null;
  const decoded = decodeLevel(encoded);
  decodedLevels.set(level, decoded);
  return decoded;
};

/** Cooperative form of `getLevel`: done immediately for precomputed or cached levels. */
export const createLevelTask = (level: number): Task<Level> => {
  const ready = precomputedLevel(level) ?? runtimeLevels.get(level);
  if (ready !== undefined) {
    return createTask(
      (function* readyLevel(): Work<Level> {
        return ready;
      })(),
    );
  }
  return createTask(
    (function* runtimeLevel(): Work<Level> {
      const generated = yield* generateWork(getLevelConfig(level), levelSeed(level));
      return rememberRuntime(level, generated.level);
    })(),
  );
};

/**
 * Level `level` (1-based): decoded lazily from the precomputed table for 1..300, generated
 * synchronously above that (the most recent few are cached).
 */
export const getLevel = (level: number): Level => {
  const precomputed = precomputedLevel(level);
  if (precomputed !== null) return precomputed;
  const cached = runtimeLevels.get(level);
  if (cached !== undefined) return cached;
  return rememberRuntime(level, generateLevel(getLevelConfig(level), levelSeed(level)));
};
