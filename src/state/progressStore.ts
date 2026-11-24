import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/constants';
import type { RewardBundle } from '@/config/economy';

import { migrateProgress } from './migrations';
import { createDefaultProgress, PROGRESS_VERSION, type ProgressState } from './progressModel';
import {
  applyCompleteLevel,
  applyConsume,
  applyGrant,
  applyMarkTutorialDone,
  applyRewardedShown,
  applySkipLevel,
  applySpendCoins,
  type CompleteLevelInput,
  type ConsumableItem,
} from './progressReducers';
import { createPersistStorage } from './storage';

export * from './progressModel';
export type { CompleteLevelInput, ConsumableItem } from './progressReducers';

/** Fields a generic patch may not touch: they are owned by migrations and `touchOpen`. */
type ProgressPatch = Partial<Omit<ProgressState, 'schemaVersion' | 'updatedAt'>>;

export interface ProgressActions {
  /** Records an app open: bumps the session count and open/seen timestamps (clock-rollback safe). */
  touchOpen: (now: number) => void;
  /** Shallow-merges fields and stamps `updatedAt`. */
  patch: (changes: ProgressPatch, now?: number) => void;
  /** Stars (best kept), next level, coins, 3★ streak and interstitial counter for a win. */
  completeLevel: (input: CompleteLevelInput, now?: number) => void;
  /** Completes `level` with 1★ (unless better stars exist) and no coins. */
  skipLevel: (level: number, now?: number) => void;
  /** Returns false (and changes nothing) when the balance is too low. */
  spendCoins: (amount: number, now?: number) => boolean;
  grant: (bundle: RewardBundle, now?: number) => void;
  /** Uses one inventory item; returns false when none is left. */
  consume: (item: ConsumableItem, now?: number) => boolean;
  markTutorialDone: (now?: number) => void;
  /** Stamps `ads.lastRewardedAt` after an earned rewarded ad. */
  recordRewardedAd: (now?: number) => void;
}

export type ProgressStore = ProgressState & ProgressActions;

/** Pure reducer behind `touchOpen`, exported for tests. */
export const applyTouchOpen = (state: ProgressState, now: number): ProgressState => ({
  ...state,
  sessionCount: state.sessionCount + 1,
  lastOpenAt: now,
  lastSeenAt: Math.max(state.lastSeenAt, now),
  updatedAt: Math.max(state.updatedAt, now),
});

const pickProgress = (state: ProgressStore): ProgressState => {
  const {
    touchOpen: _touchOpen,
    patch: _patch,
    completeLevel: _completeLevel,
    skipLevel: _skipLevel,
    spendCoins: _spendCoins,
    grant: _grant,
    consume: _consume,
    markTutorialDone: _markTutorialDone,
    recordRewardedAd: _recordRewardedAd,
    ...data
  } = state;
  return data;
};

export const useProgressStore = create<ProgressStore>()(
  persist<ProgressStore, [], [], ProgressState>(
    (set, get) => ({
      ...createDefaultProgress(Date.now()),
      touchOpen: (now) => set((state) => applyTouchOpen(pickProgress(state), now)),
      patch: (changes, now = Date.now()) => set({ ...changes, updatedAt: now }),
      completeLevel: (input, now = Date.now()) =>
        set((state) => applyCompleteLevel(pickProgress(state), input, now)),
      skipLevel: (level, now = Date.now()) =>
        set((state) => applySkipLevel(pickProgress(state), level, now)),
      spendCoins: (amount, now = Date.now()) => {
        const next = applySpendCoins(pickProgress(get()), amount, now);
        if (next === null) return false;
        set(next);
        return true;
      },
      grant: (bundle, now = Date.now()) =>
        set((state) => applyGrant(pickProgress(state), bundle, now)),
      consume: (item, now = Date.now()) => {
        const next = applyConsume(pickProgress(get()), item, now);
        if (next === null) return false;
        set(next);
        return true;
      },
      markTutorialDone: (now = Date.now()) =>
        set((state) => applyMarkTutorialDone(pickProgress(state), now)),
      recordRewardedAd: (now = Date.now()) =>
        set((state) => applyRewardedShown(pickProgress(state), now)),
    }),
    {
      name: STORAGE_KEYS.progress,
      version: PROGRESS_VERSION,
      storage: createPersistStorage<ProgressState>(),
      partialize: pickProgress,
      migrate: (persisted, version) => migrateProgress(persisted, version),
      merge: (persisted, current) =>
        persisted === undefined
          ? current
          : { ...current, ...migrateProgress(persisted, PROGRESS_VERSION) },
    },
  ),
);
