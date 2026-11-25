/**
 * AdMob provider (`react-native-google-mobile-ads` v17.4, classic create → load → show API,
 * verified against the installed sources). Rewarded and interstitial only; no banners.
 *
 * - One rewarded and one interstitial ad are kept loaded. A closed ad is loaded again at once.
 * - A failed load retries with exponential backoff (1 s, 2 s, 4 s … capped at 60 s) and reports
 *   `ad_load_failed`.
 * - A rewarded ad resolves `earned` only when `EARNED_REWARD` fired before it closed; closing
 *   early resolves `dismissed`. Show promises settle on `CLOSED` (or a show-phase `ERROR`), so the
 *   caller's audio pause lasts for the whole ad.
 * - A format without a unit id (a release build missing its production id) stays disabled.
 *
 * The SDK module is passed in by `consent.ts` after it was imported lazily and initialized; this
 * file only imports its types, so it loads in Jest and Expo Go.
 */
import type { AdFormat, RewardedPlacement } from '@/config/ads';
import { logger } from '@/utils/logger';

import type { AdsProvider, RewardedResult } from './ads';

type GmaModule = typeof import('react-native-google-mobile-ads');

/** The parts of the SDK this provider uses. */
export type AdmobSdk = Pick<
  GmaModule,
  'RewardedAd' | 'InterstitialAd' | 'AdEventType' | 'RewardedAdEventType'
>;

type RewardedAdInstance = ReturnType<GmaModule['RewardedAd']['createForAdRequest']>;
type InterstitialAdInstance = ReturnType<GmaModule['InterstitialAd']['createForAdRequest']>;

export const AD_RETRY_BASE_MS = 1000;
export const AD_RETRY_MAX_MS = 60_000;

/** Delay before retry number `attempt` (1-based) after consecutive load failures. */
export const adRetryDelayMs = (attempt: number): number =>
  Math.min(AD_RETRY_MAX_MS, AD_RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1));

/** What both ad classes offer. */
interface FullScreenAd {
  load: () => void;
  show: () => Promise<void>;
}

type SlotStatus = 'idle' | 'resolving' | 'loading' | 'loaded' | 'showing' | 'retrying' | 'disabled';

interface ShowEnd {
  readonly shown: boolean;
  readonly earned: boolean;
}

interface Slot<A> {
  readonly format: AdFormat;
  ad: A | null;
  status: SlotStatus;
  failures: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  earned: boolean;
  endShow: ((end: ShowEnd) => void) | null;
}

