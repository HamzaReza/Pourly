import type { ConfigContext, ExpoConfig } from 'expo/config';

const ADMOB_SAMPLE_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const DEFAULT_ANDROID_PACKAGE = 'com.pourly.water.app';

const env = (value: string | undefined, fallback = ''): string =>
  value && value.trim().length > 0 ? value.trim() : fallback;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Pourly',
  slug: 'pourly',
  owner: 'hamzareza',
  scheme: 'pourly',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  userInterfaceStyle: 'automatic',
  platforms: ['android'],
  android: {
    package: env(process.env.ANDROID_PACKAGE, DEFAULT_ANDROID_PACKAGE),
    adaptiveIcon: {
      backgroundColor: '#16294A',
      foregroundImage: './assets/images/adaptive-icon-foreground.png',
      backgroundImage: './assets/images/adaptive-icon-background.png',
      monochromeImage: './assets/images/adaptive-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0E1A2B',
        image: './assets/images/splash-icon.png',
        imageWidth: 240,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
          // R8 stripped WorkManager's Room-generated WorkDatabase_Impl (Room loads it by
          // reflection), crashing release builds at startup. Keep Room databases intact.
          extraProguardRules: [
            '-keep class * extends androidx.room.RoomDatabase { <init>(); }',
            '-keep class androidx.work.impl.WorkDatabase_Impl { *; }',
            '-keep class androidx.work.impl.** { *; }',
          ].join('\n'),
        },
      },
    ],
    [
      'expo-notifications',
      {
        // White-on-transparent status-bar icon; the color is the app accent (`colors.accent`).
        icon: './assets/images/notification-icon.png',
        color: '#2EC4FF',
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
    eas: { projectId: 'c7edd0b8-bebc-4839-b056-048f472db3bd' },
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
