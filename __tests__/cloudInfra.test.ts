import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/config/constants';
import { parsePublicEnv } from '@/config/env';
import {
  FUNCTIONS_REGION,
  getFirebase,
  isCloudConfigured,
  missingCloudConfig,
  setFirebaseLoader,
} from '@/services/firebase';
import { applyRefund } from '@/services/fulfillmentCore';
import { setIapProvider } from '@/services/iap';
import {
  logInPurchases,
  logOutPurchases,
  setPurchasesIdentityLoader,
} from '@/services/purchasesIdentity';
import { sanitizeCloudSync, useCloudStore } from '@/state/cloudStore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import {
  applyCloudSave,
  flushProgress,
  hasAnyPurchase,
  useProgressStore,
} from '@/state/progressStore';
import { pickCloudProgress } from '@/services/cloudMerge';
import { logger } from '@/utils/logger';

import { createFakeRevenueCatIdentity } from '../test-utils/fakeAccounts';
import { createFakeFirebase } from '../test-utils/fakeFirebase';
import { createFakeIap } from '../test-utils/fakeIap';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

const CONFIGURED = parsePublicEnv({
  googleWebClientId: 'web-client',
  firebase: {
    apiKey: 'key',
    authDomain: 'p.firebaseapp.com',
    projectId: 'p',
    storageBucket: '',
    messagingSenderId: '',
    appId: 'app',
  },
});

const state = (overrides: Partial<ProgressState> = {}): ProgressState => ({
  ...createDefaultProgress(NOW),
  ...overrides,
});

beforeEach(() => {
  jest.spyOn(logger, 'info').mockImplementation(() => undefined);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('cloud configuration', () => {
  it('needs the Firebase web config and the Google Web client id', () => {
    expect(isCloudConfigured(CONFIGURED)).toBe(true);
    expect(missingCloudConfig(CONFIGURED)).toEqual([]);
    expect(missingCloudConfig(parsePublicEnv({}))).toEqual([
      'firebase.apiKey',
      'firebase.authDomain',
      'firebase.projectId',
      'firebase.appId',
      'googleWebClientId',
    ]);
    expect(isCloudConfigured(parsePublicEnv({ ...CONFIGURED, googleWebClientId: '' }))).toBe(false);
  });

  it('is disabled in this test build, which has no env', () => {
    expect(isCloudConfigured()).toBe(false);
  });

  it('never loads the SDK when disabled and logs it once', async () => {
    const loader = jest.fn(() => Promise.resolve(createFakeFirebase().modules));
    setFirebaseLoader(loader);
    expect(await getFirebase(parsePublicEnv({}))).toBeNull();
    expect(await getFirebase(parsePublicEnv({}))).toBeNull();
    expect(loader).not.toHaveBeenCalled();
  });

  it('initializes the SDK once with persistence, long polling and the Functions region', async () => {
    const fake = createFakeFirebase();
    const loader = jest.fn(() => Promise.resolve(fake.modules));
    setFirebaseLoader(loader);
    const services = await getFirebase(CONFIGURED);
    await getFirebase(CONFIGURED);
    expect(services).not.toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(fake.modules.app.initializeApp).toHaveBeenCalledWith(CONFIGURED.firebase);
    expect(fake.auth.initializeAuth).toHaveBeenCalledWith(expect.anything(), {
      persistence: { type: 'LOCAL' },
    });
    expect(fake.modules.functions.getFunctions).toHaveBeenCalledWith(
      expect.anything(),
      FUNCTIONS_REGION,
    );
    expect(FUNCTIONS_REGION).toBe('us-central1');
  });

  it('returns null and retries later when the SDK fails to load', async () => {
    const fake = createFakeFirebase();
    const loader = jest
      .fn()
      .mockRejectedValueOnce(new Error('no network'))
      .mockResolvedValueOnce(fake.modules);
    setFirebaseLoader(loader);
    expect(await getFirebase(CONFIGURED)).toBeNull();
    expect(await getFirebase(CONFIGURED)).not.toBeNull();
  });
});

describe('RevenueCat identity', () => {
  it('logs in and out only with the RevenueCat provider', async () => {
    const revenueCat = createFakeRevenueCatIdentity();
    setPurchasesIdentityLoader(() => Promise.resolve(revenueCat.module));
    setIapProvider(createFakeIap('mock'));
    expect(await logInPurchases('u1')).toBe(false);
    expect(revenueCat.api.logIn).not.toHaveBeenCalled();
    const provider = createFakeIap('revenuecat');
    setIapProvider(provider);
    expect(await logInPurchases('u1')).toBe(true);
    expect(provider.init).toHaveBeenCalled();
    expect(revenueCat.api.logIn).toHaveBeenCalledWith('u1');
    await logOutPurchases();
    expect(revenueCat.api.logOut).toHaveBeenCalledTimes(1);
    await logOutPurchases();
    expect(revenueCat.api.logOut).toHaveBeenCalledTimes(1);
  });

  it('reports a failed logIn instead of throwing', async () => {
    const revenueCat = createFakeRevenueCatIdentity();
    revenueCat.api.logIn.mockRejectedValueOnce(new Error('offline'));
    setPurchasesIdentityLoader(() => Promise.resolve(revenueCat.module));
    setIapProvider(createFakeIap('revenuecat'));
    expect(await logInPurchases('u1')).toBe(false);
  });
});

describe('applyRefund', () => {
  it('takes the items back once per refund id, flooring at 0', () => {
    const first = applyRefund(
      state({ coins: 2000, hints: 4, undos: 20 }),
      'T_refund',
      'starter_pack',
      NOW,
    );
    expect(first.result).toEqual({
      kind: 'refunded',
      removed: { coins: 1500, hints: 4, undos: 10, extraTubes: 0 },
    });
    expect(first.state).toMatchObject({ coins: 500, hints: 0, undos: 10 });
    expect(first.state.processedTransactions).toEqual(['T_refund']);
    expect(applyRefund(first.state, 'T_refund', 'starter_pack', NOW).result.kind).toBe('duplicate');
    expect(applyRefund(state(), ' ', 'coins_500', NOW).result.kind).toBe('invalid');
  });

  it('keeps the Starter Pack theme and flag', () => {
    const owned = state({ starterPackPurchased: true, ownedThemes: ['classic', 'aurora'] });
    const { state: next } = applyRefund(owned, 'T_refund', 'starter_pack', NOW);
    expect(next.starterPackPurchased).toBe(true);
    expect(next.ownedThemes).toContain('aurora');
  });
});

describe('applyCloudSave', () => {
  it('writes the merged fields and baseline and keeps device-only fields', () => {
    const local = state({ sessionCount: 7, entitlements: { noAds: true, vip: false } });
    const merged = { ...pickCloudProgress(local), level: 12, coins: 42, activeTheme: 'ember' };
    const next = applyCloudSave(
      local,
      merged,
      { coins: 42, hints: 3, undos: 0, extraTubes: 1 },
      NOW,
    );
    expect(next).toMatchObject({ level: 12, coins: 42, sessionCount: 7 });
    expect(next.entitlements.noAds).toBe(true);
    expect(next.lastSyncedBalances?.coins).toBe(42);
    expect(next.activeTheme).toBe('classic');
  });
});

describe('hasAnyPurchase', () => {
  it('counts transactions, the Starter Pack and entitlements', () => {
    expect(hasAnyPurchase(state())).toBe(false);
    expect(hasAnyPurchase(state({ processedTransactions: ['t'] }))).toBe(true);
    expect(hasAnyPurchase(state({ starterPackPurchased: true }))).toBe(true);
    expect(hasAnyPurchase(state({ entitlements: { noAds: false, vip: true } }))).toBe(true);
  });
});

describe('flushProgress', () => {
  it('writes the current progress to storage', async () => {
    useProgressStore.setState({ ...createDefaultProgress(NOW), coins: 4321 });
    await flushProgress();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.progress)) ?? '{}') as {
      state: { coins: number; touchOpen?: unknown };
      version: number;
    };
    expect(stored.state.coins).toBe(4321);
    expect(stored.state.touchOpen).toBeUndefined();
    expect(stored.version).toBe(2);
  });
});

