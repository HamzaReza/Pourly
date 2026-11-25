import { AppState, type AppStateStatus } from 'react-native';

import { track } from '@/services/analytics';
import {
  deleteAccount,
  isPurchasesLinked,
  signInWithGoogle,
  signOut,
  startAuth,
  useAuthStore,
} from '@/services/auth';
import { setFirebaseLoader } from '@/services/firebase';
import { fulfillTransaction } from '@/services/fulfillment';
import { setGoogleSignInLoader } from '@/services/googleSignIn';
import { setIapProvider } from '@/services/iap';
import { setPurchasesIdentityLoader } from '@/services/purchasesIdentity';
import { useCloudStore } from '@/state/cloudStore';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { currentToast, dismissToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import {
  createFakeGoogleSignIn,
  createFakeRevenueCatIdentity,
  GOOGLE_STATUS,
  googleError,
  type FakeGoogleSignIn,
  type FakeRevenueCatIdentity,
} from '../test-utils/fakeAccounts';
import {
  createFakeFirebase,
  fakeUser,
  settle,
  type FakeFirebase,
} from '../test-utils/fakeFirebase';
import { createFakeIap } from '../test-utils/fakeIap';

jest.mock('@/config/env', () => {
  const actual = jest.requireActual<typeof import('@/config/env')>('@/config/env');
  return {
    ...actual,
    PUBLIC_ENV: actual.parsePublicEnv({
      googleWebClientId: 'web-client.apps.googleusercontent.com',
      firebase: {
        apiKey: 'key',
        authDomain: 'pourly-test.firebaseapp.com',
        projectId: 'pourly-test',
        storageBucket: 'pourly-test.firebasestorage.app',
        messagingSenderId: '1',
        appId: '1:1:android:1',
      },
    }),
  };
});
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('@/state/levelLoader', () => ({ prepareLevel: jest.fn(() => Promise.resolve()) }));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const UID = 'uid-for-google-token';

let firebase: FakeFirebase;
let google: FakeGoogleSignIn;
let revenueCat: FakeRevenueCatIdentity;
let stopAuth: () => void = () => undefined;
let appStateHandlers: ((state: AppStateStatus) => void)[] = [];

const auth = () => useAuthStore.getState();
const progress = () => useProgressStore.getState();
const toastKey = () => currentToast()?.key ?? null;
const clearToasts = () => {
  for (let toast = currentToast(); toast !== null; toast = currentToast()) dismissToast(toast.id);
};
const foreground = async () => {
  for (const handler of appStateHandlers) handler('active');
  await settle();
};

const signIn = async () => {
  const result = await signInWithGoogle();
  await settle();
  return result;
};

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
  appStateHandlers = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    appStateHandlers.push(handler as (state: AppStateStatus) => void);
    return { remove: jest.fn() };
  });
  firebase = createFakeFirebase();
  google = createFakeGoogleSignIn();
  revenueCat = createFakeRevenueCatIdentity();
  setFirebaseLoader(() => Promise.resolve(firebase.modules));
  setGoogleSignInLoader(() => Promise.resolve(google.module));
  setPurchasesIdentityLoader(() => Promise.resolve(revenueCat.module));
  setIapProvider(createFakeIap('revenuecat'));
  useProgressStore.setState({ ...createDefaultProgress(NOW), coins: 300 });
  useCloudStore.setState({ installId: 'install-a', dirty: false, lastPushAt: 0, syncedUid: null });
  clearToasts();
  stopAuth = startAuth();
  await settle();
});

afterEach(() => {
  stopAuth();
  jest.restoreAllMocks();
});