export interface AdmobProviderOptions {
  readonly sdk: AdmobSdk;
  /** Resolves the unit id (test units in dev/preview); null disables the format. */
  readonly getUnitId: (format: AdFormat) => Promise<string | null>;
  /** Reports a failed load (`ad_load_failed`). */
  readonly onLoadFailed: (format: AdFormat, code: string) => void;
  readonly setTimer?: (run: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

const newSlot = <A>(format: AdFormat): Slot<A> => ({
  format,
  ad: null,
  status: 'idle',
  failures: 0,
  retryTimer: null,
  earned: false,
  endShow: null,
});

/** Creates the AdMob provider. Call after `mobileAds().initialize()` resolved. */
export const createAdmobAdsProvider = ({
  sdk,
  getUnitId,
  onLoadFailed,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}: AdmobProviderOptions): AdsProvider => {
  const rewarded = newSlot<RewardedAdInstance>('rewarded');
  const interstitial = newSlot<InterstitialAdInstance>('interstitial');

  const onLoaded = (slot: Slot<FullScreenAd>): void => {
    slot.status = 'loaded';
    slot.failures = 0;
  };

  const finishShow = (slot: Slot<FullScreenAd>, shown: boolean): void => {
    const end = slot.endShow;
    slot.endShow = null;
    slot.status = 'idle';
    const earned = slot.earned;
    slot.earned = false;
    end?.({ shown, earned });
  };

  const scheduleRetry = (slot: Slot<FullScreenAd>): void => {
    slot.failures += 1;
    slot.status = 'retrying';
    if (slot.retryTimer !== null) clearTimer(slot.retryTimer);
    slot.retryTimer = setTimer(() => {
      slot.retryTimer = null;
      if (slot.status !== 'retrying' || slot.ad === null) return;
      slot.status = 'loading';
      slot.ad.load();
    }, adRetryDelayMs(slot.failures));
  };

  const onError = (slot: Slot<FullScreenAd>, error: { code?: string; reason?: string }): void => {
    if (slot.status === 'showing') {
      finishShow(slot, slot.earned);
      load(slot);
      return;
    }
    onLoadFailed(slot.format, error.reason ?? error.code ?? 'unknown');
    scheduleRetry(slot);
  };

  const onClosed = (slot: Slot<FullScreenAd>): void => {
    finishShow(slot, true);
    load(slot);
  };

  const createRewarded = (unitId: string): RewardedAdInstance => {
    const ad = sdk.RewardedAd.createForAdRequest(unitId);
    ad.addAdEventListener(sdk.RewardedAdEventType.LOADED, () => onLoaded(rewarded));
    ad.addAdEventListener(sdk.RewardedAdEventType.EARNED_REWARD, () => {
      rewarded.earned = true;
    });
    ad.addAdEventListener(sdk.AdEventType.ERROR, (error) => onError(rewarded, error));
    ad.addAdEventListener(sdk.AdEventType.CLOSED, () => onClosed(rewarded));
    return ad;
  };

  const createInterstitial = (unitId: string): InterstitialAdInstance => {
    const ad = sdk.InterstitialAd.createForAdRequest(unitId);
    ad.addAdEventListener(sdk.AdEventType.LOADED, () => onLoaded(interstitial));
    ad.addAdEventListener(sdk.AdEventType.ERROR, (error) => onError(interstitial, error));
    ad.addAdEventListener(sdk.AdEventType.CLOSED, () => onClosed(interstitial));
    return ad;
  };

  /** Starts loading a slot unless it is busy, loaded, waiting to retry or disabled. */
  function load(slot: Slot<FullScreenAd>): void {
    if (slot.status !== 'idle') return;
    if (slot.ad !== null) {
      slot.status = 'loading';
      slot.ad.load();
      return;
    }
    slot.status = 'resolving';
    getUnitId(slot.format)
      .then((unitId) => {
        if (unitId === null) {
          logger.warn(`No ${slot.format} ad unit id in this build; the format is disabled`);
          slot.status = 'disabled';
          return;
        }
        slot.ad = slot.format === 'rewarded' ? createRewarded(unitId) : createInterstitial(unitId);
        slot.status = 'loading';
        slot.ad.load();
      })
      .catch((error: unknown) => {
        logger.warn(`The ${slot.format} ad could not be created`, error);
        slot.status = 'idle';
        scheduleRetry(slot);
      });
  }

  /** Shows a loaded slot; settles when the ad closes or fails to show. */
  const show = (slot: Slot<FullScreenAd>): Promise<ShowEnd> => {
    const ad = slot.ad;
    if (slot.status !== 'loaded' || ad === null) {
      return Promise.resolve({ shown: false, earned: false });
    }
    slot.status = 'showing';
    slot.earned = false;
    return new Promise<ShowEnd>((resolve) => {
      slot.endShow = resolve;
      ad.show().catch((error: unknown) => {
        logger.warn(`The ${slot.format} ad did not show`, error);
        if (slot.endShow === resolve) {
          finishShow(slot, false);
          load(slot);
        }
      });
    });
  };

  return {
    preload: () => {
      load(rewarded);
      load(interstitial);
    },
    isRewardedReady: () => rewarded.status === 'loaded',
    showRewarded: async (_placement: RewardedPlacement): Promise<RewardedResult> => {
      const end = await show(rewarded);
      if (!end.shown) return 'unavailable';
      return end.earned ? 'earned' : 'dismissed';
    },
    showInterstitial: async () => (await show(interstitial)).shown,
  };
};
