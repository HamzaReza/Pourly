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
  activateSession,
  createSession,
  encodeSlots,
  enterReplay,
  leaveReplay,
  mainSlots,
  isDailyResumable,
  isResumable,
  migrateGamePersisted,
  reduceAddTube,
  reduceHintUsed,
  reduceMarkAdTubeUsed,
  reduceMarkWon,
  reducePause,
  reducePour,
  reduceRestart,
  reduceResume,
  reduceSkip,
  reduceUndo,
  restoreSlots,
  SNAPSHOT_VERSION,
  switchSessionMode,
  type GameMode,
  type GameSession,
  type LevelResult,
  type PersistedGame,
  type SessionSlots,
} from './gameModel';

export * from './gameModel';

/** Coalesces snapshot writes after a burst of moves. */
export const SNAPSHOT_DEBOUNCE_MS = 600;

export interface GameState {
  /** The session the game screen plays. */
  session: GameSession | null;
  /**
   * An unfinished session of the other mode, kept (clock stopped) while the player is in this one,
   * so a daily game never discards a level in progress and vice versa.
   */
  parked: GameSession | null;
  /**
   * While a replay is the active session: the player's real slots (level and daily), untouched
   * until the replay ends. Null otherwise. Never persisted (the snapshot stores these slots).
   */
  stashed: SessionSlots | null;
  /** Suggested move shown on the board; cleared by the next pour, undo or restart. */
  hint: Move | null;
  /**
   * `tubeAdKey` of the session whose free +Tube ad could not be shown: its +Tube is priced in
   * coins instead (the ad tube itself stays unused). Transient, never persisted; it lapses when
   * another session (level, daily date or fresh start) becomes active.
   */
  tubeAdUnavailableFor: string | null;
}

