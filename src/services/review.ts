/**
 * Store review prompt (spec §19), through `expo-store-review` (Google Play in-app review).
 *
 * `reviewVerdict` (pure, injected clock) allows a request only when all of these hold:
 * - a numbered level was won (not the daily, not skipped) and it is level 10 or later;
 * - `review.threeStarStreak` ≥ 3: that win made it three 3★ wins in a row;
 * - fewer than 3 requests so far, and none in the last 60 days;
 * - not right after an ad: no rewarded ad and no interstitial in the last 60 s, and the win's
 *   coins were not doubled with an ad.
 * A negative elapsed time (clock turned back) counts as too recent.
 *
 * The game screen asks after the Win overlay is gone (never over it, never together with the
 * notification soft-prompt). `StoreReview.isAvailableAsync()` is checked first; the request is
 * recorded (`lastPromptAt`, `promptCount`) only when it is made. Google decides whether the sheet
 * actually appears. The module is imported lazily; `setStoreReviewLoader` replaces it in tests.
 */
import type { AdsProgress, ReviewProgress } from '@/state/progressModel';
import { useGameStore } from '@/state/gameStore';
import { useProgressStore } from '@/state/progressStore';
import { logger } from '@/utils/logger';

type StoreReviewModule = typeof import('expo-store-review');

export const REVIEW_MIN_LEVEL = 10;
export const REVIEW_THREE_STAR_RUN = 3;
export const REVIEW_MAX_PROMPTS = 3;
export const REVIEW_SPACING_MS = 60 * 24 * 60 * 60 * 1000;
/** "Right after an ad": an ad of either format closed less than this long ago. */
export const REVIEW_AD_QUIET_MS = 60_000;

export interface ReviewInput {
  readonly mode: 'level' | 'daily';
  /** The level that was just won. */
  readonly level: number;
  readonly skipped: boolean;
  /** The win's coins were doubled with the DOUBLE_COINS ad. */
  readonly doubled: boolean;
  readonly review: ReviewProgress;
  readonly ads: Pick<AdsProgress, 'lastRewardedAt' | 'lastInterstitialAt'>;
}

export type ReviewVerdict =
  'allowed' | 'notLevelWin' | 'belowLevel' | 'noStreak' | 'maxPrompts' | 'tooSoon' | 'afterAd';

/** Too recent when `at` is set and less than `windowMs` ago (or in the future). */
const within = (at: number, now: number, windowMs: number): boolean =>
  at > 0 && now - at < windowMs;

export const reviewVerdict = (input: ReviewInput, now: number): ReviewVerdict => {
  if (input.mode !== 'level' || input.skipped) return 'notLevelWin';
  if (input.level < REVIEW_MIN_LEVEL) return 'belowLevel';
  if (input.review.threeStarStreak < REVIEW_THREE_STAR_RUN) return 'noStreak';
  if (input.review.promptCount >= REVIEW_MAX_PROMPTS) return 'maxPrompts';
  if (within(input.review.lastPromptAt, now, REVIEW_SPACING_MS)) return 'tooSoon';
  if (
    input.doubled ||
    within(input.ads.lastRewardedAt, now, REVIEW_AD_QUIET_MS) ||
    within(input.ads.lastInterstitialAt, now, REVIEW_AD_QUIET_MS)
  ) {
    return 'afterAd';
  }
  return 'allowed';
};

/** The review input for the session on screen; null unless it is a finished level. */
export const currentReviewInput = (): ReviewInput | null => {
  const session = useGameStore.getState().session;
  if (session === null || session.status !== 'won' || session.result === null) return null;
  const { review, ads } = useProgressStore.getState();
  return {
    mode: session.mode,
    level: session.levelNumber,
    skipped: session.result.skipped,
    doubled: session.result.doubled,
    review,
    ads,
  };
};

export type StoreReviewLoader = () => Promise<StoreReviewModule>;

let importModule: StoreReviewLoader = () => import('expo-store-review');

/** Replaces how `expo-store-review` is loaded (tests, where dynamic `import()` is unavailable). */
export const setStoreReviewLoader = (loader: StoreReviewLoader): void => {
  importModule = loader;
};

/**
 * Requests the in-app review when `input` allows it and the store supports it. Resolves true when
 * the request was made (and recorded). Never throws.
 */
export const requestReviewIfDue = async (
  input: ReviewInput | null,
  now: number = Date.now(),
): Promise<boolean> => {
  if (input === null || reviewVerdict(input, now) !== 'allowed') return false;
  try {
    const storeReview = await importModule();
    if (!(await storeReview.isAvailableAsync())) return false;
    useProgressStore.getState().recordReviewPrompt(now);
    await storeReview.requestReview();
    return true;
  } catch (error: unknown) {
    logger.warn('Store review request failed', error);
    return false;
  }
};
