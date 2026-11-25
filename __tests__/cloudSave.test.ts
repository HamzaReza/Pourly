import { AppState, type AppStateStatus } from 'react-native';

import {
  cloudSessionUid,
  PUSH_DEBOUNCE_MS,
  PUSH_RETRY_MS,
  PUSH_SPACING_MS,
  startCloudSession,
  stopCloudSession,
  stopCloudSessionNow,
  syncNow,
} from '@/services/cloudSave';
import { useCloudStore } from '@/state/cloudStore';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { logger } from '@/utils/logger';

import {
  createFakeFirestore,
  fakeServices,
  settle,
  type FakeDoc,
  type FakeFirestore,
} from '../test-utils/fakeFirebase';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const UID = 'uid-1';
const SAVE = `users/${UID}`;

const progress = () => useProgressStore.getState();
const cloud = () => useCloudStore.getState();

const remoteSave = (overrides: FakeDoc = {}): FakeDoc => ({
  schemaVersion: 1,
  level: 10,
  stars: { 9: 3 },
  coins: 1000,
  hints: 2,
  undos: 0,
  extraTubes: 0,
  streak: 0,
  bestStreak: 0,
  lastDailyDate: null,
  dailyHistory: {},
  giftDayIndex: 0,
  lastGiftDate: null,
  ownedThemes: ['classic', 'ember'],
  activeTheme: 'classic',
  processedTransactions: ['GPA.old'],
  starterPackPurchased: false,
  updatedAt: 1,
  lastWriterInstall: 'install-b',
  ...overrides,
});

let firestore: FakeFirestore;
let onAppState: (state: AppStateStatus) => void = () => undefined;

/** Runs pending timers and lets the fake Firestore promises settle. */
const advance = async (ms: number): Promise<void> => {
  jest.advanceTimersByTime(ms);
  await settle();
};

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    onAppState = handler as (state: AppStateStatus) => void;
    return { remove: jest.fn() };
  });
  firestore = createFakeFirestore();
  useProgressStore.setState({ ...createDefaultProgress(NOW), coins: 300, level: 4 });
  useCloudStore.setState({ installId: 'install-a', dirty: false, lastPushAt: 0, syncedUid: null });
});

