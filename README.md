# Pourly

**Pourly: Water Sort Puzzle** is a hybrid-casual color-sort puzzle for Android, built with Expo and
React Native. Pour liquid between tubes until every tube holds a single color. Meta systems (daily
challenge, streaks, gifts, coins, themes) sit on top. The game is fully playable offline and as a
guest; Google sign-in with Firebase cloud save is optional.

- Product spec: [`docs/SPEC.md`](docs/SPEC.md)
- Deviations and decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md) (wins over the spec)

Platform: **Android only.**

## Prerequisites

- Node.js 20.19+ (developed on 22.23)
- Yarn classic 1.22.x (`yarn.lock` is the only lockfile; do not use npm or pnpm)
- Android Studio with an emulator or a device, for development builds
- An [EAS](https://expo.dev/eas) account for cloud builds

## Setup

```bash
yarn install
cp .env.example .env   # then fill in the values you have
yarn android           # builds and installs the development client (expo run:android)
yarn start             # starts Metro for an installed development client
```

A development build (`expo-dev-client`) is required: AdMob, RevenueCat and Google Sign-In are
native modules. Expo Go is only good for quick UI checks.

Add Expo/React Native packages with `npx expo install <pkg>` so versions stay aligned with the SDK.

## Environment

All configuration comes from environment variables (see `.env.example`). Never commit `.env`.

| Variable                                                                          | Purpose                                                                                              |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ANDROID_PACKAGE`                                                                 | Android application id. Default `com.pourly.water.app`. **Permanent once published on Google Play.** |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`                                              | RevenueCat public Android SDK key.                                                                   |
| `EXPO_PUBLIC_ADMOB_ANDROID_APP_ID`                                                | AdMob app id, written into the Android manifest at prebuild. Defaults to Google's sample id.         |
| `EXPO_PUBLIC_ADMOB_REWARDED_ANDROID` / `EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID`   | Production ad unit ids. Development builds always use Google test ids.                               |
| `EXPO_PUBLIC_PRIVACY_URL` / `EXPO_PUBLIC_TERMS_URL` / `EXPO_PUBLIC_SUPPORT_EMAIL` | Legal links and support address.                                                                     |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`                                                | OAuth web client id for Google Sign-In.                                                              |
| `EXPO_PUBLIC_FIREBASE_*`                                                          | Firebase JS SDK web config.                                                                          |

`app.config.ts` copies the public values into `extra`; the app reads them through
`src/config/env.ts`. Values are baked in at build time.

## Scripts

| Script                       | What it does                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| `yarn start`                 | Start Metro.                                                                         |
| `yarn android`               | Build and run the Android development client (`expo run:android`).                   |
| `yarn lint`                  | ESLint (flat config, `eslint-config-expo`).                                          |
| `yarn typecheck`             | `tsc --noEmit` (strict).                                                             |
| `yarn test` / `yarn test:ci` | Jest with the `jest-expo` preset.                                                    |
| `yarn format`                | Prettier.                                                                            |
| `yarn doctor`                | `expo-doctor`.                                                                       |
| `yarn export:android`        | Export the Android JS bundle (`dist/`, gitignored).                                  |
| `yarn prebuild:android`      | Regenerate the native `android/` project (gitignored; Continuous Native Generation). |

## EAS build profiles

| Profile       | Output        | Notes                                                       |
| ------------- | ------------- | ----------------------------------------------------------- |
| `development` | APK, internal | Development client.                                         |
| `preview`     | APK, internal | Release mode for performance testing, Google test ad ids.   |
| `production`  | AAB, store    | `autoIncrement` version code; app version source is remote. |

## Project layout

```
app/          Expo Router routes (Home, game, daily, shop, themes, settings)
src/config/   economy, products, ads, env, constants
src/i18n/     i18next setup and locale JSON files
src/state/    Zustand stores (persisted), models and migrations
src/ui/       design tokens and shared components
src/utils/    date helpers, logger
docs/         spec and decisions
```

## Resolved versions

| Package                                   | Version |
| ----------------------------------------- | ------- |
| Expo SDK (`expo`)                         | 58.0.26 |
| React Native                              | 0.88.1  |
| React                                     | 19.3.0  |
| expo-router                               | 58.0.32 |
| react-native-reanimated                   | 4.7.1   |
| react-native-worklets                     | 0.13.0  |
| @shopify/react-native-skia                | 2.14.0  |
| react-native-gesture-handler              | 3.3.0   |
| react-native-screens                      | 4.30.1  |
| react-native-safe-area-context            | 5.11.1  |
| expo-notifications                        | 58.1.9  |
| expo-audio                                | 58.0.12 |
| expo-haptics                              | 58.0.8  |
| expo-localization                         | 58.0.5  |
| expo-dev-client                           | 58.0.21 |
| expo-build-properties                     | 58.0.12 |
| @react-native-async-storage/async-storage | 2.2.0   |
| zustand                                   | 5.1.0   |
| i18next                                   | 27.2.7  |
| react-i18next                             | 18.0.3  |
| react-native-purchases                    | 11.0.4  |
| react-native-google-mobile-ads            | 17.4.0  |
| firebase                                  | 12.19.0 |
| @react-native-google-signin/google-signin | 17.0.0  |
| @expo/vector-icons                        | 15.1.1  |
| TypeScript                                | 6.0.3   |
| Jest                                      | 30.5.2  |
| jest-expo                                 | 58.0.15 |
| @testing-library/react-native             | 14.1.0  |
| ESLint                                    | 9.39.5  |
| eslint-config-expo                        | 58.0.4  |
| Prettier                                  | 3.10.1  |
| tsx                                       | 4.23.15 |
| sharp                                     | 0.35.5  |
