/**
 * Cloud-save snapshot and merge rules (spec §26.4). Pure: no Firebase, no store, no clock.
 *
 * The snapshot is the part of `ProgressState` that follows the player across devices. It never
 * holds entitlements (they come from RevenueCat), ad pacing, notification or review state.
 *
 * `mergeProgress` combines the device copy with the server copy, always in the player's favour:
 *
 * | Field                         | Rule                                                        |
 * | ----------------------------- | ----------------------------------------------------------- |
 * | level                         | highest                                                     |
 * | stars                         | per level, the most stars                                   |
 * | coins, hints, undos, tubes    | remote + (local − baseline), floored at 0; no baseline: max |
 * | streak, bestStreak            | max (bestStreak ≥ streak)                                   |
 * | lastDailyDate                 | the later date                                              |
 * | dailyHistory                  | union (same day: more stars, then fewer moves), last 120    |
 * | giftDayIndex, lastGiftDate    | from the side with the later lastGiftDate (tie: max index)  |
 * | ownedThemes                   | union                                                       |
 * | activeTheme                   | the device's choice                                         |
 * | processedTransactions         | union, latest 200 (device ids last)                         |
 * | starterPackPurchased          | true when either side is                                    |
 *
 * The baseline (`lastSyncedBalances`) is what the server held after the last sync, so a balance
 * earned or spent offline is applied exactly once on top of the server value.
 */
import {
  DEFAULT_THEME_ID,
  MAX_PROCESSED_TRANSACTIONS,
  type Balances,
  type DailyResult,
  type ProgressState,
  type StarCount,
} from '@/state/progressModel';

/** Version of the `users/{uid}` document layout. */
export const CLOUD_SCHEMA_VERSION = 1;
/** Daily results kept in the cloud (most recent days). */
export const MAX_CLOUD_DAILY_HISTORY = 120;
/** Owned themes kept in the cloud (Firestore rules allow 50). */
export const MAX_CLOUD_THEMES = 50;

export interface CloudProgress {
  level: number;
  stars: Record<number, StarCount>;
  coins: number;
  hints: number;
  undos: number;
  extraTubes: number;
  streak: number;
  bestStreak: number;
  lastDailyDate: string | null;
  dailyHistory: Record<string, DailyResult>;
  giftDayIndex: number;
  lastGiftDate: string | null;
  ownedThemes: string[];
  activeTheme: string;
  processedTransactions: string[];
  starterPackPurchased: boolean;
}

export const BALANCE_KEYS = ['coins', 'hints', 'undos', 'extraTubes'] as const;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The newest `max` daily results (date keys sort chronologically). */
const capDailyHistory = (
  history: Readonly<Record<string, DailyResult>>,
  max: number = MAX_CLOUD_DAILY_HISTORY,
): Record<string, DailyResult> => {
  const keys = Object.keys(history).sort().slice(-max);
  const out: Record<string, DailyResult> = {};
  for (const key of keys) {
    const entry = history[key];
    if (entry !== undefined) out[key] = { stars: entry.stars, moves: entry.moves };
  }
  return out;
};

/** The synced part of the local progress, with the cloud size caps applied. */
export const pickCloudProgress = (state: ProgressState): CloudProgress => ({
  level: state.level,
  stars: { ...state.stars },
  coins: state.coins,
  hints: state.hints,
  undos: state.undos,
  extraTubes: state.extraTubes,
  streak: state.streak,
  bestStreak: state.bestStreak,
  lastDailyDate: state.lastDailyDate,
  dailyHistory: capDailyHistory(state.dailyHistory),
  giftDayIndex: state.giftDayIndex,
  lastGiftDate: state.lastGiftDate,
  ownedThemes: state.ownedThemes.slice(0, MAX_CLOUD_THEMES),
  activeTheme: state.activeTheme,
  processedTransactions: state.processedTransactions.slice(-MAX_PROCESSED_TRANSACTIONS),
  starterPackPurchased: state.starterPackPurchased,
});

export const balancesOf = (progress: Balances): Balances => ({
  coins: progress.coins,
  hints: progress.hints,
  undos: progress.undos,
  extraTubes: progress.extraTubes,
});

