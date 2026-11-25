/**
 * Ad consent and AdMob start-up (spec §13), Android only (no ATT).
 *
 * 1. Nothing ad-related loads until the first frame has rendered (the root layout calls
 *    `startAdsWhenEligible` from an idle callback) AND the player reaches the start of level 5.
 * 2. Google UMP runs: `AdsConsent.requestInfoUpdate`, then `loadAndShowConsentFormIfRequired`.
 * 3. Only when the result says `canRequestAds` is the request configuration set (max ad content
 *    rating PG, not child-directed, not under the age of consent), the Mobile Ads SDK initialized
 *    and the AdMob provider installed and preloaded. Otherwise the fallback provider stays (the
 *    mock in development, none in release).
 *
 * UMP stores the player's choices itself; nothing is persisted here. Settings shows "Ad privacy
 * options" only while UMP reports them as required. In development, `EXPO_PUBLIC_UMP_DEBUG_EEA=true`
 * makes UMP treat the device as being in the EEA so the consent form can be tested.
 */
import { TurboModuleRegistry } from 'react-native';
import type { AdsConsentInfo } from 'react-native-google-mobile-ads';

import { getAdUnitId } from '@/config/ads';
import { PUBLIC_ENV } from '@/config/env';
import { useGameStore } from '@/state/gameStore';
import { useProgressStore } from '@/state/progressStore';
import { logger } from '@/utils/logger';

import { ads, fallbackAdsProvider, setAdsProvider, type AdsProvider } from './ads';
import { createAdmobAdsProvider } from './ads.admob';
import { track } from './analytics';

type GmaModule = typeof import('react-native-google-mobile-ads');

/** Ads start once the player reaches the start of this level. */
export const ADS_START_LEVEL = 5;

/** Whether `level` is at or past the level where ads may start. */
export const reachedAdsStartLevel = (level: number): boolean => level >= ADS_START_LEVEL;

export interface ConsentState {
  readonly canRequestAds: boolean;
  readonly privacyOptionsRequired: boolean;
}

type Phase = 'idle' | 'waiting' | 'running' | 'done';
type Listener = () => void;

let phase: Phase = 'idle';
let consent: ConsentState | null = null;
let sdkPromise: Promise<GmaModule> | null = null;
let admobProvider: AdsProvider | null = null;
const listeners = new Set<Listener>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

/** True when the AdMob native module is linked (false in Expo Go and Jest). */
export const hasAdsNativeModule = (): boolean =>
  TurboModuleRegistry.get('RNGoogleMobileAdsModule') != null;

export type AdsSdkLoader = () => Promise<GmaModule>;

/** Importing the package root resolves its TurboModules, so it is loaded only when needed. */
let importSdk: AdsSdkLoader = () => import('react-native-google-mobile-ads');

/** Replaces how the SDK is loaded (tests, where dynamic `import()` is unavailable). */
export const setAdsSdkLoader = (loader: AdsSdkLoader): void => {
  importSdk = loader;
  sdkPromise = null;
};

const loadSdk = (): Promise<GmaModule> => {
  sdkPromise ??= importSdk();
  return sdkPromise;
};

/** The store-neutral view of UMP's consent info. */
export const toConsentState = (
  sdk: Pick<GmaModule, 'AdsConsentPrivacyOptionsRequirementStatus'>,
  info: AdsConsentInfo,
): ConsentState => ({
  canRequestAds: info.canRequestAds,
  privacyOptionsRequired:
    info.privacyOptionsRequirementStatus === sdk.AdsConsentPrivacyOptionsRequirementStatus.REQUIRED,
});

/** Sets the request configuration, initializes the SDK once and installs the AdMob provider. */
const startAdmob = async (sdk: GmaModule): Promise<void> => {
  if (admobProvider === null) {
    const mobileAds = sdk.default();
    await mobileAds.setRequestConfiguration({
      maxAdContentRating: sdk.MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
    });
    await mobileAds.initialize();
    admobProvider = createAdmobAdsProvider({
      sdk,
      getUnitId: getAdUnitId,
      onLoadFailed: (format, code) => track('ad_load_failed', { format, code }),
    });
  }
  setAdsProvider(admobProvider);
  ads.preload();
};

/** Records UMP's answer and starts (or stops) AdMob accordingly. */
const applyConsent = async (sdk: GmaModule, info: AdsConsentInfo): Promise<void> => {
  consent = toConsentState(sdk, info);
  emit();
  if (consent.canRequestAds) {
    await startAdmob(sdk);
  } else {
    setAdsProvider(fallbackAdsProvider());
  }
};

const runConsentFlow = async (): Promise<void> => {
  phase = 'running';
  try {
    const sdk = await loadSdk();
    const options =
      __DEV__ && PUBLIC_ENV.umpDebugEea ? { debugGeography: sdk.AdsConsentDebugGeography.EEA } : {};
    try {
      await sdk.AdsConsent.requestInfoUpdate(options);
    } catch (error: unknown) {
      logger.warn('Consent info update failed; using the stored consent', error);
    }
    let info: AdsConsentInfo;
    try {
      info = await sdk.AdsConsent.loadAndShowConsentFormIfRequired();
    } catch (error: unknown) {
      logger.warn('Consent form failed', error);
      info = await sdk.AdsConsent.getConsentInfo();
    }
    await applyConsent(sdk, info);
  } catch (error: unknown) {
    logger.warn('Ads could not start', error);
  } finally {
    phase = 'done';
  }
};

/**
 * Call once after the first frame. Starts the consent flow now when the player's next level is 5
 * or later, otherwise as soon as a level-mode session at level 5 or later starts. Does nothing
 * where the AdMob native module is missing. Returns the cleanup function.
 */
export const startAdsWhenEligible = (): (() => void) => {
  if (phase !== 'idle' || !hasAdsNativeModule()) return () => undefined;
  if (reachedAdsStartLevel(useProgressStore.getState().level)) {
    void runConsentFlow();
    return () => undefined;
  }
  phase = 'waiting';
  const unsubscribe = useGameStore.subscribe((state) => {
    const session = state.session;
    if (
      phase === 'waiting' &&
      session !== null &&
      session.mode === 'level' &&
      reachedAdsStartLevel(session.levelNumber)
    ) {
      unsubscribe();
      void runConsentFlow();
    }
  });
  return () => {
    unsubscribe();
    if (phase === 'waiting') phase = 'idle';
  };
};

/** UMP's latest answer, or null before the consent flow ran. */
export const getConsentState = (): ConsentState | null => consent;

/** Settings shows "Ad privacy options" only while this is true. */
export const isPrivacyOptionsRequired = (): boolean => consent?.privacyOptionsRequired ?? false;

export const subscribeConsent = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Opens UMP's privacy options form and applies the new choice. False when it could not open. */
export const showPrivacyOptions = async (): Promise<boolean> => {
  if (!isPrivacyOptionsRequired()) return false;
  try {
    const sdk = await loadSdk();
    const info = await sdk.AdsConsent.showPrivacyOptionsForm();
    await applyConsent(sdk, info);
    return true;
  } catch (error: unknown) {
    logger.warn('Privacy options form failed', error);
    return false;
  }
};
