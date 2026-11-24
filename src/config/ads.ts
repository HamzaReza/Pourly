import { PUBLIC_ENV } from './env';

export const REWARDED_PLACEMENTS = {
  HINT: 'HINT',
  UNDO: 'UNDO',
  EXTRA_TUBE: 'EXTRA_TUBE',
  DOUBLE_COINS: 'DOUBLE_COINS',
  DAILY_GIFT_X2: 'DAILY_GIFT_X2',
  FREE_COINS: 'FREE_COINS',
  SKIP_LEVEL: 'SKIP_LEVEL',
} as const;

export type RewardedPlacement = (typeof REWARDED_PLACEMENTS)[keyof typeof REWARDED_PLACEMENTS];

export type AdFormat = 'rewarded' | 'interstitial';

export interface TestUnitIds {
  rewarded: string;
  interstitial: string;
}

export interface AdUnitIdOptions {
  isDev: boolean;
  useTestIds: boolean;
  rewarded: string;
  interstitial: string;
  /** Called only when a test unit is needed. */
  getTestIds: () => Promise<TestUnitIds>;
}

/**
 * Resolves the ad unit id for a format. Development builds and builds with
 * `EXPO_PUBLIC_ADS_USE_TEST_IDS=true` use Google's test units; otherwise the production unit from
 * env. Resolves null when no production unit is configured, which disables that format.
 */
export const resolveAdUnitId = async (
  format: AdFormat,
  options: AdUnitIdOptions,
): Promise<string | null> => {
  if (options.isDev || options.useTestIds) {
    const testIds = await options.getTestIds();
    return format === 'rewarded' ? testIds.rewarded : testIds.interstitial;
  }
  const unitId = format === 'rewarded' ? options.rewarded : options.interstitial;
  return unitId.length > 0 ? unitId : null;
};

/**
 * Loads `TestIds` on demand: importing the package root resolves its native TurboModule
 * immediately, which throws where the native module is absent (Expo Go, Jest).
 */
const loadTestIds = async (): Promise<TestUnitIds> => {
  const { TestIds } = await import('react-native-google-mobile-ads');
  return { rewarded: TestIds.REWARDED, interstitial: TestIds.INTERSTITIAL };
};

export const getAdUnitId = (format: AdFormat): Promise<string | null> =>
  resolveAdUnitId(format, {
    isDev: __DEV__,
    useTestIds: PUBLIC_ENV.adsUseTestIds,
    rewarded: PUBLIC_ENV.admobRewardedAndroid,
    interstitial: PUBLIC_ENV.admobInterstitialAndroid,
    getTestIds: loadTestIds,
  });
