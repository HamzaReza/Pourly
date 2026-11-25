/**
 * Firebase JS SDK access (owner decision O2: the JS SDK, config from `EXPO_PUBLIC_FIREBASE_*`, no
 * google-services.json). Nothing is loaded at import time: the SDK modules are imported on first
 * use, after the first frame, so launch, Expo Go and Jest never touch them.
 *
 * When the Firebase config or the Google Web client id is missing, the cloud is **disabled**: the
 * game runs fully as a guest, Settings says sign-in is unavailable and nothing here loads.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { Functions } from 'firebase/functions';

import { PUBLIC_ENV, type PublicEnv } from '@/config/env';
import { logger } from '@/utils/logger';

/** Region of the Cloud Functions (`functions/src/index.ts`). */
export const FUNCTIONS_REGION = 'us-central1';

export type FirebaseAppModule = typeof import('firebase/app');
export type FirebaseAuthModule = typeof import('firebase/auth');
export type FirestoreModule = typeof import('firebase/firestore');
export type FunctionsModule = typeof import('firebase/functions');

/** The SDK modules the app uses, loaded together. */
export interface FirebaseModules {
  readonly app: FirebaseAppModule;
  readonly auth: FirebaseAuthModule;
  readonly firestore: FirestoreModule;
  readonly functions: FunctionsModule;
  readonly storage: typeof import('@react-native-async-storage/async-storage').default;
}

/** Initialized SDK instances plus the modular functions to call on them. */
export interface FirebaseServices {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Firestore;
  readonly functions: Functions;
  readonly sdk: FirebaseModules;
}

const REQUIRED_FIREBASE_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;

/** The env keys missing for cloud features (empty when everything needed is set). */
export const missingCloudConfig = (env: PublicEnv): string[] => {
  const missing: string[] = REQUIRED_FIREBASE_KEYS.filter(
    (key) => env.firebase[key].length === 0,
  ).map((key) => `firebase.${key}`);
  if (env.googleWebClientId.length === 0) missing.push('googleWebClientId');
  return missing;
};

/** Whether this build has what Google sign-in and cloud save need. */
export const isCloudConfigured = (env: PublicEnv = PUBLIC_ENV): boolean =>
  missingCloudConfig(env).length === 0;

export type FirebaseLoader = () => Promise<FirebaseModules>;

const loadModules: FirebaseLoader = async () => {
  const [app, auth, firestore, functions, storage] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
    import('firebase/functions'),
    import('@react-native-async-storage/async-storage'),
  ]);
  return { app, auth, firestore, functions, storage: storage.default };
};

let loader: FirebaseLoader = loadModules;
let servicesPromise: Promise<FirebaseServices> | null = null;
let loggedDisabled = false;

/** Replaces the SDK loader (tests inject fakes; Jest has no dynamic `import()`). */
export const setFirebaseLoader = (next: FirebaseLoader): void => {
  loader = next;
  servicesPromise = null;
};

const initialize = async (env: PublicEnv): Promise<FirebaseServices> => {
  const sdk = await loader();
  const existing = sdk.app.getApps()[0];
  const app = existing ?? sdk.app.initializeApp({ ...env.firebase });
  // `initializeAuth` may run only once per app; a second call (fast refresh) throws, so reuse it.
  const auth =
    existing === undefined
      ? sdk.auth.initializeAuth(app, {
          persistence: sdk.auth.getReactNativePersistence(sdk.storage),
        })
      : sdk.auth.getAuth(app);
  // The JS SDK's WebChannel transport is unreliable on React Native; long polling always works.
  const db =
    existing === undefined
      ? sdk.firestore.initializeFirestore(app, { experimentalForceLongPolling: true })
      : sdk.firestore.getFirestore(app);
  const functions = sdk.functions.getFunctions(app, FUNCTIONS_REGION);
  return { app, auth, db, functions, sdk };
};

/**
 * The initialized Firebase services, or null when the cloud is disabled in this build or the SDK
 * cannot load. Never throws.
 */
export const getFirebase = async (
  env: PublicEnv = PUBLIC_ENV,
): Promise<FirebaseServices | null> => {
  if (!isCloudConfigured(env)) {
    if (!loggedDisabled) {
      loggedDisabled = true;
      logger.info(
        'Cloud disabled: sign-in and cloud save are off in this build. Missing:',
        missingCloudConfig(env).join(', '),
      );
    }
    return null;
  }
  servicesPromise ??= initialize(env);
  try {
    return await servicesPromise;
  } catch (error: unknown) {
    logger.warn('Firebase could not start', error);
    servicesPromise = null;
    return null;
  }
};
