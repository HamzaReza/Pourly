import { isThemeAvailable } from '@/game/themeUnlocks';

import {
  createDefaultProgress,
  DEFAULT_THEME_ID,
  MAX_PROCESSED_TRANSACTIONS,
  PROGRESS_VERSION,
  type AdsProgress,
  type Balances,
  type DailyResult,
  type NotificationsProgress,
  type ProgressState,
  type ReviewProgress,
  type StarCount,
} from './progressModel';
import { DEFAULT_SETTINGS, type SettingsState } from './settingsModel';

type UnknownRecord = Record<string, unknown>;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown): UnknownRecord => (isRecord(value) ? value : {});

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

/** Finite number, otherwise the fallback. */
const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** Non-negative integer (floored), otherwise the fallback. */
const count = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const strOrNull = (value: unknown, fallback: string | null): string | null => {
  if (value === null) return null;
  return typeof value === 'string' ? value : fallback;
};

const dateOrNull = (value: unknown, fallback: string | null): string | null => {
  if (value === null) return null;
  return typeof value === 'string' && DATE_KEY.test(value) ? value : fallback;
};

const numOrNull = (value: unknown, fallback: number | null): number | null => {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const uniqueStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && !out.includes(item)) out.push(item);
  }
  return out;
};

const isStarCount = (value: unknown): value is StarCount =>
  value === 1 || value === 2 || value === 3;

const sanitizeStars = (value: unknown): Record<number, StarCount> => {
  const out: Record<number, StarCount> = {};
  for (const [key, stars] of Object.entries(asRecord(value))) {
    const level = Number(key);
    if (Number.isInteger(level) && level >= 1 && isStarCount(stars)) out[level] = stars;
  }
  return out;
};

const sanitizeDailyHistory = (value: unknown): Record<string, DailyResult> => {
  const out: Record<string, DailyResult> = {};
  for (const [key, entry] of Object.entries(asRecord(value))) {
    if (!DATE_KEY.test(key) || !isRecord(entry)) continue;
    out[key] = { stars: count(entry.stars, 0), moves: count(entry.moves, 0) };
  }
  return out;
};

const sanitizeBalances = (value: unknown): Balances | null => {
  if (!isRecord(value)) return null;
  return {
    coins: count(value.coins, 0),
    hints: count(value.hints, 0),
    undos: count(value.undos, 0),
    extraTubes: count(value.extraTubes, 0),
  };
};

const sanitizeAds = (value: unknown, d: AdsProgress): AdsProgress => {
  const v = asRecord(value);
  return {
    lastInterstitialAt: num(v.lastInterstitialAt, d.lastInterstitialAt),
    lastRewardedAt: num(v.lastRewardedAt, d.lastRewardedAt),
    levelsSinceInterstitial: count(v.levelsSinceInterstitial, d.levelsSinceInterstitial),
    freeCoinsClaimsToday: count(v.freeCoinsClaimsToday, d.freeCoinsClaimsToday),
    freeCoinsDate: dateOrNull(v.freeCoinsDate, d.freeCoinsDate),
    lastFreeCoinsAt: num(v.lastFreeCoinsAt, d.lastFreeCoinsAt),
  };
};

const sanitizeNotifications = (value: unknown, d: NotificationsProgress): NotificationsProgress => {
  const v = asRecord(value);
  return {
    asked: bool(v.asked, d.asked),
    askedCount: count(v.askedCount, d.askedCount),
    granted: bool(v.granted, d.granted),
    dailyEnabled: bool(v.dailyEnabled, d.dailyEnabled),
    streakEnabled: bool(v.streakEnabled, d.streakEnabled),
  };
};

const sanitizeReview = (value: unknown, d: ReviewProgress): ReviewProgress => {
  const v = asRecord(value);
  return {
    lastPromptAt: num(v.lastPromptAt, d.lastPromptAt),
    promptCount: count(v.promptCount, d.promptCount),
    threeStarStreak: count(v.threeStarStreak, d.threeStarStreak),
  };
};

