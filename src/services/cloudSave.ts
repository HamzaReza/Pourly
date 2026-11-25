/**
 * Cloud save (spec §26.4): keeps `users/{uid}` and the device's progress in step while a player
 * is signed in. The merge rules live in `cloudMerge.ts` (pure).
 *
 * Every sync is one Firestore transaction: read the server copy, merge it with the device copy
 * (`mergeProgress`, baseline = `lastSyncedBalances`), write the merged snapshot, then store it on
 * the device with the new baseline. Changes made on the device while the transaction ran are
 * merged on top, so nothing the player does in the meantime is lost.
 *
 * Pushes: a meaningful change (any synced field) marks the persisted `dirty` flag and schedules a
 * sync at most once per 30 s; going to the background syncs at once; a dirty flag left by a failed
 * or interrupted sync is retried every minute and on the next foreground. Failures are logged and
 * never block gameplay.
 */
import { AppState, type NativeEventSubscription } from 'react-native';

import { useCloudStore } from '@/state/cloudStore';
import { useProgressStore } from '@/state/progressStore';
import { logger } from '@/utils/logger';

import {
  balancesOf,
  cloudFingerprint,
  CLOUD_SCHEMA_VERSION,
  isNewerCloudSchema,
  mergeProgress,
  parseCloudSnapshot,
  pickCloudProgress,
  type CloudProgress,
  type MergeResult,
} from './cloudMerge';
import type { FirebaseServices } from './firebase';

/** Minimum spacing of automatic pushes. */
export const PUSH_SPACING_MS = 30_000;
/** Quiet time after a change before it is pushed (several quick changes become one push). */
export const PUSH_DEBOUNCE_MS = 3_000;
/** Retry delay after a failed sync while changes are pending. */
export const PUSH_RETRY_MS = 60_000;
/** Longest wait for the final push when signing out. */
export const FINAL_PUSH_TIMEOUT_MS = 6_000;

export type SyncResult = 'synced' | 'skipped' | 'failed';

interface Session {
  readonly uid: string;
  readonly services: FirebaseServices;
}

let session: Session | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<SyncResult> | null = null;
let knownFingerprint = '';
let applying = false;
let unsubscribeProgress: (() => void) | null = null;
let appStateSubscription: NativeEventSubscription | null = null;

const progress = () => useProgressStore.getState();
const cloud = () => useCloudStore.getState();

const currentCloudProgress = (): CloudProgress => pickCloudProgress(progress());

/** The Firestore document written for a snapshot. */
const toDocument = (
  snapshot: CloudProgress,
  services: FirebaseServices,
): Record<string, unknown> => ({
  schemaVersion: CLOUD_SCHEMA_VERSION,
  ...snapshot,
  updatedAt: services.sdk.firestore.serverTimestamp(),
  lastWriterInstall: cloud().installId,
});

const logDecisions = (result: MergeResult): void => {
  if (!__DEV__) return;
  for (const decision of result.decisions) logger.debug('[cloud merge]', decision);
};

const clearTimer = (): void => {
  if (timer !== null) clearTimeout(timer);
  timer = null;
};

const runSync = async (active: Session): Promise<SyncResult> => {
  const { uid, services } = active;
  const fs = services.sdk.firestore;
  const before = currentCloudProgress();
  const beforeFingerprint = cloudFingerprint(before);
  const baseline = cloud().syncedUid === uid ? progress().lastSyncedBalances : null;
  const ref = fs.doc(services.db, 'users', uid);
  let merged: MergeResult;
  try {
    merged = await fs.runTransaction(services.db, async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data: unknown = snapshot.exists() ? snapshot.data() : null;
      if (isNewerCloudSchema(data)) throw new Error('The cloud save needs a newer app version');
      const remote = parseCloudSnapshot(data);
      const result = mergeProgress(before, remote, baseline);
      transaction.set(ref, toDocument(result.progress, services));
      return result;
    });
  } catch (error: unknown) {
    logger.warn('Cloud sync failed', error);
    return 'failed';
  }
  if (session?.uid !== uid) return 'skipped';
  logDecisions(merged);

  // Anything the player did while the transaction ran goes on top of the merged copy.
  const now = currentCloudProgress();
  const changedMeanwhile = cloudFingerprint(now) !== beforeFingerprint;
  const local = changedMeanwhile
    ? mergeProgress(now, merged.progress, balancesOf(before)).progress
    : merged.progress;
  applying = true;
  try {
    progress().applyCloudProgress(local, merged.baseline);
  } finally {
    applying = false;
  }
  knownFingerprint = cloudFingerprint(currentCloudProgress());
  cloud().markPushed(uid, Date.now(), changedMeanwhile);
  if (changedMeanwhile) schedulePush();
  return 'synced';
};

