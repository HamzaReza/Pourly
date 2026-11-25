/**
 * `consent.ts` keeps module state (phase, consent answer, AdMob provider), so every test loads a
 * fresh copy with `jest.resetModules()` and injects the fake SDK through `setAdsSdkLoader`.
 */
import { AD_EVENTS, consentInfo, createFakeAdmob, type FakeAdmob } from '../test-utils/fakeAdmob';

jest.mock('@/services/audio', () => ({
  pauseAll: jest.fn(),
  resumeAll: jest.fn(),
  play: jest.fn(),
}));
jest.mock('@/config/ads', () => ({
  ...jest.requireActual('@/config/ads'),
  getAdUnitId: jest.fn((format: string) => Promise.resolve(`unit-${format}`)),
}));

type Consent = typeof import('@/services/consent');
type Ads = typeof import('@/services/ads');
type ProgressStore = typeof import('@/state/progressStore');
type GameStore = typeof import('@/state/gameStore');
type Generator = typeof import('@/game/generator');
type Logger = typeof import('@/utils/logger');

interface Loaded {
  consent: Consent;
  ads: Ads;
  progress: ProgressStore['useProgressStore'];
  game: GameStore['useGameStore'];
  getLevel: Generator['getLevel'];
  fake: FakeAdmob;
}

const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const load = ({
  nativeModule = true,
  level = 5,
  fake = createFakeAdmob(),
  debugEea = false,
}: {
  nativeModule?: boolean;
  level?: number;
  fake?: FakeAdmob;
  debugEea?: boolean;
} = {}): Loaded => {
  jest.resetModules();
  jest.doMock('@/config/env', () => {
    const actual = jest.requireActual<typeof import('@/config/env')>('@/config/env');
    return { ...actual, PUBLIC_ENV: { ...actual.PUBLIC_ENV, umpDebugEea: debugEea } };
  });
  const rn = jest.requireActual<typeof import('react-native')>('react-native');
  jest
    .spyOn(rn.TurboModuleRegistry, 'get')
    .mockImplementation((name: string) =>
      nativeModule && name === 'RNGoogleMobileAdsModule' ? ({} as never) : null,
    );
  const logger = jest.requireActual<Logger>('@/utils/logger').logger;
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
  const progress = jest.requireActual<ProgressStore>('@/state/progressStore').useProgressStore;
  progress.setState({ level });
  const consent = jest.requireActual<Consent>('@/services/consent');
  consent.setAdsSdkLoader(() => Promise.resolve(fake.module));
  return {
    consent,
    ads: jest.requireActual<Ads>('@/services/ads'),
    progress,
    game: jest.requireActual<GameStore>('@/state/gameStore').useGameStore,
    getLevel: jest.requireActual<Generator>('@/game/generator').getLevel,
    fake,
  };
};

const CONFIG =
  'config:{"maxAdContentRating":"PG","tagForChildDirectedTreatment":false,"tagForUnderAgeOfConsent":false}';