/** A stable string of the synced fields: a change means the cloud copy is out of date. */
export const cloudFingerprint = (progress: CloudProgress): string => {
  const sortedRecord = <T>(record: Readonly<Record<string, T>>): [string, T][] =>
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([
    progress.level,
    sortedRecord(progress.stars),
    BALANCE_KEYS.map((key) => progress[key]),
    progress.streak,
    progress.bestStreak,
    progress.lastDailyDate,
    sortedRecord(progress.dailyHistory),
    progress.giftDayIndex,
    progress.lastGiftDate,
    progress.ownedThemes,
    progress.activeTheme,
    progress.processedTransactions,
    progress.starterPackPurchased,
  ]);
};

// ---------------------------------------------------------------------------------------------
// Parsing the server copy
// ---------------------------------------------------------------------------------------------

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

const dateOrNull = (value: unknown): string | null =>
  typeof value === 'string' && DATE_KEY.test(value) ? value : null;

const strings = (value: unknown, max: number): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && !out.includes(item)) out.push(item);
  }
  return out.slice(-max);
};

const isStarCount = (value: unknown): value is StarCount =>
  value === 1 || value === 2 || value === 3;

/** A document written by a newer app version: this version must not overwrite it. */
export const isNewerCloudSchema = (data: unknown): boolean =>
  isRecord(data) &&
  typeof data.schemaVersion === 'number' &&
  data.schemaVersion > CLOUD_SCHEMA_VERSION;

/**
 * Validates a `users/{uid}` document. Returns null when there is no usable snapshot (missing
 * document, wrong shape or a newer, unknown schema).
 */
export const parseCloudSnapshot = (data: unknown): CloudProgress | null => {
  if (!isRecord(data)) return null;
  const version = data.schemaVersion;
  if (typeof version !== 'number' || version < 1 || version > CLOUD_SCHEMA_VERSION) return null;
  const stars: Record<number, StarCount> = {};
  for (const [key, value] of Object.entries(isRecord(data.stars) ? data.stars : {})) {
    const level = Number(key);
    if (Number.isInteger(level) && level >= 1 && isStarCount(value)) stars[level] = value;
  }
  const dailyHistory: Record<string, DailyResult> = {};
  for (const [key, value] of Object.entries(isRecord(data.dailyHistory) ? data.dailyHistory : {})) {
    if (DATE_KEY.test(key) && isRecord(value)) {
      dailyHistory[key] = { stars: count(value.stars), moves: count(value.moves) };
    }
  }
  const ownedThemes = strings(data.ownedThemes, MAX_CLOUD_THEMES);
  if (!ownedThemes.includes(DEFAULT_THEME_ID)) ownedThemes.unshift(DEFAULT_THEME_ID);
  const level = count(data.level);
  return {
    level: level >= 1 ? level : 1,
    stars,
    coins: count(data.coins),
    hints: count(data.hints),
    undos: count(data.undos),
    extraTubes: count(data.extraTubes),
    streak: count(data.streak),
    bestStreak: count(data.bestStreak),
    lastDailyDate: dateOrNull(data.lastDailyDate),
    dailyHistory: capDailyHistory(dailyHistory),
    giftDayIndex: count(data.giftDayIndex),
    lastGiftDate: dateOrNull(data.lastGiftDate),
    ownedThemes,
    activeTheme:
      typeof data.activeTheme === 'string' && data.activeTheme.length > 0
        ? data.activeTheme
        : DEFAULT_THEME_ID,
    processedTransactions: strings(data.processedTransactions, MAX_PROCESSED_TRANSACTIONS),
    starterPackPurchased: data.starterPackPurchased === true,
  };
};

// ---------------------------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------------------------

export interface MergeResult {
  /** The state both the device and the server keep. */
  readonly progress: CloudProgress;
  /** The new `lastSyncedBalances`: the merged balances, which the server now holds. */
  readonly baseline: Balances;
  /** Human-readable notes on every conflict resolved (logged in development). */
  readonly decisions: readonly string[];
}

const laterDate = (a: string | null, b: string | null): string | null => {
  if (a === null) return b;
  if (b === null) return a;
  return a >= b ? a : b;
};

const betterDaily = (a: DailyResult, b: DailyResult): DailyResult => {
  if (a.stars !== b.stars) return a.stars > b.stars ? a : b;
  return a.moves <= b.moves ? a : b;
};

