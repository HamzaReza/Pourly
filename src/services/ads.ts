/**
 * Ad abstraction (spec §13). Game code calls only this module; the provider behind it is the mock
 * (`ads.mock.ts`) until phase 7 installs AdMob with `setAdsProvider`, behind the same interface.
 *
 * - Rewards are granted by callers ONLY when `showRewarded` resolves `earned`.
 * - Game sounds are paused while an ad is on screen; `ads.lastRewardedAt` records every rewarded
 *   ad actually shown (interstitial spacing, spec §13).
 * - When no ad is ready the player sees a localized "Ad not ready" toast and is never blocked.
 */
import type { RewardedPlacement } from '@/config/ads';
import { useProgressStore } from '@/state/progressStore';
import { showToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import { mockAdsProvider } from './ads.mock';
import { track } from './analytics';
import { pauseAll, resumeAll } from './audio';

export type RewardedResult = 'earned' | 'dismissed' | 'unavailable';

/** What an ad SDK adapter implements. */
export interface AdsProvider {
  /** Starts loading one rewarded and one interstitial ad (idempotent). */
  preload: () => void;
  isRewardedReady: () => boolean;
  /** Shows a rewarded ad; resolves when it closes. */
  showRewarded: (placement: RewardedPlacement) => Promise<RewardedResult>;
  /** Shows an interstitial; resolves true when one was shown. */
  showInterstitial: () => Promise<boolean>;
}

let provider: AdsProvider = mockAdsProvider;
let showing = false;

/** Installs the ad backend (phase 7: AdMob after consent). */
export const setAdsProvider = (next: AdsProvider): void => {
  provider = next;
};

const preload = (): void => {
  try {
    provider.preload();
  } catch (error: unknown) {
    logger.warn('Ad preload failed', error);
  }
};

const isRewardedReady = (): boolean => !showing && provider.isRewardedReady();

/** Runs a full-screen ad with game sounds paused; never two at once. */
const withAudioPaused = async <T>(show: () => Promise<T>, fallback: T): Promise<T> => {
  showing = true;
  pauseAll();
  try {
    return await show();
  } catch (error: unknown) {
    logger.warn('Ad failed to show', error);
    return fallback;
  } finally {
    resumeAll();
    showing = false;
  }
};

const showRewarded = async (placement: RewardedPlacement): Promise<RewardedResult> => {
  track('ad_rewarded_requested', { placement });
  if (!isRewardedReady()) {
    showToast('ads.notReady');
    preload();
    return 'unavailable';
  }
  const result = await withAudioPaused<RewardedResult>(
    () => provider.showRewarded(placement),
    'unavailable',
  );
  if (result === 'unavailable') showToast('ads.notReady');
  else useProgressStore.getState().recordRewardedAd(Date.now());
  if (result === 'earned') track('ad_rewarded_earned', { placement });
  preload();
  return result;
};

const showInterstitial = async (): Promise<boolean> => {
  if (showing) return false;
  const shown = await withAudioPaused(() => provider.showInterstitial(), false);
  preload();
  return shown;
};

export const ads = { preload, isRewardedReady, showRewarded, showInterstitial } as const;
