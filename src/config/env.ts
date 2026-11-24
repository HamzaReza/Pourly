import Constants from 'expo-constants';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface PublicEnv {
  revenueCatAndroidKey: string;
  admobRewardedAndroid: string;
  admobInterstitialAndroid: string;
  adsUseTestIds: boolean;
  privacyUrl: string;
  termsUrl: string;
  supportEmail: string;
  googleWebClientId: string;
  firebase: FirebaseWebConfig;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (source: Record<string, unknown>, key: string): string => {
  const value = source[key];
  return typeof value === 'string' ? value : '';
};

/**
 * Reads the public values that `app.config.ts` copies from `EXPO_PUBLIC_*` env vars into `extra`.
 * Missing or malformed values become empty strings so callers can switch features off cleanly.
 */
export const parsePublicEnv = (extra: unknown): PublicEnv => {
  const source = isRecord(extra) ? extra : {};
  const firebase = isRecord(source.firebase) ? source.firebase : {};
  return {
    revenueCatAndroidKey: str(source, 'revenueCatAndroidKey'),
    admobRewardedAndroid: str(source, 'admobRewardedAndroid'),
    admobInterstitialAndroid: str(source, 'admobInterstitialAndroid'),
    adsUseTestIds: source.adsUseTestIds === true,
    privacyUrl: str(source, 'privacyUrl'),
    termsUrl: str(source, 'termsUrl'),
    supportEmail: str(source, 'supportEmail'),
    googleWebClientId: str(source, 'googleWebClientId'),
    firebase: {
      apiKey: str(firebase, 'apiKey'),
      authDomain: str(firebase, 'authDomain'),
      projectId: str(firebase, 'projectId'),
      storageBucket: str(firebase, 'storageBucket'),
      messagingSenderId: str(firebase, 'messagingSenderId'),
      appId: str(firebase, 'appId'),
    },
  };
};

export const PUBLIC_ENV: PublicEnv = parsePublicEnv(Constants.expoConfig?.extra);