const unionLatest = (
  remote: readonly string[],
  local: readonly string[],
  max: number,
): string[] => {
  const localSet = new Set(local);
  return [...remote.filter((id) => !localSet.has(id)), ...local].slice(-max);
};

/**
 * Merges the device copy with the server copy (null when the account has no cloud save yet).
 * `lastSyncedBalances` is the baseline from the last successful sync with this account, or null.
 */
export const mergeProgress = (
  local: CloudProgress,
  remote: CloudProgress | null,
  lastSyncedBalances: Balances | null,
): MergeResult => {
  if (remote === null) {
    return {
      progress: { ...local },
      baseline: balancesOf(local),
      decisions: ['no cloud save yet: the device copy is uploaded'],
    };
  }
  const decisions: string[] = [];
  const note = (field: string, chosen: unknown, localValue: unknown, remoteValue: unknown) => {
    if (JSON.stringify(localValue) !== JSON.stringify(remoteValue)) {
      decisions.push(
        `${field}: device ${JSON.stringify(localValue)}, cloud ${JSON.stringify(remoteValue)} → ${JSON.stringify(chosen)}`,
      );
    }
  };

  const level = Math.max(local.level, remote.level);
  note('level', level, local.level, remote.level);

  const stars: Record<number, StarCount> = { ...remote.stars };
  for (const [key, value] of Object.entries(local.stars)) {
    const levelNumber = Number(key);
    const other = stars[levelNumber];
    stars[levelNumber] = other === undefined || value > other ? value : other;
  }

  const mergeBalance = (key: (typeof BALANCE_KEYS)[number]): number => {
    const merged =
      lastSyncedBalances === null
        ? Math.max(local[key], remote[key])
        : Math.max(0, remote[key] + (local[key] - lastSyncedBalances[key]));
    note(key, merged, local[key], remote[key]);
    return merged;
  };
  const balances: Balances = {
    coins: mergeBalance('coins'),
    hints: mergeBalance('hints'),
    undos: mergeBalance('undos'),
    extraTubes: mergeBalance('extraTubes'),
  };
  if (lastSyncedBalances === null) decisions.push('no baseline: balances take the larger value');

  const streak = Math.max(local.streak, remote.streak);
  const bestStreak = Math.max(local.bestStreak, remote.bestStreak, streak);
  note('streak', streak, local.streak, remote.streak);
  const lastDailyDate = laterDate(local.lastDailyDate, remote.lastDailyDate);

  const history: Record<string, DailyResult> = { ...remote.dailyHistory };
  for (const [date, result] of Object.entries(local.dailyHistory)) {
    const other = history[date];
    history[date] = other === undefined ? result : betterDaily(result, other);
  }

  const localGift = local.lastGiftDate ?? '';
  const remoteGift = remote.lastGiftDate ?? '';
  const gift =
    localGift === remoteGift
      ? {
          giftDayIndex: Math.max(local.giftDayIndex, remote.giftDayIndex),
          lastGiftDate: local.lastGiftDate,
        }
      : localGift > remoteGift
        ? { giftDayIndex: local.giftDayIndex, lastGiftDate: local.lastGiftDate }
        : { giftDayIndex: remote.giftDayIndex, lastGiftDate: remote.lastGiftDate };
  note('giftDayIndex', gift.giftDayIndex, local.giftDayIndex, remote.giftDayIndex);

  const ownedThemes = [
    ...local.ownedThemes,
    ...remote.ownedThemes.filter((id) => !local.ownedThemes.includes(id)),
  ].slice(0, MAX_CLOUD_THEMES);
  note('activeTheme', local.activeTheme, local.activeTheme, remote.activeTheme);

  const progress: CloudProgress = {
    level,
    stars,
    ...balances,
    streak,
    bestStreak,
    lastDailyDate,
    dailyHistory: capDailyHistory(history),
    ...gift,
    ownedThemes,
    activeTheme: local.activeTheme,
    processedTransactions: unionLatest(
      remote.processedTransactions,
      local.processedTransactions,
      MAX_PROCESSED_TRANSACTIONS,
    ),
    starterPackPurchased: local.starterPackPurchased || remote.starterPackPurchased,
  };
  return { progress, baseline: balancesOf(progress), decisions };
};