describe('startup', () => {
  it('starts as a guest with cloud features available', () => {
    expect(auth()).toMatchObject({ available: true, status: 'guest', user: null, pending: null });
    expect(isPurchasesLinked()).toBe(false);
  });

  it('initializes Auth with React Native persistence', () => {
    expect(firebase.auth.getReactNativePersistence).toHaveBeenCalledWith(firebase.modules.storage);
    expect(firebase.auth.initializeAuth).toHaveBeenCalledWith(expect.anything(), {
      persistence: { type: 'LOCAL' },
    });
  });

  it('restores a persisted session: RevenueCat logIn, cloud sync and grants', async () => {
    stopAuth();
    firebase.auth.currentUser = fakeUser('restored');
    stopAuth = startAuth();
    await settle();
    expect(auth()).toMatchObject({ status: 'signedIn', purchasesLinked: true });
    expect(auth().user?.uid).toBe('restored');
    expect(revenueCat.api.logIn).toHaveBeenCalledWith('restored');
    expect(firebase.firestore.docs.has('users/restored')).toBe(true);
    expect(firebase.firestore.listenerCount()).toBe(1);
    expect(track).not.toHaveBeenCalledWith('sign_in_success', expect.anything());
  });

  it('returns to guest when Firebase ends the session on its own', async () => {
    await signIn();
    firebase.auth.setUser(null);
    await settle();
    expect(auth()).toMatchObject({ status: 'guest', purchasesLinked: false });
    expect(firebase.firestore.listenerCount()).toBe(0);
  });
});

describe('signInWithGoogle', () => {
  it('signs in, links RevenueCat before syncing, then starts the grants listener', async () => {
    let transactionsAtLogIn = -1;
    revenueCat.api.logIn.mockImplementationOnce((uid: string) => {
      transactionsAtLogIn = firebase.firestore.transactionCount();
      return Promise.resolve({ customerInfo: { appUserId: uid }, created: true });
    });
    expect(await signIn()).toBe('done');
    expect(google.api.configure).toHaveBeenCalledWith({
      webClientId: 'web-client.apps.googleusercontent.com',
    });
    expect(google.api.hasPlayServices).toHaveBeenCalledWith({ showPlayServicesUpdateDialog: true });
    expect(firebase.auth.signInWithCredential).toHaveBeenCalledWith(expect.anything(), {
      idToken: 'google-token',
    });
    expect(auth()).toMatchObject({ status: 'signedIn', purchasesLinked: true, pending: null });
    expect(auth().user).toEqual({ uid: UID, email: 'player@example.com', displayName: 'Player' });
    expect(revenueCat.api.logIn).toHaveBeenCalledWith(UID);
    expect(transactionsAtLogIn).toBe(0);
    expect(firebase.firestore.docs.get(`users/${UID}`)).toMatchObject({ coins: 300 });
    expect(firebase.firestore.listenerCount()).toBe(1);
    expect(track).toHaveBeenCalledWith('sign_in_success', { method: 'google' });
    expect(toastKey()).toBe('account.toast.signedIn');
  });

  it('keeps the guest progress and merges it into the account', async () => {
    firebase.firestore.docs.set(`users/${UID}`, {
      schemaVersion: 1,
      level: 20,
      coins: 50,
      ownedThemes: ['classic', 'neon'],
    });
    useProgressStore.setState({ level: 3, processedTransactions: ['GPA.guest'] });
    await signIn();
    expect(progress()).toMatchObject({ level: 20, coins: 300 });
    expect(progress().ownedThemes).toContain('neon');
    expect(firebase.firestore.docs.get(`users/${UID}`)?.processedTransactions).toContain(
      'GPA.guest',
    );
  });

  it('treats a cancelled picker as silent', async () => {
    google.cancelNext();
    expect(await signIn()).toBe('cancelled');
    expect(toastKey()).toBeNull();
    expect(auth().status).toBe('guest');
    expect(track).toHaveBeenCalledWith('sign_in_failed', { method: 'google', reason: 'cancelled' });
  });

  it.each([
    ['missing Play services', 'playServices', 'account.toast.playServices'],
    ['a sign-in already running', 'inProgress', 'account.toast.inProgress'],
    ['a network error', 'network', 'account.toast.network'],
    ['an unknown error', 'unknown', 'account.toast.signInFailed'],
  ] as const)('reports %s with its own toast', async (_name, reason, toast) => {
    if (reason === 'playServices') {
      google.api.hasPlayServices.mockRejectedValueOnce(
        googleError(GOOGLE_STATUS.PLAY_SERVICES_NOT_AVAILABLE),
      );
    } else {
      const code = { inProgress: GOOGLE_STATUS.IN_PROGRESS, network: '7', unknown: '10' }[reason];
      google.api.signIn.mockRejectedValueOnce(googleError(code));
    }
    expect(await signIn()).toBe('failed');
    expect(toastKey()).toBe(toast);
    expect(track).toHaveBeenCalledWith('sign_in_failed', { method: 'google', reason });
    expect(auth().status).toBe('guest');
  });

  it('reports a Firebase network failure', async () => {
    firebase.auth.signInWithCredential.mockRejectedValueOnce(
      Object.assign(new Error('offline'), { code: 'auth/network-request-failed' }),
    );
    expect(await signIn()).toBe('failed');
    expect(toastKey()).toBe('account.toast.network');
  });

  it('fails when Google returns no ID token', async () => {
    google.nextToken(null);
    expect(await signIn()).toBe('failed');
    expect(toastKey()).toBe('account.toast.signInFailed');
  });

  it('runs one account action at a time', async () => {
    const [first, second] = await Promise.all([signInWithGoogle(), signInWithGoogle()]);
    expect([first, second]).toEqual(['done', 'busy']);
  });

  it('retries the RevenueCat logIn on the next foreground', async () => {
    revenueCat.api.logIn.mockRejectedValueOnce(new Error('offline'));
    await signIn();
    expect(auth()).toMatchObject({ status: 'signedIn', purchasesLinked: false });
    await foreground();
    expect(revenueCat.api.logIn).toHaveBeenCalledTimes(2);
    expect(auth().purchasesLinked).toBe(true);
  });
});