afterEach(() => {
  stopCloudSessionNow();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('first sync at sign-in', () => {
  it('pulls, merges, pushes and stores the baseline for the account', async () => {
    firestore.docs.set(SAVE, remoteSave());
    expect(await startCloudSession(UID, fakeServices(firestore))).toBe('synced');
    expect(cloudSessionUid()).toBe(UID);
    expect(progress()).toMatchObject({ level: 10, coins: 1000, stars: { 9: 3 } });
    expect(progress().ownedThemes).toContain('ember');
    expect(progress().processedTransactions).toContain('GPA.old');
    expect(progress().lastSyncedBalances).toEqual({
      coins: 1000,
      hints: 3,
      undos: 0,
      extraTubes: 1,
    });
    expect(cloud()).toMatchObject({ dirty: false, syncedUid: UID, lastPushAt: NOW });
    expect(firestore.docs.get(SAVE)).toMatchObject({
      schemaVersion: 1,
      level: 10,
      coins: 1000,
      lastWriterInstall: 'install-a',
    });
    expect(typeof firestore.docs.get(SAVE)?.updatedAt).toBe('number');
    expect(firestore.docs.get(SAVE)).not.toHaveProperty('entitlements');
  });

  it('uploads the device copy for a new account', async () => {
    await startCloudSession(UID, fakeServices(firestore));
    expect(firestore.docs.get(SAVE)).toMatchObject({ level: 4, coins: 300 });
    expect(progress().coins).toBe(300);
  });

  it('ignores a baseline recorded for another account (balances merge by max)', async () => {
    useProgressStore.setState({
      lastSyncedBalances: { coins: 5000, hints: 0, undos: 0, extraTubes: 0 },
    });
    useCloudStore.setState({ syncedUid: 'someone-else' });
    firestore.docs.set(SAVE, remoteSave({ coins: 200 }));
    await startCloudSession(UID, fakeServices(firestore));
    expect(progress().coins).toBe(300);
  });

  it('never overwrites a save written by a newer app version', async () => {
    firestore.docs.set(SAVE, remoteSave({ schemaVersion: 2, coins: 7 }));
    expect(await startCloudSession(UID, fakeServices(firestore))).toBe('failed');
    expect(firestore.docs.get(SAVE)).toMatchObject({ schemaVersion: 2, coins: 7 });
    expect(progress().coins).toBe(300);
    expect(cloud().dirty).toBe(true);
  });
});

describe('pushes after changes', () => {
  beforeEach(async () => {
    firestore.docs.set(SAVE, remoteSave());
    await startCloudSession(UID, fakeServices(firestore));
  });

  it('marks changes dirty and pushes at most once per 30 s', async () => {
    const before = firestore.transactionCount();
    progress().spendCoins(100);
    progress().spendCoins(100);
    expect(cloud().dirty).toBe(true);
    await advance(PUSH_DEBOUNCE_MS);
    expect(firestore.transactionCount()).toBe(before);
    await advance(PUSH_SPACING_MS);
    expect(firestore.transactionCount()).toBe(before + 1);
    expect(firestore.docs.get(SAVE)?.coins).toBe(800);
    expect(cloud().dirty).toBe(false);
  });

  it('waits only the debounce once the last push is old enough', async () => {
    await advance(PUSH_SPACING_MS);
    const before = firestore.transactionCount();
    progress().grant({ hints: 1 });
    await advance(PUSH_DEBOUNCE_MS);
    expect(firestore.transactionCount()).toBe(before + 1);
  });

  it('ignores changes to fields that are not synced', async () => {
    progress().touchOpen(NOW + 1);
    progress().setNotificationsGranted(true);
    expect(cloud().dirty).toBe(false);
  });

  it('syncs at once when the app goes to the background', async () => {
    const before = firestore.transactionCount();
    progress().spendCoins(50);
    onAppState('background');
    await settle();
    expect(firestore.transactionCount()).toBe(before + 1);
    expect(firestore.docs.get(SAVE)?.coins).toBe(950);
  });

  it('keeps the dirty flag after a failure and retries a minute later', async () => {
    firestore.failTransactions(1);
    progress().spendCoins(50);
    await advance(PUSH_SPACING_MS);
    expect(cloud().dirty).toBe(true);
    expect(firestore.docs.get(SAVE)?.coins).toBe(1000);
    await advance(PUSH_RETRY_MS);
    expect(cloud().dirty).toBe(false);
    expect(firestore.docs.get(SAVE)?.coins).toBe(950);
  });

  it('retries a pending push on the next foreground', async () => {
    firestore.failTransactions(1);
    progress().spendCoins(50);
    await advance(PUSH_SPACING_MS);
    expect(cloud().dirty).toBe(true);
    onAppState('active');
    await settle();
    expect(cloud().dirty).toBe(false);
  });

  it('merges another device’s changes with offline changes on this device', async () => {
    firestore.docs.set(SAVE, remoteSave({ coins: 1500, level: 14 }));
    firestore.failTransactions(1);
    progress().spendCoins(50);
    await advance(PUSH_SPACING_MS);
    expect(await syncNow()).toBe('synced');
    expect(progress()).toMatchObject({ coins: 1450, level: 14 });
    expect(firestore.docs.get(SAVE)?.coins).toBe(1450);
    expect(progress().lastSyncedBalances?.coins).toBe(1450);
  });

  it('keeps changes made while a sync is running', async () => {
    const running = syncNow();
    progress().spendCoins(100);
    await running;
    expect(progress().coins).toBe(900);
    expect(cloud().dirty).toBe(true);
    expect(firestore.docs.get(SAVE)?.coins).toBe(1000);
  });
});

describe('stopping', () => {
  it('pushes pending changes once more on sign-out, then stops', async () => {
    firestore.docs.set(SAVE, remoteSave());
    await startCloudSession(UID, fakeServices(firestore));
    progress().spendCoins(10);
    await stopCloudSession();
    expect(firestore.docs.get(SAVE)?.coins).toBe(990);
    expect(cloudSessionUid()).toBeNull();
    const after = firestore.transactionCount();
    progress().spendCoins(10);
    await advance(PUSH_SPACING_MS * 2);
    expect(firestore.transactionCount()).toBe(after);
    expect(await syncNow()).toBe('skipped');
  });

  it('keeps the change on the device when the final push fails', async () => {
    await startCloudSession(UID, fakeServices(firestore));
    progress().spendCoins(10);
    firestore.failTransactions(1);
    await stopCloudSession();
    expect(progress().coins).toBe(290);
    expect(cloud().dirty).toBe(true);
  });
});
