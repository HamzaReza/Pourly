import { CAPACITY, MAX_TUBES } from '@/config/game';

import type { LevelConfig } from './types';

export interface DifficultyBand {
  readonly first: number;
  /** Last level of the ramp. The final band keeps its top values after it. */
  readonly last: number;
  readonly minColors: number;
  readonly maxColors: number;
  /** Hidden ratio in permille at the start and end of the band. */
  readonly hiddenFrom: number;
  readonly hiddenTo: number;
  readonly minSolutionLength: number;
}

/** Spec §7.3. The 151+ band ramps until level 300 and then stays at its maximum. */
export const DIFFICULTY_BANDS: readonly DifficultyBand[] = [
  {
    first: 1,
    last: 3,
    minColors: 3,
    maxColors: 3,
    hiddenFrom: 0,
    hiddenTo: 0,
    minSolutionLength: 4,
  },
  {
    first: 4,
    last: 10,
    minColors: 4,
    maxColors: 5,
    hiddenFrom: 0,
    hiddenTo: 0,
    minSolutionLength: 6,
  },
  {
    first: 11,
    last: 24,
    minColors: 6,
    maxColors: 8,
    hiddenFrom: 0,
    hiddenTo: 0,
    minSolutionLength: 10,
  },
  {
    first: 25,
    last: 60,
    minColors: 8,
    maxColors: 10,
    hiddenFrom: 100,
    hiddenTo: 300,
    minSolutionLength: 14,
  },
  {
    first: 61,
    last: 150,
    minColors: 10,
    maxColors: 12,
    hiddenFrom: 200,
    hiddenTo: 350,
    minSolutionLength: 18,
  },
  {
    first: 151,
    last: 300,
    minColors: 12,
    maxColors: 14,
    hiddenFrom: 300,
    hiddenTo: 400,
    minSolutionLength: 22,
  },
];

export const DEFAULT_EMPTY_TUBES = 2;
export const HARD_EMPTY_TUBES = 1;
export const HARD_LEVEL_INTERVAL = 10;

export const bandFor = (level: number): DifficultyBand => {
  const band = DIFFICULTY_BANDS.find((entry) => level <= entry.last);
  return band ?? (DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1] as DifficultyBand);
};

export const isHardLevel = (level: number): boolean => level % HARD_LEVEL_INTERVAL === 0;

/**
 * Colors step evenly through `minColors..maxColors` across the band, so each value covers an
 * equal share of its levels (integer math only).
 */
const rampColors = (band: DifficultyBand, level: number): number => {
  const span = band.last - band.first + 1;
  const offset = Math.min(level, band.last) - band.first;
  const steps = band.maxColors - band.minColors + 1;
  return band.minColors + Math.floor((offset * steps) / span);
};

/** Linear permille ramp from `hiddenFrom` at the first level to `hiddenTo` at the last. */
const rampHiddenPermille = (band: DifficultyBand, level: number): number => {
  if (band.last === band.first) return band.hiddenTo;
  const offset = Math.min(level, band.last) - band.first;
  const span = band.last - band.first;
  return band.hiddenFrom + Math.floor(((band.hiddenTo - band.hiddenFrom) * offset) / span);
};

/** Difficulty settings for a level number (1-based). */
export const getLevelConfig = (level: number): LevelConfig => {
  if (!Number.isInteger(level) || level < 1) {
    throw new Error(`Level must be a positive integer, got ${level}`);
  }
  const band = bandFor(level);
  const hard = isHardLevel(level);
  const emptyTubes = hard ? HARD_EMPTY_TUBES : DEFAULT_EMPTY_TUBES;
  const colors = Math.min(rampColors(band, level), MAX_TUBES - emptyTubes);
  return {
    level,
    colors,
    emptyTubes,
    hiddenRatio: rampHiddenPermille(band, level) / 1000,
    hard,
    capacity: CAPACITY,
    minSolutionLength: band.minSolutionLength,
    fallback: false,
  };
};

/**
 * Conservative config used after 50 failed attempts: one extra empty tube. When that would exceed
 * `MAX_TUBES`, one color is dropped instead of adding the tube.
 */
export const fallbackConfig = (config: LevelConfig): LevelConfig => {
  const emptyTubes = config.emptyTubes + 1;
  const colors = Math.min(config.colors, MAX_TUBES - emptyTubes);
  return { ...config, emptyTubes, colors, fallback: true };
};
