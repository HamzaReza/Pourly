/**
 * Optional Google sign-in (spec §26.2, §26.3). The game never waits for it: the player is a guest
 * until Firebase Auth restores a session (after the first frame) or they sign in from Settings or
 * the Home card.
 *
 * Signed in:  RevenueCat `logIn(uid)` → cloud save pull/merge/push → server grants listener.
 * Sign out:   listeners stop → final push → RevenueCat `logOut()` → Firebase and Google sign-out.
 *             Local progress stays on the device as the guest copy.
 * Delete:     fresh Google credential → `reauthenticateWithCredential` → `deleteMyAccount`
 *             callable → local sign-out → Reset progress (purchases kept, as in phase 6).
 *
 * Fulfillment asks `isPurchasesLinked()` (through `setSignedInResolver`): purchases go to the
 * server only once RevenueCat knows the player by their uid, otherwise the webhook could not find
 * them and the device grants as for a guest.
 *
 * Without the Firebase config or the Google Web client id the cloud is disabled: every action
 * here is a no-op and Settings shows "Sign-in unavailable in this build".
 */
import type { User } from 'firebase/auth';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { useCloudStore } from '@/state/cloudStore';
import { resetAllProgress } from '@/state/metaFlow';
import { useProgressStore } from '@/state/progressStore';
import { showToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import { track, type SignInFailureReason } from './analytics';
import { startCloudSession, stopCloudSession, stopCloudSessionNow } from './cloudSave';
import { getFirebase, isCloudConfigured, type FirebaseServices } from './firebase';
import { setSignedInResolver } from './fulfillment';
import { requestGoogleIdToken, signOutOfGoogle, type GoogleFailure } from './googleSignIn';
import { startGrantsListener } from './grants';
import { logInPurchases, logOutPurchases } from './purchasesIdentity';

export interface AuthUser {
  readonly uid: string;
  readonly email: string | null;
  readonly displayName: string | null;
}

export type AuthStatus = 'guest' | 'signedIn';

export type AuthAction = 'signIn' | 'signOut' | 'delete';

export interface AuthState {
  /** Cloud features exist in this build (Firebase config and Web client id present). */
  readonly available: boolean;
  readonly status: AuthStatus;
  readonly user: AuthUser | null;
  /** RevenueCat identifies the player by their uid (server fulfillment can reach them). */
  readonly purchasesLinked: boolean;
  /** The account action running now, if any. */
  readonly pending: AuthAction | null;
}

export type AccountActionResult = 'done' | 'cancelled' | 'failed' | 'busy' | 'unavailable';

const GUEST = { status: 'guest', user: null, purchasesLinked: false } as const;

export const useAuthStore = create<AuthState>(() => ({
  available: isCloudConfigured(),
  ...GUEST,
  pending: null,
}));

const auth = () => useAuthStore.getState();
const setAuth = (changes: Partial<AuthState>): void => useAuthStore.setState(changes);

/** Whether signed-in purchases are fulfilled by the server right now. */
export const isPurchasesLinked = (): boolean => auth().purchasesLinked;

// ---------------------------------------------------------------------------------------------
// Session (signed-in side effects)
// ---------------------------------------------------------------------------------------------

let activeUid: string | null = null;
let entering: Promise<void> | null = null;
let stopGrants: () => void = () => undefined;

const toAuthUser = (user: User): AuthUser => ({
  uid: user.uid,
  email: user.email,
  displayName: user.displayName,
});

const linkPurchases = async (uid: string): Promise<void> => {
  const linked = await logInPurchases(uid);
  if (activeUid === uid) setAuth({ purchasesLinked: linked });
};

/** Starts everything a signed-in player has (idempotent per uid). */
const enterSignedIn = (user: User, services: FirebaseServices): Promise<void> => {
  if (activeUid === user.uid && entering !== null) return entering;
  const uid = user.uid;
  activeUid = uid;
  setAuth({ status: 'signedIn', user: toAuthUser(user), purchasesLinked: false });
  entering = (async () => {
    await linkPurchases(uid);
    if (activeUid !== uid) return;
    await startCloudSession(uid, services);
    if (activeUid !== uid) return;
    stopGrants();
    stopGrants = startGrantsListener(uid, services);
  })().catch((error: unknown) => logger.warn('Signed-in session could not start', error));
  return entering;
};

/** Stops the signed-in side effects without any network call. */
const leaveSignedInNow = (): void => {
  activeUid = null;
  entering = null;
  stopGrants();
  stopGrants = () => undefined;
  stopCloudSessionNow();
  setAuth(GUEST);
};

/**
 * Restores the Firebase session after launch (never blocks it) and keeps the state in sync with
 * Firebase Auth. Call after the first frame; returns the cleanup.
 */
export const startAuth = (): (() => void) => {
  setSignedInResolver(isPurchasesLinked);
  if (!auth().available) {
    void getFirebase();
    return () => undefined;
  }
  let cancelled = false;
  let unsubscribe: () => void = () => undefined;
  getFirebase()
    .then((services) => {
      if (services === null || cancelled) return;
      unsubscribe = services.sdk.auth.onAuthStateChanged(services.auth, (user) => {
        if (user !== null) {
          void enterSignedIn(user, services);
        } else if (activeUid !== null && auth().pending === null) {
          // The session ended outside the app's own sign-out (revoked or expired token).
          leaveSignedInNow();
        }
      });
    })
    .catch((error: unknown) => logger.warn('Auth could not start', error));
  // RevenueCat logIn needs the network; retry it when the app comes back.
  const subscription = AppState.addEventListener('change', (state) => {
    const { status, purchasesLinked, user } = auth();
    if (state === 'active' && status === 'signedIn' && !purchasesLinked && user !== null) {
      void linkPurchases(user.uid);
    }
  });
  return () => {
    cancelled = true;
    unsubscribe();
    subscription.remove();
    leaveSignedInNow();
  };
};

// ---------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------

const firebaseCode = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';

const NETWORK_CODES: readonly string[] = [
  'auth/network-request-failed',
  'functions/unavailable',
  'functions/deadline-exceeded',
];

const SIGN_IN_TOASTS = {
  playServices: 'account.toast.playServices',
  network: 'account.toast.network',
  inProgress: 'account.toast.inProgress',
  unavailable: 'account.toast.unavailable',
  unknown: 'account.toast.signInFailed',
} as const satisfies Record<GoogleFailure, string>;

const failSignIn = (reason: Exclude<SignInFailureReason, 'cancelled'>): AccountActionResult => {
  showToast(SIGN_IN_TOASTS[reason]);
  track('sign_in_failed', { method: 'google', reason });
  return reason === 'unavailable' ? 'unavailable' : 'failed';
};

/** Runs an account action unless another one is running. */
const exclusive = async (
  action: AuthAction,
  run: (services: FirebaseServices) => Promise<AccountActionResult>,
): Promise<AccountActionResult> => {
  if (!auth().available) {
    showToast('account.toast.unavailable');
    return 'unavailable';
  }
  if (auth().pending !== null) return 'busy';
  setAuth({ pending: action });
  try {
    const services = await getFirebase();
    if (services === null) {
      showToast('account.toast.unavailable');
      return 'unavailable';
    }
    return await run(services);
  } finally {
    setAuth({ pending: null });
  }
};

// ---------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------

/**
 * Sign in with Google: Play services check → account picker → ID token → Firebase credential →
 * RevenueCat logIn (guest purchases transfer) → cloud save pull/merge/push → grants listener.
 * A cancel is silent; every failure has its own toast.
 */
export const signInWithGoogle = (): Promise<AccountActionResult> =>
  exclusive('signIn', async (services) => {
    if (auth().status === 'signedIn') return 'done';
    const token = await requestGoogleIdToken();
    if (token.kind === 'cancelled') {
      track('sign_in_failed', { method: 'google', reason: 'cancelled' });
      return 'cancelled';
    }
    if (token.kind === 'failed') return failSignIn(token.reason);
    try {
      const { GoogleAuthProvider, signInWithCredential } = services.sdk.auth;
      const credential = GoogleAuthProvider.credential(token.idToken);
      const { user } = await signInWithCredential(services.auth, credential);
      await enterSignedIn(user, services);
    } catch (error: unknown) {
      logger.warn('Firebase sign-in failed', error);
      return failSignIn(NETWORK_CODES.includes(firebaseCode(error)) ? 'network' : 'unknown');
    }
    track('sign_in_success', { method: 'google' });
    showToast('account.toast.signedIn');
    return 'done';
  });

/** Ends the account session on this device; local progress stays as the guest copy. */
const endSession = async (services: FirebaseServices, revokeGoogle: boolean): Promise<void> => {
  await logOutPurchases();
  leaveSignedInNow();
  try {
    await services.sdk.auth.signOut(services.auth);
  } catch (error: unknown) {
    logger.warn('Firebase sign-out failed', error);
  }
  await signOutOfGoogle(revokeGoogle);
};

/** Sign out: stop listening, push what is pending, then sign out of RevenueCat, Firebase, Google. */
export const signOut = (): Promise<AccountActionResult> =>
  exclusive('signOut', async (services) => {
    if (auth().status !== 'signedIn') return 'done';
    stopGrants();
    stopGrants = () => undefined;
    await stopCloudSession();
    await endSession(services, false);
    track('sign_out', { method: 'google' });
    showToast('account.toast.signedOut');
    return 'done';
  });

/**
 * Deletes the account and its cloud data (Google Play requirement). Asks Google for a fresh
 * credential, re-authenticates, calls `deleteMyAccount`, signs out locally and resets local
 * progress with the phase-6 rules (purchases are kept).
 */
export const deleteAccount = (): Promise<AccountActionResult> =>
  exclusive('delete', async (services) => {
    const current = services.auth.currentUser;
    if (current === null || auth().status !== 'signedIn') return 'failed';
    const token = await requestGoogleIdToken();
    if (token.kind === 'cancelled') return 'cancelled';
    if (token.kind === 'failed') {
      showToast(SIGN_IN_TOASTS[token.reason]);
      return 'failed';
    }
    const { GoogleAuthProvider, reauthenticateWithCredential } = services.sdk.auth;
    try {
      await reauthenticateWithCredential(current, GoogleAuthProvider.credential(token.idToken));
    } catch (error: unknown) {
      logger.warn('Re-authentication failed', error);
      const code = firebaseCode(error);
      showToast(
        code === 'auth/user-mismatch'
          ? 'account.toast.wrongAccount'
          : NETWORK_CODES.includes(code)
            ? 'account.toast.network'
            : 'account.toast.deleteFailed',
      );
      return 'failed';
    }

    // Nothing may write to the account while it is being deleted.
    stopGrants();
    stopGrants = () => undefined;
    stopCloudSessionNow();
    try {
      const deleteMyAccount = services.sdk.functions.httpsCallable(
        services.functions,
        'deleteMyAccount',
      );
      await deleteMyAccount();
    } catch (error: unknown) {
      logger.warn('deleteMyAccount failed', error);
      showToast(
        NETWORK_CODES.includes(firebaseCode(error))
          ? 'account.toast.network'
          : 'account.toast.deleteFailed',
      );
      // Still signed in: resume the session.
      activeUid = null;
      entering = null;
      void enterSignedIn(current, services);
      return 'failed';
    }

    await endSession(services, true);
    await resetAllProgress();
    useProgressStore.getState().setSyncBaseline(null);
    useCloudStore.getState().forgetAccount();
    track('account_deleted', { method: 'google' });
    showToast('account.toast.deleted');
    return 'done';
  });
