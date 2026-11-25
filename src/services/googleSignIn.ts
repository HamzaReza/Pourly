/**
 * Google account picker (`@react-native-google-signin/google-signin` v17, verified against its
 * `lib/typescript` definitions and Android sources). The package resolves its native module with
 * `TurboModuleRegistry.getEnforcing` at import time, so it is imported lazily and only when the
 * native module exists (never in Expo Go or Jest).
 *
 * v17 behaviour used here: `signIn()` resolves `{ type: 'success', data }` or
 * `{ type: 'cancelled' }` (a cancel no longer rejects); `data.idToken` is set because
 * `configure({ webClientId })` requests an ID token for the Firebase Web client. Rejections carry
 * a string `code`: `PLAY_SERVICES_NOT_AVAILABLE`, `ASYNC_OP_IN_PROGRESS` (`statusCodes.IN_PROGRESS`)
 * or a Google Play services status code such as `7` (NETWORK_ERROR).
 */
import { TurboModuleRegistry } from 'react-native';

import { PUBLIC_ENV } from '@/config/env';
import { logger } from '@/utils/logger';

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

/** Why the Google step failed (each has its own toast). */
export type GoogleFailure = 'playServices' | 'network' | 'inProgress' | 'unavailable' | 'unknown';

export type GoogleTokenResult =
  | { readonly kind: 'success'; readonly idToken: string }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly reason: GoogleFailure };

/** Google Play services `CommonStatusCodes.NETWORK_ERROR`. */
const NETWORK_ERROR_CODE = '7';

export type GoogleSignInLoader = () => Promise<GoogleSignInModule | null>;

const loadGoogleSignIn: GoogleSignInLoader = async () => {
  if (TurboModuleRegistry.get('RNGoogleSignin') == null) return null;
  return import('@react-native-google-signin/google-signin');
};

let loader: GoogleSignInLoader = loadGoogleSignIn;
let modulePromise: Promise<GoogleSignInModule | null> | null = null;

/** Replaces the module loader (tests). */
export const setGoogleSignInLoader = (next: GoogleSignInLoader): void => {
  loader = next;
  modulePromise = null;
};

const ready = (): Promise<GoogleSignInModule | null> => {
  modulePromise ??= loader()
    .then((module) => {
      module?.GoogleSignin.configure({ webClientId: PUBLIC_ENV.googleWebClientId });
      return module;
    })
    .catch((error: unknown) => {
      logger.warn('Google Sign-In could not load', error);
      modulePromise = null;
      return null;
    });
  return modulePromise;
};

const errorCode = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';

/** Maps a rejected Google call to a failure reason. */
export const classifyGoogleError = (
  error: unknown,
  codes: { readonly playServices: string; readonly inProgress: string },
): GoogleFailure => {
  const code = errorCode(error);
  if (code === codes.playServices) return 'playServices';
  if (code === codes.inProgress) return 'inProgress';
  if (code === NETWORK_ERROR_CODE) return 'network';
  return 'unknown';
};

/**
 * Opens the Google account picker and returns a fresh ID token for Firebase. Checks Play services
 * first (offering Google's update dialog when they are outdated).
 */
export const requestGoogleIdToken = async (): Promise<GoogleTokenResult> => {
  const module = await ready();
  if (module === null) return { kind: 'failed', reason: 'unavailable' };
  const { GoogleSignin, isSuccessResponse, statusCodes } = module;
  const codes = {
    playServices: statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
    inProgress: statusCodes.IN_PROGRESS,
  };
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  } catch (error: unknown) {
    logger.warn('Google Play services unavailable', error);
    return { kind: 'failed', reason: 'playServices' };
  }
  try {
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { kind: 'cancelled' };
    const idToken = response.data.idToken;
    if (idToken === null || idToken.length === 0) {
      logger.warn('Google sign-in returned no ID token (check the Web client id)');
      return { kind: 'failed', reason: 'unknown' };
    }
    return { kind: 'success', idToken };
  } catch (error: unknown) {
    logger.warn('Google sign-in failed', error);
    return { kind: 'failed', reason: classifyGoogleError(error, codes) };
  }
};

/**
 * Signs out of the Google account on this device (and, with `revoke`, removes Pourly's access to
 * it). Failures are logged only: the Firebase session is what matters.
 */
export const signOutOfGoogle = async (revoke: boolean): Promise<void> => {
  const module = await ready();
  if (module === null) return;
  try {
    if (revoke) await module.GoogleSignin.revokeAccess();
    await module.GoogleSignin.signOut();
  } catch (error: unknown) {
    logger.warn('Google sign-out failed', error);
  }
};