describe('consent flow', () => {
  it('runs UMP, then configures and initializes ads, then preloads AdMob', async () => {
    const { consent, ads, fake } = load();
    consent.startAdsWhenEligible();
    await settle();
    expect(fake.calls).toEqual(['requestInfoUpdate:{}', 'loadAndShow', CONFIG, 'initialize']);
    expect(fake.ads.map((ad) => ad.format)).toEqual(['rewarded', 'interstitial']);
    fake.ads[0]!.emit(AD_EVENTS.rewardedLoaded);
    expect(ads.ads.isRewardedReady()).toBe(true);
    expect(consent.getConsentState()).toEqual({
      canRequestAds: true,
      privacyOptionsRequired: false,
    });
  });

  it('uses the EEA debug geography when the dev flag is set', async () => {
    const { consent, fake } = load({ debugEea: true });
    consent.startAdsWhenEligible();
    await settle();
    expect(fake.calls[0]).toBe('requestInfoUpdate:{"debugGeography":1}');
  });

  it('waits for the start of level 5', async () => {
    const { consent, fake, game, getLevel } = load({ level: 3 });
    consent.startAdsWhenEligible();
    await settle();
    expect(fake.calls).toEqual([]);
    game.getState().loadLevel(getLevel(4), 'level', Date.now());
    game.getState().loadLevel(getLevel(5), 'daily', Date.now());
    await settle();
    expect(fake.calls).toEqual([]);
    game.getState().loadLevel(getLevel(5), 'level', Date.now());
    await settle();
    expect(fake.calls[0]).toBe('requestInfoUpdate:{}');
    expect(fake.calls).toContain('initialize');
  });

  it('stops waiting when cleaned up, and runs only once', async () => {
    const { consent, fake, game, getLevel } = load({ level: 1 });
    const stop = consent.startAdsWhenEligible();
    stop();
    game.getState().loadLevel(getLevel(6), 'level', Date.now());
    await settle();
    expect(fake.calls).toEqual([]);
    consent.startAdsWhenEligible();
    consent.startAdsWhenEligible();
    await settle();
    game.getState().loadLevel(getLevel(7), 'level', Date.now());
    await settle();
    expect(fake.calls.filter((call) => call === 'initialize')).toHaveLength(1);
  });

  it('never starts without the native module', async () => {
    const { consent, fake } = load({ nativeModule: false });
    consent.hasAdsNativeModule();
    consent.startAdsWhenEligible();
    await settle();
    expect(fake.calls).toEqual([]);
    expect(consent.hasAdsNativeModule()).toBe(false);
  });

  it('does not initialize ads when UMP says ads cannot be requested', async () => {
    const fake = createFakeAdmob(consentInfo({ canRequestAds: false, status: 'REQUIRED' }));
    const { consent, ads } = load({ fake });
    consent.startAdsWhenEligible();
    await settle();
    expect(fake.calls).toEqual(['requestInfoUpdate:{}', 'loadAndShow']);
    expect(fake.initialize).not.toHaveBeenCalled();
    expect(ads.ads.isRewardedReady()).toBe(false);
  });

  it('falls back to the stored answer when the update or the form fails', async () => {
    const fake = createFakeAdmob();
    fake.consent.requestInfoUpdate.mockRejectedValueOnce(new Error('offline'));
    fake.consent.loadAndShowConsentFormIfRequired.mockRejectedValueOnce(new Error('form'));
    const { consent } = load({ fake });
    consent.startAdsWhenEligible();
    await settle();
    expect(fake.consent.getConsentInfo).toHaveBeenCalled();
    expect(fake.calls).toContain('initialize');
  });
});

describe('privacy options', () => {
  it('are offered only when UMP requires them, and re-apply the new answer', async () => {
    const fake = createFakeAdmob(consentInfo({ privacyOptionsRequirementStatus: 'REQUIRED' }));
    const { consent } = load({ fake });
    expect(consent.isPrivacyOptionsRequired()).toBe(false);
    await expect(consent.showPrivacyOptions()).resolves.toBe(false);
    const listener = jest.fn();
    const unsubscribe = consent.subscribeConsent(listener);
    consent.startAdsWhenEligible();
    await settle();
    expect(consent.isPrivacyOptionsRequired()).toBe(true);
    expect(listener).toHaveBeenCalled();
    fake.consent.showPrivacyOptionsForm.mockResolvedValueOnce(
      consentInfo({ canRequestAds: false, privacyOptionsRequirementStatus: 'REQUIRED' }),
    );
    await expect(consent.showPrivacyOptions()).resolves.toBe(true);
    expect(consent.getConsentState()?.canRequestAds).toBe(false);
    unsubscribe();
  });

  it('report a form that fails to open', async () => {
    const fake = createFakeAdmob(consentInfo({ privacyOptionsRequirementStatus: 'REQUIRED' }));
    const { consent } = load({ fake });
    consent.startAdsWhenEligible();
    await settle();
    fake.consent.showPrivacyOptionsForm.mockRejectedValueOnce(new Error('no form'));
    await expect(consent.showPrivacyOptions()).resolves.toBe(false);
  });
});

describe('fallback ads provider', () => {
  it('is the mock in development and unavailable in release', async () => {
    const { ads } = load();
    const { mockAdsProvider } =
      jest.requireActual<typeof import('@/services/ads.mock')>('@/services/ads.mock');
    expect(ads.fallbackAdsProvider(true)).toBe(mockAdsProvider);
    const release = ads.fallbackAdsProvider(false);
    expect(release).toBe(ads.unavailableAdsProvider);
    expect(release.isRewardedReady()).toBe(false);
    await expect(release.showRewarded('HINT')).resolves.toBe('unavailable');
    await expect(release.showInterstitial()).resolves.toBe(false);
  });
});
