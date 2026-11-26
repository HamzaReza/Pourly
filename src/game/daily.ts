import { CAPACITY } from '@/config/game';
import type { ProgressState } from '@/state/progressModel';
import { daysBetween } from '@/utils/date';

import { bandFor } from './difficulty';
import { createGenerateTask, generateLevel } from './generator';
import { createRng, hashString } from './rng';
import type { Task } from './task';
import type { Level, LevelConfig } from './types';

/** Constant salt so daily seeds never coincide with numbered-level seeds. */
export const DAILY_SALT = 'pourly:daily:v1';
export const DAILY_MIN_COLORS = 8;
export const DAILY_MAX_COLORS = 10;
export const DAILY_EMPTY_TUBES = 2;
export const DAILY_HIDDEN_RATIO = 0.25;
/** Daily boards use the minimum solution length of the band that introduces mystery segments. */
const DAILY_BAND_LEVEL = 25;

const assertLocalDate = (localDate: string): void => {
  if (Number.isNaN(daysBetween(localDate, localDate))) {
    throw new Error(`Expected a local date as YYYY-MM-DD, got "${localDate}"`);
  }
};

/** Seed of the daily board: FNV-1a of the salt and the player's local date. */
export const dailySeed = (localDate: string): number => {
  assertLocalDate(localDate);
  return hashString(`${DAILY_SALT}:${localDate}`);
};

export const dailyLevelId = (localDate: string): string => `daily-${localDate}`;

const DAILY_ID = /^daily-(\d{4}-\d{2}-\d{2})$/;

/** The local date of a daily level id (`daily-YYYY-MM-DD`), or null for any other id. */
export const dailyDateOf = (levelId: string): string | null => {
  const match = DAILY_ID.exec(levelId);
  const date = match?.[1];
  if (date === undefined || Number.isNaN(daysBetween(date, date))) return null;
  return date;
};

/** True when the daily of `today` has been completed (its reward already granted). */
export const isDailyDone = (
  state: Pick<ProgressState, 'lastDailyDate' | 'dailyHistory'>,
  today: string,
): boolean => state.lastDailyDate === today || state.dailyHistory[today] !== undefined;

/** Mid-high difficulty: 8–10 colors (picked by the date's seed), mystery on, 2 empty tubes. */
export const dailyConfig = (localDate: string): LevelConfig => {
  const rng = createRng(dailySeed(localDate));
  return {
    level: 0,
    colors: rng.range(DAILY_MIN_COLORS, DAILY_MAX_COLORS),
    emptyTubes: DAILY_EMPTY_TUBES,
    hiddenRatio: DAILY_HIDDEN_RATIO,
    hard: false,
    capacity: CAPACITY,
    minSolutionLength: bandFor(DAILY_BAND_LEVEL).minSolutionLength,
    fallback: false,
  };
};

/** The daily challenge board for a local date; identical on every device. */
export const generateDaily = (localDate: string): Level =>
  generateLevel(dailyConfig(localDate), dailySeed(localDate), { id: dailyLevelId(localDate) });

/** Time-sliceable `generateDaily`, to build the board off the critical path. */
export const createDailyTask = (localDate: string): Task<Level> =>
  createGenerateTask(dailyConfig(localDate), dailySeed(localDate), { id: dailyLevelId(localDate) });

export type StreakFields = Pick<ProgressState, 'streak' | 'bestStreak' | 'lastDailyDate'>;

export type StreakState = StreakFields & Pick<ProgressState, 'lastSeenAt'>;

export interface DailyCompletionInput {
  /** Player's local date, `YYYY-MM-DD`. */
  readonly today: string;
  /** Current epoch ms. */
  readonly now: number;
}

export type DailyCompletionOutcome =
  'first' | 'consecutive' | 'reset' | 'sameDay' | 'clockRollback';

export interface DailyCompletionResult {
  readonly state: StreakFields;
  /** The daily reward may be granted (once per calendar day). */
  readonly rewardGranted: boolean;
  readonly outcome: DailyCompletionOutcome;
}

const unchanged = (state: StreakState, outcome: DailyCompletionOutcome): DailyCompletionResult => ({
  state: {
    streak: state.streak,
    bestStreak: state.bestStreak,
    lastDailyDate: state.lastDailyDate,
  },
  rewardGranted: false,
  outcome,
});

/**
 * Streak update when the daily challenge of `today` is completed.
 * - Same day again: no reward, nothing changes.
 * - Next day: streak + 1. First ever, or an unreadable last date: streak 1.
 * - Otherwise (a day or more missed): streak restarts at 1. There is no streak freeze, for VIP
 *   either (P12.8).
 * - Clock rollback (`now < lastSeenAt`, or `today` before `lastDailyDate`): nothing granted, state
 *   kept.
 */
export const applyDailyCompletion = (
  state: StreakState,
  input: DailyCompletionInput,
): DailyCompletionResult => {
  assertLocalDate(input.today);
  if (input.now < state.lastSeenAt) return unchanged(state, 'clockRollback');

  const gap =
    state.lastDailyDate === null ? Number.NaN : daysBetween(state.lastDailyDate, input.today);
  if (gap < 0) return unchanged(state, 'clockRollback');
  if (gap === 0) return unchanged(state, 'sameDay');

  let streak = 1;
  let outcome: DailyCompletionOutcome = 'reset';
  if (Number.isNaN(gap)) {
    outcome = 'first';
  } else if (gap === 1) {
    streak = state.streak + 1;
    outcome = 'consecutive';
  }
  return {
    state: {
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      lastDailyDate: input.today,
    },
    rewardGranted: true,
    outcome,
  };
};

/**
 * Streak to display on `today`: the stored streak while it is still alive (completed today or
 * yesterday), otherwise 0. A clock rollback (`today` before the last daily) keeps the stored value.
 */
export const currentStreak = (state: StreakFields, today: string): number => {
  assertLocalDate(today);
  if (state.lastDailyDate === null) return 0;
  const gap = daysBetween(state.lastDailyDate, today);
  if (Number.isNaN(gap)) return 0;
  if (gap <= 1) return state.streak;
  return 0;
};
