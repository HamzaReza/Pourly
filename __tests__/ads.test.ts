import { REWARDED_PLACEMENTS } from '@/config/ads';
import { ads, setAdsProvider, type AdsProvider } from '@/services/ads';
import {
  closeMockAd,
  getMockAd,
  MOCK_AD_RELOAD_MS,
  mockAdsProvider,
  subscribeMockAd,
} from '@/services/ads.mock';
import { pauseAll, resumeAll } from '@/services/audio';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { currentToast, dismissToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

jest.mock('@/services/audio', () => ({
  pauseAll: jest.fn(),
  resumeAll: jest.fn(),
  play: jest.fn(),
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

const clearToasts = () => {
  for (let toast = currentToast(); toast !== null; toast = currentToast()) dismissToast(toast.id);
};

/** Lets the provider's promise chain reach the mock overlay. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe('mock provider and ad service', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });
  afterAll(() => jest.useRealTimers());
  beforeEach(() => {
    useProgressStore.setState(createDefaultProgress(NOW));
    clearToasts();
    jest.clearAllMocks();
    jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    setAdsProvider(mockAdsProvider);
  });

  it('is unavailable before preload: toast, no reward, nothing recorded', async () => {
    expect(ads.isRewardedReady()).toBe(false);
    await expect(ads.showRewarded(REWARDED_PLACEMENTS.HINT)).resolves.toBe('unavailable');
    expect(currentToast()?.key).toBe('ads.notReady');
    expect(useProgressStore.getState().ads.lastRewardedAt).toBe(0);
    expect(pauseAll).not.toHaveBeenCalled();
  });

  it('earns the reward only when the countdown completed, with sounds paused meanwhile', async () => {
    ads.preload();
    expect(ads.isRewardedReady()).toBe(true);
    const listener = jest.fn();
    const unsubscribe = subscribeMockAd(listener);
    const shown = ads.showRewarded(REWARDED_PLACEMENTS.DOUBLE_COINS);
    await settle();
    expect(getMockAd()).toMatchObject({ format: 'rewarded', placement: 'DOUBLE_COINS' });
    expect(listener).toHaveBeenCalled();
    expect(pauseAll).toHaveBeenCalledTimes(1);
    expect(ads.isRewardedReady()).toBe(false);
    closeMockAd(true);
    await expect(shown).resolves.toBe('earned');
    expect(resumeAll).toHaveBeenCalledTimes(1);
    expect(getMockAd()).toBeNull();
    expect(useProgressStore.getState().ads.lastRewardedAt).toBe(NOW);
    unsubscribe();
  });

  it('reloads after a show and dismisses when closed early', async () => {
    expect(ads.isRewardedReady()).toBe(false);
    jest.advanceTimersByTime(MOCK_AD_RELOAD_MS);
    expect(ads.isRewardedReady()).toBe(true);
    const shown = ads.showRewarded(REWARDED_PLACEMENTS.UNDO);
    await settle();
    closeMockAd(false);
    await expect(shown).resolves.toBe('dismissed');
    expect(useProgressStore.getState().ads.lastRewardedAt).toBe(NOW + MOCK_AD_RELOAD_MS);
    expect(currentToast()).toBeNull();
    jest.advanceTimersByTime(MOCK_AD_RELOAD_MS);
  });

  it('shows interstitials through the same overlay', async () => {
    ads.preload();
    const shown = ads.showInterstitial();
    await settle();
    expect(getMockAd()?.format).toBe('interstitial');
    closeMockAd(false);
    await expect(shown).resolves.toBe(true);
  });

  it('never shows two ads at once and treats a failing provider as unavailable', async () => {
    let finish: (value: 'earned') => void = () => undefined;
    const slow: AdsProvider = {
      preload: jest.fn(),
      isRewardedReady: () => true,
      showRewarded: () => new Promise((resolve) => (finish = resolve)),
      showInterstitial: () => Promise.resolve(true),
    };
    setAdsProvider(slow);
    const first = ads.showRewarded(REWARDED_PLACEMENTS.HINT);
    await settle();
    await expect(ads.showRewarded(REWARDED_PLACEMENTS.HINT)).resolves.toBe('unavailable');
    finish('earned');
    await expect(first).resolves.toBe('earned');

    clearToasts();
    setAdsProvider({ ...slow, showRewarded: () => Promise.reject(new Error('sdk')) });
    await expect(ads.showRewarded(REWARDED_PLACEMENTS.HINT)).resolves.toBe('unavailable');
    expect(currentToast()?.key).toBe('ads.notReady');
    expect(resumeAll).toHaveBeenCalled();
  });
});