describe('cloud bookkeeping store', () => {
  it('sanitizes stored data', () => {
    expect(sanitizeCloudSync(null, 'fallback')).toEqual({
      installId: 'fallback',
      dirty: false,
      lastPushAt: 0,
      syncedUid: null,
      signInCardDismissal: 'none',
    });
    expect(
      sanitizeCloudSync(
        {
          installId: 'x'.repeat(65),
          dirty: 'yes',
          lastPushAt: Number.NaN,
          syncedUid: '',
          signInCardDismissal: 'forever',
        },
        'fallback',
      ),
    ).toMatchObject({ installId: 'fallback', dirty: false, lastPushAt: 0, syncedUid: null });
    expect(
      sanitizeCloudSync(
        {
          installId: 'i1',
          dirty: true,
          lastPushAt: 5,
          syncedUid: 'u',
          signInCardDismissal: 'afterPurchase',
        },
        'f',
      ),
    ).toEqual({
      installId: 'i1',
      dirty: true,
      lastPushAt: 5,
      syncedUid: 'u',
      signInCardDismissal: 'afterPurchase',
    });
  });

  it('records pushes, account removal and card dismissals', () => {
    const cloud = () => useCloudStore.getState();
    cloud().markDirty();
    cloud().markPushed('u1', NOW, false);
    expect(cloud()).toMatchObject({ dirty: false, lastPushAt: NOW, syncedUid: 'u1' });
    cloud().forgetAccount();
    expect(cloud()).toMatchObject({ dirty: false, lastPushAt: 0, syncedUid: null });
    cloud().dismissSignInCard(false);
    expect(cloud().signInCardDismissal).toBe('beforePurchase');
    cloud().dismissSignInCard(true);
    expect(cloud().signInCardDismissal).toBe('afterPurchase');
  });
});
