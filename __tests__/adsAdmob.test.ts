import { REWARDED_PLACEMENTS } from '@/config/ads';
import { ads, setAdsProvider } from '@/services/ads';
import { AD_RETRY_MAX_MS, adRetryDelayMs, createAdmobAdsProvider } from '@/services/ads.admob';
import { pauseAll, resumeAll } from '@/services/audio';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { logger } from '@/utils/logger';

import { AD_EVENTS, createFakeAdmob, flushPromises, type FakeAdmob } from '../test-utils/fakeAdmob';

jest.mock('@/services/audio', () => ({
  pauseAll: jest.fn(),
  resumeAll: jest.fn(),
  play: jest.fn(),
}));

type Timer = ReturnType<typeof setTimeout>;

let fake: FakeAdmob;
let timers: { run: () => void; ms: number }[];
let failures: string[];

const setup = (units: { rewarded?: string | null; interstitial?: string | null } = {}) => {
  fake = createFakeAdmob();
  timers = [];
  failures = [];
  return createAdmobAdsProvider({
    sdk: fake.module,
    getUnitId: (format) => {
      const unit = units[format];
      return Promise.resolve(unit === undefined ? `unit-${format}` : unit);
    },
    onLoadFailed: (format, code) => failures.push(`${format}:${code}`),
    setTimer: (run, ms) => {
      timers.push({ run, ms });
      return timers.length as unknown as Timer;
    },
    clearTimer: () => undefined,
  });
};

const rewardedAd = () => fake.ads.find((ad) => ad.format === 'rewarded')!;
const interstitialAd = () => fake.ads.find((ad) => ad.format === 'interstitial')!;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
});

describe('adRetryDelayMs', () => {
  it('doubles from 1 s and caps at 60 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 30].map(adRetryDelayMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000,
    ]);
    expect(AD_RETRY_MAX_MS).toBe(60_000);
  });
});

describe('AdMob provider', () => {
  it('preloads one ad of each format with the resolved units', async () => {
    const provider = setup();
    provider.preload();
    provider.preload();
    await flushPromises();
    expect(fake.ads.map((ad) => [ad.format, ad.unitId])).toEqual([
      ['rewarded', 'unit-rewarded'],
      ['interstitial', 'unit-interstitial'],
    ]);
    expect(rewardedAd().load).toHaveBeenCalledTimes(1);
    expect(provider.isRewardedReady()).toBe(false);
    rewardedAd().emit(AD_EVENTS.rewardedLoaded);
    expect(provider.isRewardedReady()).toBe(true);
  });

  it('retries failed loads with exponential backoff and reports ad_load_failed', async () => {
    const provider = setup();
    provider.preload();
    await flushPromises();
    const ad = rewardedAd();
    ad.emit(AD_EVENTS.error, { code: 'googleMobileAds/no-fill', reason: 'no-fill' });
    ad.emit(AD_EVENTS.error, { code: 'googleMobileAds/timeout' });
    expect(failures).toEqual(['rewarded:no-fill', 'rewarded:googleMobileAds/timeout']);
    expect(timers.map((timer) => timer.ms)).toEqual([1000, 2000]);
    provider.preload();
    expect(ad.load).toHaveBeenCalledTimes(1);
    timers[1]!.run();
    expect(ad.load).toHaveBeenCalledTimes(2);
    ad.emit(AD_EVENTS.rewardedLoaded);
    ad.emit(AD_EVENTS.closed);
    ad.emit(AD_EVENTS.error, { reason: 'no-fill' });
    expect(timers.at(-1)?.ms).toBe(1000);
  });

  it('resolves earned only after EARNED_REWARD, dismissed when closed early, and reloads', async () => {
    const provider = setup();
    provider.preload();
    await flushPromises();
    const ad = rewardedAd();
    ad.emit(AD_EVENTS.rewardedLoaded);
    const dismissed = provider.showRewarded(REWARDED_PLACEMENTS.HINT);
    await flushPromises();
    expect(ad.show).toHaveBeenCalledTimes(1);
    ad.emit(AD_EVENTS.closed);
    await expect(dismissed).resolves.toBe('dismissed');
    expect(ad.load).toHaveBeenCalledTimes(2);
    ad.emit(AD_EVENTS.rewardedLoaded);
    const earned = provider.showRewarded(REWARDED_PLACEMENTS.HINT);
    ad.emit(AD_EVENTS.earned, { type: 'coins', amount: 1 });
    ad.emit(AD_EVENTS.closed);
    await expect(earned).resolves.toBe('earned');
  });

  it('is unavailable when not loaded, when show rejects, or on a show error', async () => {
    const provider = setup();
    provider.preload();
    await flushPromises();
    const ad = rewardedAd();
    await expect(provider.showRewarded(REWARDED_PLACEMENTS.UNDO)).resolves.toBe('unavailable');
    ad.emit(AD_EVENTS.rewardedLoaded);
    ad.show.mockRejectedValueOnce(new Error('not loaded'));
    await expect(provider.showRewarded(REWARDED_PLACEMENTS.UNDO)).resolves.toBe('unavailable');
    ad.emit(AD_EVENTS.rewardedLoaded);
    const failed = provider.showRewarded(REWARDED_PLACEMENTS.UNDO);
    ad.emit(AD_EVENTS.error, { reason: 'internal-error', phase: 'show' });
    await expect(failed).resolves.toBe('unavailable');
    expect(failures).toEqual([]);
  });

  it('shows interstitials until they close', async () => {
    const provider = setup();
    provider.preload();
    await flushPromises();
    await expect(provider.showInterstitial()).resolves.toBe(false);
    const ad = interstitialAd();
    ad.emit(AD_EVENTS.loaded);
    let settled = false;
    const shown = provider.showInterstitial().then((value) => {
      settled = true;
      return value;
    });
    await flushPromises();
    expect(settled).toBe(false);
    ad.emit(AD_EVENTS.closed);
    await expect(shown).resolves.toBe(true);
    expect(ad.load).toHaveBeenCalledTimes(2);
  });

  it('disables a format without a unit id', async () => {
    const provider = setup({ interstitial: null });
    provider.preload();
    await flushPromises();
    expect(fake.ads.map((ad) => ad.format)).toEqual(['rewarded']);
    provider.preload();
    await flushPromises();
    expect(fake.ads).toHaveLength(1);
    await expect(provider.showInterstitial()).resolves.toBe(false);
  });

  it('keeps game audio paused until the ad closes (through ads.ts)', async () => {
    useProgressStore.setState(createDefaultProgress(Date.now()));
    const provider = setup();
    setAdsProvider(provider);
    provider.preload();
    await flushPromises();
    rewardedAd().emit(AD_EVENTS.rewardedLoaded);
    const result = ads.showRewarded(REWARDED_PLACEMENTS.HINT);
    await flushPromises();
    expect(pauseAll).toHaveBeenCalledTimes(1);
    expect(resumeAll).not.toHaveBeenCalled();
    rewardedAd().emit(AD_EVENTS.earned);
    rewardedAd().emit(AD_EVENTS.closed);
    await expect(result).resolves.toBe('earned');
    expect(resumeAll).toHaveBeenCalledTimes(1);
  });
});
