/**
 * A fake `react-native-google-mobile-ads` module: full-screen ads that record `load`/`show` and
 * let tests fire SDK events, plus `AdsConsent` and `mobileAds()` mocks that log the call order.
 * Passed to `createAdmobAdsProvider` or to `consent.ts` through `setAdsSdkLoader`.
 */
type GmaModule = typeof import('react-native-google-mobile-ads');
type AdsConsentInfo = import('react-native-google-mobile-ads').AdsConsentInfo;

type Listener = (payload?: unknown) => void;

export class FakeAd {
  readonly listeners = new Map<string, Listener[]>();
  readonly load = jest.fn();
  readonly show = jest.fn(() => Promise.resolve());

  constructor(
    readonly format: 'rewarded' | 'interstitial',
    readonly unitId: string,
  ) {}

  addAdEventListener(type: string, listener: Listener): () => void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    return () => undefined;
  }

  /** Fires an SDK event (`loaded`, `rewarded_loaded`, `rewarded_earned_reward`, `error`, `closed`). */
  emit(type: string, payload?: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(payload);
  }
}

export const AD_EVENTS = {
  loaded: 'loaded',
  rewardedLoaded: 'rewarded_loaded',
  earned: 'rewarded_earned_reward',
  error: 'error',
  closed: 'closed',
} as const;

/** UMP's answer; enum members are given as their string values. */
export interface ConsentInfoInput {
  readonly status?: string;
  readonly canRequestAds?: boolean;
  readonly privacyOptionsRequirementStatus?: string;
  readonly isConsentFormAvailable?: boolean;
}

export const consentInfo = (overrides: ConsentInfoInput = {}): AdsConsentInfo =>
  ({
    status: 'OBTAINED',
    canRequestAds: true,
    privacyOptionsRequirementStatus: 'NOT_REQUIRED',
    isConsentFormAvailable: true,
    ...overrides,
  }) as unknown as AdsConsentInfo;

export interface FakeAdmob {
  readonly module: GmaModule;
  /** Every ad created, in order. */
  readonly ads: FakeAd[];
  /** SDK calls in order (`requestInfoUpdate`, `loadAndShow`, `config`, `initialize`, …). */
  readonly calls: string[];
  readonly consent: {
    requestInfoUpdate: jest.Mock;
    loadAndShowConsentFormIfRequired: jest.Mock;
    getConsentInfo: jest.Mock;
    showPrivacyOptionsForm: jest.Mock;
  };
  readonly setRequestConfiguration: jest.Mock;
  readonly initialize: jest.Mock;
}

export const createFakeAdmob = (info: AdsConsentInfo = consentInfo()): FakeAdmob => {
  const ads: FakeAd[] = [];
  const calls: string[] = [];
  const logged = <T>(name: string, value: () => T) =>
    jest.fn((...args: unknown[]) => {
      calls.push(args.length > 0 ? `${name}:${JSON.stringify(args[0])}` : name);
      return value();
    });
  const consent = {
    requestInfoUpdate: logged('requestInfoUpdate', () => Promise.resolve(info)),
    loadAndShowConsentFormIfRequired: logged('loadAndShow', () => Promise.resolve(info)),
    getConsentInfo: logged('getConsentInfo', () => Promise.resolve(info)),
    showPrivacyOptionsForm: logged('privacyOptionsForm', () => Promise.resolve(info)),
  };
  const setRequestConfiguration = logged('config', () => Promise.resolve());
  const initialize = logged('initialize', () => Promise.resolve([]));
  const create = (format: 'rewarded' | 'interstitial') => ({
    createForAdRequest: (unitId: string) => {
      const ad = new FakeAd(format, unitId);
      ads.push(ad);
      return ad;
    },
  });
  const module = {
    default: () => ({ setRequestConfiguration, initialize }),
    MaxAdContentRating: { G: 'G', PG: 'PG', T: 'T', MA: 'MA' },
    AdsConsentDebugGeography: { DISABLED: 0, EEA: 1, NOT_EEA: 2 },
    AdsConsentPrivacyOptionsRequirementStatus: {
      UNKNOWN: 'UNKNOWN',
      REQUIRED: 'REQUIRED',
      NOT_REQUIRED: 'NOT_REQUIRED',
    },
    AdsConsent: consent,
    RewardedAd: create('rewarded'),
    InterstitialAd: create('interstitial'),
    AdEventType: { LOADED: 'loaded', ERROR: 'error', CLOSED: 'closed', OPENED: 'opened' },
    RewardedAdEventType: { LOADED: 'rewarded_loaded', EARNED_REWARD: 'rewarded_earned_reward' },
  } as unknown as GmaModule;
  return { module, ads, calls, consent, setRequestConfiguration, initialize };
};

/** Lets chained promises (unit id lookup → create → load) run. */
export const flushPromises = async (rounds = 10): Promise<void> => {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
};