/**
 * Pulls, merges and pushes now (sign-in, background, retries). Concurrent calls share one run.
 * Resolves `skipped` when nobody is signed in.
 */
export const syncNow = (): Promise<SyncResult> => {
  const active = session;
  if (active === null) return Promise.resolve('skipped');
  clearTimer();
  running ??= runSync(active).finally(() => {
    running = null;
  });
  return running;
};

const pushIfDirty = async (): Promise<void> => {
  if (session === null || !cloud().dirty) return;
  const result = await syncNow();
  if (result === 'failed' && session !== null && timer === null) {
    timer = setTimeout(() => {
      timer = null;
      void pushIfDirty();
    }, PUSH_RETRY_MS);
  }
};

/** Schedules a push: after a short quiet time, and never sooner than 30 s after the last one. */
function schedulePush(): void {
  if (session === null || timer !== null) return;
  const sinceLast = Date.now() - cloud().lastPushAt;
  const spacing = sinceLast < 0 ? PUSH_SPACING_MS : Math.max(0, PUSH_SPACING_MS - sinceLast);
  timer = setTimeout(
    () => {
      timer = null;
      void pushIfDirty();
    },
    Math.min(PUSH_SPACING_MS, Math.max(PUSH_DEBOUNCE_MS, spacing)),
  );
}

const onProgressChange = (): void => {
  if (applying || session === null) return;
  const fingerprint = cloudFingerprint(currentCloudProgress());
  if (fingerprint === knownFingerprint) return;
  knownFingerprint = fingerprint;
  cloud().markDirty();
  schedulePush();
};

const onAppState = (state: string): void => {
  if (session === null) return;
  if (state === 'background') {
    if (cloud().dirty) void syncNow();
  } else if (state === 'active') {
    void pushIfDirty();
  }
};

/**
 * Starts syncing for a signed-in player: one pull → merge → push right away (which also sets the
 * baseline for this account), then pushes after changes. Resolves once the first sync settled.
 */
export const startCloudSession = async (
  uid: string,
  services: FirebaseServices,
): Promise<SyncResult> => {
  if (session?.uid === uid) return syncNow();
  stopCloudSessionNow();
  session = { uid, services };
  knownFingerprint = cloudFingerprint(currentCloudProgress());
  unsubscribeProgress = useProgressStore.subscribe(onProgressChange);
  appStateSubscription = AppState.addEventListener('change', onAppState);
  if (cloud().syncedUid !== uid) cloud().markDirty();
  const result = await syncNow();
  if (result === 'failed') void pushIfDirty();
  return result;
};

/** Stops syncing at once (no final push). */
export function stopCloudSessionNow(): void {
  clearTimer();
  unsubscribeProgress?.();
  unsubscribeProgress = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  session = null;
}

/**
 * Stops syncing after one last push of pending changes (sign-out). The push gives up after
 * `FINAL_PUSH_TIMEOUT_MS`; the changes then stay on the device.
 */
export const stopCloudSession = async (): Promise<void> => {
  if (session !== null && cloud().dirty) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      syncNow(),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, FINAL_PUSH_TIMEOUT_MS);
      }),
    ]);
    if (timeout !== undefined) clearTimeout(timeout);
  }
  stopCloudSessionNow();
};

/** The uid being synced, or null. */
export const cloudSessionUid = (): string | null => session?.uid ?? null;
