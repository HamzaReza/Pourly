/**
 * The game session store (spec §17): the source of truth for the board being played, its undo
 * history, counters, clock and status. The unfinished session is persisted as a compact snapshot
 * under its own key; writes are debounced and flushed when the app goes to the background, so a
 * relaunch resumes exactly where the player left off.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/constants';
import type { Level, Move, PourOutcome } from '@/game/types';

import { createDebouncedStorage } from './debouncedStorage';
import {
  createSession,
  encodeSession,
  isResumable,
  migrateGamePersisted,
  reduceAddTube,
  reduceHintUsed,
  reduceMarkWon,
  reducePause,
  reducePour,
  reduceRestart,
  reduceResume,
  reduceSkip,
  reduceUndo,
  restoreSession,
  SNAPSHOT_VERSION,
  type GameMode,
  type GameSession,
  type LevelResult,
  type PersistedGame,
} from './gameModel';

export * from './gameModel';

/** Coalesces snapshot writes after a burst of moves. */
export const SNAPSHOT_DEBOUNCE_MS = 600;

export interface GameState {
  session: GameSession | null;
  /** Suggested move shown on the board; cleared by the next pour, undo or restart. */
  hint: Move | null;
}

export interface GameActions {
  /** Starts `level` fresh (replacing any session). */
  loadLevel: (level: Level, mode: GameMode, now?: number) => void;
  /** Commits a pour; returns the outcome, or null when it is not legal on the live board. */
  commitPour: (from: number, to: number, now?: number) => PourOutcome | null;
  /** Takes back the last pour; `paid` when it cost inventory, coins or an ad. */
  undo: (paid: boolean) => boolean;
  restart: (now?: number) => boolean;
  /** Adds the extra tube (once per attempt). */
  addTube: () => boolean;
  /** Shows a hint and counts it as a used (paid) resource. */
  applyHint: (move: Move) => void;
  clearHint: () => void;
  /** Stores the win result once the flow has granted it. */
  markWon: (result: LevelResult) => void;
  /** Ends the level through the SKIP_LEVEL ad. */
  skip: (now?: number) => boolean;
  pause: (now?: number) => void;
  /** Leaves the pause, or starts the clock of a restored session. */
  resume: (now?: number) => void;
  /** Drops a level-mode session that does not belong to `progressLevel`. */
  discardStale: (progressLevel: number) => void;
}

export type GameStore = GameState & GameActions;

const snapshotStorage = createDebouncedStorage(AsyncStorage, SNAPSHOT_DEBOUNCE_MS);

/** Writes the pending snapshot immediately. */
export const flushGameSnapshot = (): Promise<void> => snapshotStorage.flush();

export const useGameStore = create<GameStore>()(
  persist<GameStore, [], [], PersistedGame>(
    (set, get) => {
      /** Applies a session reducer; returns false when it refused. */
      const update = (
        reducer: (session: GameSession) => GameSession | null,
        extra: Partial<GameState> = {},
      ): boolean => {
        const { session } = get();
        if (session === null) return false;
        const next = reducer(session);
        if (next === null) return false;
        set({ session: next, ...extra });
        return true;
      };
      return {
        session: null,
        hint: null,
        loadLevel: (level, mode, now = Date.now()) =>
          set({ session: createSession(level, mode, now), hint: null }),
        commitPour: (from, to, now = Date.now()) => {
          const { session } = get();
          if (session === null) return null;
          const step = reducePour(session, { from, to }, now);
          if (step === null) return null;
          set({ session: step.session, hint: null });
          return step.outcome;
        },
        undo: (paid) => update((session) => reduceUndo(session, paid), { hint: null }),
        restart: (now = Date.now()) =>
          update((session) => reduceRestart(session, now), { hint: null }),
        addTube: () => update(reduceAddTube),
        applyHint: (move) => {
          update(reduceHintUsed, { hint: move });
        },
        clearHint: () => {
          if (get().hint !== null) set({ hint: null });
        },
        markWon: (result) => {
          update((session) => reduceMarkWon(session, result));
        },
        skip: (now = Date.now()) => update((session) => reduceSkip(session, now), { hint: null }),
        pause: (now = Date.now()) => {
          update((session) => {
            const next = reducePause(session, now);
            return next === session ? null : next;
          });
        },
        resume: (now = Date.now()) => {
          update((session) => {
            const next = reduceResume(session, now);
            return next.status === session.status && next.runningSince === session.runningSince
              ? null
              : next;
          });
        },
        discardStale: (progressLevel) => {
          const { session } = get();
          if (session === null || session.mode !== 'level') return;
          if (!isResumable(session, progressLevel)) set({ session: null, hint: null });
        },
      };
    },
    {
      name: STORAGE_KEYS.game,
      version: SNAPSHOT_VERSION,
      storage: createJSONStorage<PersistedGame>(() => snapshotStorage),
      partialize: (state) => ({ snapshot: encodeSession(state.session, Date.now()) }),
      migrate: (persisted, version) => migrateGamePersisted(persisted, version),
      merge: (persisted, current) => ({ ...current, session: restoreSession(persisted) }),
    },
  ),
);

/** Narrow selector helpers. */
export const selectBoard = (state: GameStore) => state.session?.history.current ?? null;
export const selectStatus = (state: GameStore) => state.session?.status ?? null;
export const selectCanUndo = (state: GameStore) =>
  state.session !== null && state.session.history.past.length > 0;