describe('fulfillment routing', () => {
  const tx = (id: string) => ({
    transactionId: id,
    productId: 'coins_500' as const,
    purchasedAt: NOW,
  });

  it('grants guest purchases on the device', () => {
    expect(fulfillTransaction(tx('GPA.g'), NOW).kind).toBe('granted');
    expect(progress().coins).toBe(800);
  });

  it('sends signed-in purchases to the server once RevenueCat is linked', async () => {
    await signIn();
    expect(fulfillTransaction(tx('GPA.s'), NOW).kind).toBe('awaitingServer');
    expect(progress().coins).toBe(300);
  });

  it('grants on the device while RevenueCat is not linked yet', async () => {
    revenueCat.api.logIn.mockRejectedValueOnce(new Error('offline'));
    await signIn();
    expect(fulfillTransaction(tx('GPA.u'), NOW).kind).toBe('granted');
  });

  it('keeps device fulfillment with the mock store (no webhook behind it)', async () => {
    setIapProvider(createFakeIap('mock'));
    await signIn();
    expect(revenueCat.api.logIn).not.toHaveBeenCalled();
    expect(auth().purchasesLinked).toBe(false);
    expect(fulfillTransaction(tx('GPA.m'), NOW).kind).toBe('granted');
  });

  it('does not grant a guest purchase twice when its server grant arrives after sign-in', async () => {
    fulfillTransaction(tx('GPA.g'), NOW);
    firebase.firestore.docs.set(`users/${UID}/grants/GPA.g`, {
      type: 'purchase',
      productId: 'coins_500',
      applied: false,
      claimedBy: null,
    });
    await signIn();
    expect(progress().coins).toBe(800);
    expect(firebase.firestore.docs.get(`users/${UID}/grants/GPA.g`)?.applied).toBe(true);
  });
});

