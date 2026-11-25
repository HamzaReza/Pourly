/**
 * Persisted cloud-sync bookkeeping (AsyncStorage `pourly.cloud`). The Firebase JS SDK has no
 * offline persistence on React Native (O3), so the pending push lives here: `dirty` survives an
 * app restart and the next foreground (or the next push attempt) uploads it.
 *
 * - `syncedUid`: the account `progress.lastSyncedBalances` belongs to. Signing in to another
 *   account ignores that baseline (balances then merge by max).
 * - `signInCardDismissal`: the Home "Sign in to save your progress" card. Dismissed before any
 *   purchase, it comes back once the player buys something; dismissed after one, it stays hidden.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/constants';

import { createPersistStorage } from './storage';

export type SignInCardDismissal = 'none' | 'beforePurchase' | 'afterPurchase';

export interface CloudSyncState {
  /** Random id of this install, written as `lastWriterInstall`. */
  installId: string;
  /** Local progress changed since the last successful push. */
  dirty: boolean;
  /** Epoch ms of the last successful push (pushes are spaced ≥ 30 s). */
  lastPushAt: number;
  syncedUid: string | null;
  signInCardDismissal: SignInCardDismissal;
}

export interface CloudSyncActions {
  markDirty: () => void;
  /** A push succeeded for `uid`; `stillDirty` when progress changed while it ran. */
  markPushed: (uid: string, now: number, stillDirty: boolean) => void;
  /** Forgets the account link (account deleted). */
  forgetAccount: () => void;
  dismissSignInCard: (hasPurchase: boolean) => void;
}

export const CLOUD_STORE_VERSION = 1;

const createInstallId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const DISMISSALS: readonly SignInCardDismissal[] = ['none', 'beforePurchase', 'afterPurchase'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Validates persisted cloud bookkeeping, filling gaps from defaults. */
export const sanitizeCloudSync = (persisted: unknown, fallbackId: string): CloudSyncState => {
  const v: Record<string, unknown> = isRecord(persisted) ? persisted : {};
  const dismissal = DISMISSALS.find((entry) => entry === v.signInCardDismissal) ?? 'none';
  return {
    installId:
      typeof v.installId === 'string' && v.installId.length > 0 && v.installId.length <= 64
        ? v.installId
        : fallbackId,
    dirty: v.dirty === true,
    lastPushAt:
      typeof v.lastPushAt === 'number' && Number.isFinite(v.lastPushAt) ? v.lastPushAt : 0,
    syncedUid: typeof v.syncedUid === 'string' && v.syncedUid.length > 0 ? v.syncedUid : null,
    signInCardDismissal: dismissal,
  };
};

const pickState = (state: CloudSyncState & CloudSyncActions): CloudSyncState => ({
  installId: state.installId,
  dirty: state.dirty,
  lastPushAt: state.lastPushAt,
  syncedUid: state.syncedUid,
  signInCardDismissal: state.signInCardDismissal,
});

export const useCloudStore = create<CloudSyncState & CloudSyncActions>()(
  persist<CloudSyncState & CloudSyncActions, [], [], CloudSyncState>(
    (set) => ({
      installId: createInstallId(),
      dirty: false,
      lastPushAt: 0,
      syncedUid: null,
      signInCardDismissal: 'none',
      markDirty: () => set((state) => (state.dirty ? state : { dirty: true })),
      markPushed: (uid, now, stillDirty) =>
        set({ dirty: stillDirty, lastPushAt: now, syncedUid: uid }),
      forgetAccount: () => set({ dirty: false, lastPushAt: 0, syncedUid: null }),
      dismissSignInCard: (hasPurchase) =>
        set({ signInCardDismissal: hasPurchase ? 'afterPurchase' : 'beforePurchase' }),
    }),
    {
      name: STORAGE_KEYS.cloud,
      version: CLOUD_STORE_VERSION,
      storage: createPersistStorage<CloudSyncState>(),
      partialize: pickState,
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeCloudSync(persisted, current.installId),
      }),
    },
  ),
);
