import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/constants';

import { migrateProgress } from './migrations';
import { createDefaultProgress, PROGRESS_VERSION, type ProgressState } from './progressModel';
import { createPersistStorage } from './storage';

export * from './progressModel';

/** Fields a generic patch may not touch: they are owned by migrations and `touchOpen`. */
type ProgressPatch = Partial<Omit<ProgressState, 'schemaVersion' | 'updatedAt'>>;

export interface ProgressActions {
  /** Records an app open: bumps the session count and open/seen timestamps (clock-rollback safe). */
  touchOpen: (now: number) => void;
  /** Shallow-merges fields and stamps `updatedAt`. */
  patch: (changes: ProgressPatch, now?: number) => void;
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
  const { touchOpen: _touchOpen, patch: _patch, ...data } = state;
  return data;
};

export const useProgressStore = create<ProgressStore>()(
  persist<ProgressStore, [], [], ProgressState>(
    (set) => ({
      ...createDefaultProgress(Date.now()),
      touchOpen: (now) => set((state) => applyTouchOpen(pickProgress(state), now)),
      patch: (changes, now = Date.now()) => set({ ...changes, updatedAt: now }),
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