describe('signOut', () => {
  it('stops listening, pushes pending changes, logs out everywhere and keeps local progress', async () => {
    await signIn();
    clearToasts();
    progress().spendCoins(100);
    expect(await signOut()).toBe('done');
    expect(firebase.firestore.docs.get(`users/${UID}`)?.coins).toBe(200);
    expect(firebase.firestore.listenerCount()).toBe(0);
    expect(revenueCat.api.logOut).toHaveBeenCalled();
    expect(firebase.auth.signOut).toHaveBeenCalled();
    expect(google.api.signOut).toHaveBeenCalled();
    expect(google.api.revokeAccess).not.toHaveBeenCalled();
    expect(auth()).toMatchObject({ status: 'guest', user: null, purchasesLinked: false });
    expect(progress().coins).toBe(200);
    expect(useCloudStore.getState().syncedUid).toBe(UID);
    expect(track).toHaveBeenCalledWith('sign_out', { method: 'google' });
    expect(toastKey()).toBe('account.toast.signedOut');
  });

  it('skips the RevenueCat logOut when it is already anonymous', async () => {
    revenueCat.api.logIn.mockRejectedValueOnce(new Error('offline'));
    await signIn();
    await signOut();
    expect(revenueCat.api.isAnonymous).toHaveBeenCalled();
    expect(revenueCat.api.logOut).not.toHaveBeenCalled();
  });
});

describe('deleteAccount', () => {
  beforeEach(async () => {
    await signIn();
    useProgressStore.setState({
      level: 30,
      coins: 999,
      processedTransactions: ['GPA.paid'],
      entitlements: { noAds: true, vip: false },
    });
    clearToasts();
    jest.mocked(track).mockClear();
  });

  it('re-authenticates, calls deleteMyAccount, signs out and resets progress keeping purchases', async () => {
    expect(await deleteAccount()).toBe('done');
    expect(google.api.signIn).toHaveBeenCalledTimes(2);
    expect(firebase.auth.reauthenticateWithCredential).toHaveBeenCalledWith(
      expect.objectContaining({ uid: UID }),
      { idToken: 'google-token' },
    );
    expect(firebase.httpsCallable).toHaveBeenCalledWith(expect.anything(), 'deleteMyAccount');
    expect(firebase.deleteMyAccount).toHaveBeenCalledWith();
    expect(google.api.revokeAccess).toHaveBeenCalled();
    expect(revenueCat.api.logOut).toHaveBeenCalled();
    expect(auth().status).toBe('guest');
    expect(progress()).toMatchObject({ level: 1, lastSyncedBalances: null });
    expect(progress().processedTransactions).toEqual(['GPA.paid']);
    expect(progress().entitlements.noAds).toBe(true);
    expect(useCloudStore.getState()).toMatchObject({ syncedUid: null, dirty: false });
    expect(track).toHaveBeenCalledWith('account_deleted', { method: 'google' });
    expect(toastKey()).toBe('account.toast.deleted');
  });

  it('does nothing when the Google picker is cancelled', async () => {
    google.cancelNext();
    expect(await deleteAccount()).toBe('cancelled');
    expect(firebase.deleteMyAccount).not.toHaveBeenCalled();
    expect(auth().status).toBe('signedIn');
  });

  it('refuses another Google account', async () => {
    firebase.auth.reauthenticateWithCredential.mockRejectedValueOnce(
      Object.assign(new Error('mismatch'), { code: 'auth/user-mismatch' }),
    );
    expect(await deleteAccount()).toBe('failed');
    expect(toastKey()).toBe('account.toast.wrongAccount');
    expect(firebase.deleteMyAccount).not.toHaveBeenCalled();
  });

  it('keeps the account and resumes the session when the function fails', async () => {
    firebase.deleteMyAccount.mockRejectedValueOnce(
      Object.assign(new Error('boom'), { code: 'functions/internal' }),
    );
    expect(await deleteAccount()).toBe('failed');
    await settle();
    expect(toastKey()).toBe('account.toast.deleteFailed');
    expect(auth()).toMatchObject({ status: 'signedIn', purchasesLinked: true });
    expect(firebase.firestore.listenerCount()).toBe(1);
    expect(progress().level).toBe(30);
  });
});