/** Validates every field of a persisted progress object, filling gaps from defaults. */
export const sanitizeProgress = (persisted: unknown, now: number): ProgressState => {
  const d = createDefaultProgress(now);
  const v = asRecord(persisted);

  const ownedThemes = uniqueStrings(v.ownedThemes);
  if (!ownedThemes.includes(DEFAULT_THEME_ID)) ownedThemes.unshift(DEFAULT_THEME_ID);
  const activeTheme = str(v.activeTheme, d.activeTheme);
  const entitlements = asRecord(v.entitlements);
  const vip = bool(entitlements.vip, d.entitlements.vip);
  const starterPackPurchased = bool(v.starterPackPurchased, d.starterPackPurchased);
  const level = count(v.level, d.level);
  const themeAvailable = isThemeAvailable(activeTheme, {
    ownedThemes,
    entitlements: { noAds: false, vip },
    starterPackPurchased,
  });

  return {
    schemaVersion: PROGRESS_VERSION,
    installDate: dateOrNull(v.installDate, d.installDate) ?? d.installDate,
    lastOpenAt: num(v.lastOpenAt, d.lastOpenAt),
    lastSeenAt: num(v.lastSeenAt, d.lastSeenAt),
    sessionCount: count(v.sessionCount, d.sessionCount),
    level: level >= 1 ? level : d.level,
    stars: sanitizeStars(v.stars),
    coins: count(v.coins, d.coins),
    hints: count(v.hints, d.hints),
    undos: count(v.undos, d.undos),
    extraTubes: count(v.extraTubes, d.extraTubes),
    streak: count(v.streak, d.streak),
    bestStreak: count(v.bestStreak, d.bestStreak),
    lastDailyDate: dateOrNull(v.lastDailyDate, d.lastDailyDate),
    dailyHistory: sanitizeDailyHistory(v.dailyHistory),
    giftDayIndex: count(v.giftDayIndex, d.giftDayIndex),
    lastGiftDate: dateOrNull(v.lastGiftDate, d.lastGiftDate),
    lastVipClaimDate: dateOrNull(v.lastVipClaimDate, d.lastVipClaimDate),
    streakFreezeWeek: strOrNull(v.streakFreezeWeek, d.streakFreezeWeek),
    ownedThemes,
    activeTheme: themeAvailable ? activeTheme : DEFAULT_THEME_ID,
    entitlements: {
      noAds: bool(entitlements.noAds, d.entitlements.noAds),
      vip,
    },
    processedTransactions: uniqueStrings(v.processedTransactions).slice(
      -MAX_PROCESSED_TRANSACTIONS,
    ),
    starterPackExpiresAt: numOrNull(v.starterPackExpiresAt, d.starterPackExpiresAt),
    starterPackPurchased,
    ads: sanitizeAds(v.ads, d.ads),
    notifications: sanitizeNotifications(v.notifications, d.notifications),
    review: sanitizeReview(v.review, d.review),
    tutorialDone: bool(v.tutorialDone, d.tutorialDone),
    lastSyncedBalances: sanitizeBalances(v.lastSyncedBalances),
    updatedAt: num(v.updatedAt, d.updatedAt),
  };
};

type MigrationStep = (state: UnknownRecord) => UnknownRecord;

/**
 * Structural migrations keyed by the version they upgrade FROM. Version 0 (unversioned data) and
 * version 1 share the same shape, so no step is needed yet; add `n: (s) => ...` when version n+1
 * changes the shape.
 */
const PROGRESS_STEPS: Readonly<Record<number, MigrationStep>> = {};

/**
 * Upgrades persisted progress from `fromVersion` to `PROGRESS_VERSION`, then validates every
 * field. Never throws: unreadable data yields fresh defaults.
 */
export const migrateProgress = (
  persisted: unknown,
  fromVersion: number,
  now: number = Date.now(),
): ProgressState => {
  let state = asRecord(persisted);
  const start = Number.isInteger(fromVersion) && fromVersion >= 0 ? fromVersion : 0;
  for (let version = start; version < PROGRESS_VERSION; version += 1) {
    const step = PROGRESS_STEPS[version];
    if (step) state = step(state);
  }
  return sanitizeProgress(state, now);
};

const REDUCED_MOTION = ['system', 'on', 'off'] as const;
const QUALITY = ['auto', 'high', 'low'] as const;

const oneOf = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

/** Validates persisted settings, filling gaps from defaults. */
export const migrateSettings = (persisted: unknown): SettingsState => {
  const v = asRecord(persisted);
  return {
    sound: bool(v.sound, DEFAULT_SETTINGS.sound),
    haptics: bool(v.haptics, DEFAULT_SETTINGS.haptics),
    colorBlind: bool(v.colorBlind, DEFAULT_SETTINGS.colorBlind),
    reducedMotion: oneOf(REDUCED_MOTION, v.reducedMotion, DEFAULT_SETTINGS.reducedMotion),
    quality: oneOf(QUALITY, v.quality, DEFAULT_SETTINGS.quality),
    autoQualityDowngraded: bool(v.autoQualityDowngraded, DEFAULT_SETTINGS.autoQualityDowngraded),
    language: str(v.language, DEFAULT_SETTINGS.language),
  };
};
