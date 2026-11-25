import type { ConfigContext, ExpoConfig } from 'expo/config';

const ADMOB_SAMPLE_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const DEFAULT_ANDROID_PACKAGE = 'com.pourly.water.app';

const env = (value: string | undefined, fallback = ''): string =>
  value && value.trim().length > 0 ? value.trim() : fallback;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Pourly',
  slug: 'pourly',
  scheme: 'pourly',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  platforms: ['android'],
  android: {
    package: env(process.env.ANDROID_PACKAGE, DEFAULT_ANDROID_PACKAGE),
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        image: './assets/images/splash-icon.png',
        imageWidth: 76,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/android-icon-monochrome.png',
        color: '#208AEF',
      },
    ],
    'expo-localization',
    [
      'expo-audio',
      {
        recordAudioAndroid: false,
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ],
    'expo-status-bar',
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: env(
          process.env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID,
          ADMOB_SAMPLE_ANDROID_APP_ID,
        ),
      },
    ],
    'expo-dev-client',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    revenueCatAndroidKey: env(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY),
    admobRewardedAndroid: env(process.env.EXPO_PUBLIC_ADMOB_REWARDED_ANDROID),
    admobInterstitialAndroid: env(process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID),
    adsUseTestIds: env(process.env.EXPO_PUBLIC_ADS_USE_TEST_IDS) === 'true',
    umpDebugEea: env(process.env.EXPO_PUBLIC_UMP_DEBUG_EEA) === 'true',
    privacyUrl: env(process.env.EXPO_PUBLIC_PRIVACY_URL),
    termsUrl: env(process.env.EXPO_PUBLIC_TERMS_URL),
    supportEmail: env(process.env.EXPO_PUBLIC_SUPPORT_EMAIL),
    googleWebClientId: env(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
    firebase: {
      apiKey: env(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
      authDomain: env(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
      projectId: env(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
      storageBucket: env(process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET),
      messagingSenderId: env(process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
      appId: env(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
    },
  },
});
