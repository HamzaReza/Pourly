/**
 * Pure reducers behind the progress store actions. Each takes the current state and returns the
 * next one (or null when the action cannot apply), so the rules are unit-testable without the
 * store or storage.
 */
import type { RewardBundle } from '@/config/economy';

import type { ProgressState, StarCount } from './progressModel';

export interface CompleteLevelInput {
  readonly level: number;
  readonly stars: StarCount;
  /** Coins already computed by `winReward`. */
  readonly coins: number;
}

const bestStars = (current: StarCount | undefined, stars: StarCount): StarCount =>
  current === undefined || stars > current ? stars : current;

const wholeNonNegative = (value: number | undefined): number =>
  value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, Math.floor(value));

/**
 * A finished level: best stars kept, `level` advanced past it (replays never move it back),
 * coins granted, the 3★ streak (review prompt) updated and the interstitial counter bumped.
 */
export const applyCompleteLevel = (
  state: ProgressState,
  { level, stars, coins }: CompleteLevelInput,
  now: number,
): ProgressState => ({
  ...state,
  stars: { ...state.stars, [level]: bestStars(state.stars[level], stars) },
  level: Math.max(state.level, level + 1),
  coins: state.coins + wholeNonNegative(coins),
  review: {
    ...state.review,
    threeStarStreak: stars === 3 ? state.review.threeStarStreak + 1 : 0,
  },
  ads: { ...state.ads, levelsSinceInterstitial: state.ads.levelsSinceInterstitial + 1 },
  updatedAt: now,
});

/**
 * A level skipped with the SKIP_LEVEL ad: completed with 1★ unless better stars exist, no coins.
 * It breaks the 3★ streak and does not count toward the interstitial cadence (stuck flow).
 */
export const applySkipLevel = (
  state: ProgressState,
  level: number,
  now: number,
): ProgressState => ({
  ...state,
  stars: { ...state.stars, [level]: state.stars[level] ?? 1 },
  level: Math.max(state.level, level + 1),
  review: { ...state.review, threeStarStreak: 0 },
  updatedAt: now,
});

/** Spends coins; null when the balance is too low or the amount is invalid. */
export const applySpendCoins = (
  state: ProgressState,
  amount: number,
  now: number,
): ProgressState | null => {
  if (!Number.isInteger(amount) || amount < 0 || state.coins < amount) return null;
  return { ...state, coins: state.coins - amount, updatedAt: now };
};

/** Adds every field of a reward bundle (negative or fractional values are ignored). */
export const applyGrant = (
  state: ProgressState,
  bundle: RewardBundle,
  now: number,
): ProgressState => ({
  ...state,
  coins: state.coins + wholeNonNegative(bundle.coins),
  hints: state.hints + wholeNonNegative(bundle.hints),
  undos: state.undos + wholeNonNegative(bundle.undos),
  extraTubes: state.extraTubes + wholeNonNegative(bundle.extraTubes),
  updatedAt: now,
});

export type ConsumableItem = 'hints' | 'undos' | 'extraTubes';

/** Uses one inventory item; null when none is left. */
export const applyConsume = (
  state: ProgressState,
  item: ConsumableItem,
  now: number,
): ProgressState | null => {
  if (state[item] <= 0) return null;
  return { ...state, [item]: state[item] - 1, updatedAt: now };
};

export const applyMarkTutorialDone = (state: ProgressState, now: number): ProgressState =>
  state.tutorialDone ? state : { ...state, tutorialDone: true, updatedAt: now };

/** Records an earned rewarded ad (interstitial spacing, spec §13). */
export const applyRewardedShown = (state: ProgressState, now: number): ProgressState => ({
  ...state,
  ads: { ...state.ads, lastRewardedAt: now },
  updatedAt: now,
});