export interface GameActions {
  /**
   * Starts `level` fresh. An unfinished session of the other mode is parked; one of the same mode
   * is replaced. A `replay` stashes both real slots instead; any other mode ends a replay first.
   */
  loadLevel: (level: Level, mode: GameMode, now?: number) => void;
  /** Drops the replay on screen (if any) and brings the stashed real slots back. */
  exitReplay: () => void;
  /** Makes the parked session of `mode` active (parking the current one); false when none. */
  switchTo: (mode: GameMode, now?: number) => boolean;
  /** Commits a pour; returns the outcome, or null when it is not legal on the live board. */
  commitPour: (from: number, to: number, now?: number) => PourOutcome | null;
  /** Takes back the last pour; `paid` when it cost inventory, coins or an ad. */
  undo: (paid: boolean) => boolean;
  restart: (now?: number) => boolean;
  /** Adds an extra tube (up to the level's cap); `viaAd` also spends the level's ad tube. */
  addTube: (viaAd?: boolean) => boolean;
  /** Spends the level's ad tube without adding one (the earned unit was banked instead). */
  markAdTubeUsed: () => boolean;
  /** The active session's +Tube ad could not be shown: price its +Tube in coins from now on. */
  markTubeAdUnavailable: () => void;
  /** Forgets `markTubeAdUnavailable` (the player left the game screen). */
  clearTubeAdUnavailable: () => void;
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
  /**
   * Drops a level-mode session that does not belong to `progressLevel` and, when `dailyId` is
   * given, a daily session for another day.
   */
  discardStale: (progressLevel: number, dailyId?: string) => void;
  /** Forgets both slots (reset progress). */
  clearAll: () => void;
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
        parked: null,
        stashed: null,
        hint: null,
        tubeAdUnavailableFor: null,
        loadLevel: (level, mode, now = Date.now()) => {
          const session = createSession(level, mode, now);
          if (mode === 'replay') {
            set({ ...enterReplay(get(), session, now), hint: null });
            return;
          }
          const main = leaveReplay(get());
          set({ ...activateSession(main, session, now), stashed: null, hint: null });
        },
        exitReplay: () => {
          const state = get();
          if (state.session?.mode === 'replay') set({ ...leaveReplay(state), hint: null });
        },
        switchTo: (mode, now = Date.now()) => {
          const state = get();
          const leaving = state.session?.mode === 'replay' && mode !== 'replay';
          const main = leaving ? leaveReplay(state) : state;
          if (main.session?.mode === mode) {
            if (leaving) set({ ...main, hint: null });
            return true;
          }
          const next = switchSessionMode(main, mode, now);
          if (next.session === main.session) {
            if (leaving) set({ ...main, hint: null });
            return false;
          }
          set({ ...next, stashed: null, hint: null });
          return true;
        },
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
        addTube: (viaAd = false) => update((session) => reduceAddTube(session, viaAd)),
        markAdTubeUsed: () => update(reduceMarkAdTubeUsed),
        markTubeAdUnavailable: () => {
          const { session } = get();
          if (session !== null) set({ tubeAdUnavailableFor: tubeAdKey(session) });
        },
        clearTubeAdUnavailable: () => {
          if (get().tubeAdUnavailableFor !== null) set({ tubeAdUnavailableFor: null });
        },
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
        discardStale: (progressLevel, dailyId) => {
          const stale = (slot: GameSession | null): boolean => {
            if (slot === null) return false;
            if (slot.mode === 'level') return !isResumable(slot, progressLevel);
            return dailyId !== undefined && !isDailyResumable(slot, dailyId);
          };
          const state = get();
          // During a replay the real slots wait in the stash; the replay itself is never stale.
          const replaying = state.session?.mode === 'replay';
          const { session, parked } = mainSlots(state);
          const dropSession = stale(session);
          const dropParked = stale(parked);
          if (!dropSession && !dropParked) return;
          const kept = {
            session: dropSession ? null : session,
            parked: dropParked ? null : parked,
          };
          if (replaying) set({ stashed: kept });
          else set({ ...kept, ...(dropSession ? { hint: null } : {}) });
        },
        clearAll: () =>
          set({
            session: null,
            parked: null,
            stashed: null,
            hint: null,
            tubeAdUnavailableFor: null,
          }),
      };
    },
    {
      name: STORAGE_KEYS.game,
      version: SNAPSHOT_VERSION,
      storage: createJSONStorage<PersistedGame>(() => snapshotStorage),
      partialize: (state) => encodeSlots(mainSlots(state), Date.now()),
      migrate: (persisted, version) => migrateGamePersisted(persisted, version),
      merge: (persisted, current) => ({ ...current, ...restoreSlots(persisted) }),
    },
  ),
);

/** Identifies one play of a level (restarts and resumes keep it; a fresh start changes it). */
export const tubeAdKey = (session: GameSession): string =>
  `${session.levelId}@${session.startedAt}`;

/** True when the active session's free +Tube ad could not be shown, so coins are offered instead. */
export const selectTubeAdUnavailable = (state: GameState): boolean =>
  state.session !== null && state.tubeAdUnavailableFor === tubeAdKey(state.session);

/** Narrow selector helpers. */
export const selectBoard = (state: GameStore) => state.session?.history.current ?? null;
export const selectStatus = (state: GameStore) => state.session?.status ?? null;
export const selectCanUndo = (state: GameStore) =>
  state.session !== null && state.session.history.past.length > 0;

/** The level-mode session, active, parked or stashed behind a replay. */
export const selectLevelSlot = (state: GameState): GameSession | null => {
  const slots = mainSlots(state);
  if (slots.session?.mode === 'level') return slots.session;
  return slots.parked?.mode === 'level' ? slots.parked : null;
};

/** The daily session, active, parked or stashed behind a replay. */
export const selectDailySlot = (state: GameState): GameSession | null => {
  const slots = mainSlots(state);
  if (slots.session?.mode === 'daily') return slots.session;
  return slots.parked?.mode === 'daily' ? slots.parked : null;
};
