/**
 * Mock ad provider: a full-screen "TEST AD (mock)" overlay (`MockAdHost`, mounted in the root
 * layout) with a 3-second countdown and a close button. A rewarded ad is earned only when the
 * countdown completes; closing earlier dismisses it. After each show the next ad "loads" for a
 * moment, so the not-ready path is reachable too.
 */
import type { RewardedPlacement } from '@/config/ads';

import type { AdsProvider, RewardedResult } from './ads';

export const MOCK_AD_COUNTDOWN_SEC = 3;
/** Simulated load time of the next ad after one was shown. */
export const MOCK_AD_RELOAD_MS = 1500;

export type MockAdFormat = 'rewarded' | 'interstitial';

export interface MockAdRequest {
  readonly id: number;
  readonly format: MockAdFormat;
  readonly placement: RewardedPlacement | null;
}

type Listener = () => void;

let current: MockAdRequest | null = null;
let finish: ((completed: boolean) => void) | null = null;
let nextId = 1;
const loaded: Record<MockAdFormat, boolean> = { rewarded: false, interstitial: false };
const reloadTimers: Record<MockAdFormat, ReturnType<typeof setTimeout> | null> = {
  rewarded: null,
  interstitial: null,
};
const listeners = new Set<Listener>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

const scheduleReload = (format: MockAdFormat): void => {
  const pending = reloadTimers[format];
  if (pending !== null) clearTimeout(pending);
  reloadTimers[format] = setTimeout(() => {
    reloadTimers[format] = null;
    loaded[format] = true;
  }, MOCK_AD_RELOAD_MS);
};

const present = (format: MockAdFormat, placement: RewardedPlacement | null): Promise<boolean> =>
  new Promise((resolve) => {
    loaded[format] = false;
    current = { id: nextId, format, placement };
    nextId += 1;
    finish = resolve;
    emit();
  });

/** The ad on screen, or null. */
export const getMockAd = (): MockAdRequest | null => current;

export const subscribeMockAd = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Closes the mock ad. `completed` is true when its countdown had finished. */
export const closeMockAd = (completed: boolean): void => {
  const shown = current;
  const done = finish;
  if (shown === null || done === null) return;
  current = null;
  finish = null;
  scheduleReload(shown.format);
  emit();
  done(completed);
};

export const mockAdsProvider: AdsProvider = {
  preload: () => {
    loaded.rewarded = loaded.rewarded || reloadTimers.rewarded === null;
    loaded.interstitial = loaded.interstitial || reloadTimers.interstitial === null;
  },
  isRewardedReady: () => loaded.rewarded && current === null,
  showRewarded: async (placement): Promise<RewardedResult> => {
    if (!loaded.rewarded || current !== null) return 'unavailable';
    const completed = await present('rewarded', placement);
    return completed ? 'earned' : 'dismissed';
  },
  showInterstitial: async () => {
    if (!loaded.interstitial || current !== null) return false;
    await present('interstitial', null);
    return true;
  },
};
