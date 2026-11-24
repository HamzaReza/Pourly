import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/config/constants';
import { createDebouncedStorage } from '@/state/debouncedStorage';
import {
  createSession,
  decodeSession,
  encodeSession,
  migrateGamePersisted,
  reduceAddTube,
  reducePause,
  reducePour,
  restoreSession,
  SNAPSHOT_VERSION,
  type GameSession,
  type WireSession,
} from '@/state/gameModel';
import { flushGameSnapshot, SNAPSHOT_DEBOUNCE_MS, useGameStore } from '@/state/gameStore';

import { almostWon, levelOf, revealBoard } from '../test-utils/boards';

const T0 = 2_000_000;

const played = (): GameSession => {
  const start = createSession(levelOf(5, revealBoard()), 'level', T0);
  const step = reducePour(start, { from: 0, to: 2 }, T0 + 1000);
  return reduceAddTube(step!.session)!;
};

const wire = (): WireSession => encodeSession(played(), T0 + 3000)!;

describe('snapshot encoding', () => {
  it('round-trips the board, history, hidden flags and counters', () => {
    const session = played();
    const encoded = encodeSession(session, T0 + 3000)!;
    expect(encoded.initial).toEqual(['bAb', 'aaa', '', 'bb']);
    expect(encoded.current).toEqual(['ba', 'aaa', 'b', 'bb', '']);
    expect(encoded.past).toEqual([['bAb', 'aaa', '', 'bb', '']]);
    expect(encoded.elapsedMs).toBe(3000);
    const restored = decodeSession(JSON.parse(JSON.stringify(encoded)))!;
    expect(restored.history.current).toEqual(session.history.current);
    expect(restored.history.past).toEqual(session.history.past);
    expect(restored.initialBoard).toEqual(session.initialBoard);
    expect(restored).toMatchObject({
      moves: 1,
      extraTubeUsed: true,
      paidResourceUsedThisAttempt: true,
      elapsedMs: 3000,
      runningSince: null,
      status: 'playing',
    });
  });

  it('keeps a pause and stores nothing for a finished level', () => {
    const paused = reducePause(played(), T0 + 5000);
    expect(decodeSession(encodeSession(paused, T0 + 9000))).toMatchObject({
      status: 'paused',
      pausedFrom: 'playing',
      elapsedMs: 5000,
    });
    const won = reducePour(
      createSession(levelOf(5, almostWon()), 'level', T0),
      { from: 1, to: 0 },
      T0,
    )!.session;
    expect(encodeSession(won, T0)).toBeNull();
    expect(encodeSession(null, T0)).toBeNull();
  });

  it.each<[string, (value: WireSession) => unknown]>([
    ['a bad segment character', (v) => ({ ...v, current: ['b!', 'aaa', 'b', 'bb', ''] })],
    ['a hidden top', (v) => ({ ...v, current: ['bA', 'aaa', 'b', 'bb', ''] })],
    ['a wrong tube count', (v) => ({ ...v, current: ['ba', 'aaa', 'b', 'bb'] })],
    ['changed colors', (v) => ({ ...v, current: ['bb', 'aaa', 'b', 'bb', ''] })],
    ['an overfull tube', (v) => ({ ...v, current: ['ba', 'aaaaa', 'b', 'bb', ''] })],
    ['a bad history entry', (v) => ({ ...v, past: [['zz']] })],
    ['a bad status', (v) => ({ ...v, status: 'won' })],
    ['a negative counter', (v) => ({ ...v, moves: -1 })],
    ['a mismatched level id', (v) => ({ ...v, levelId: 'level-6' })],
    [
      'a won board',
      (v) => ({
        ...v,
        current: ['aaaa', 'bbbb', '', '', ''],
        initial: ['aaaa', 'bbbb', '', ''],
        past: [],
      }),
    ],
    ['not an object', () => 'corrupt'],
  ])('rejects %s', (_name, mutate) => {
    expect(decodeSession(mutate(wire()))).toBeNull();
  });

  it('migrates by version and drops unknown versions', () => {
    expect(migrateGamePersisted({ snapshot: wire() }, SNAPSHOT_VERSION).snapshot?.levelId).toBe(
      'level-5',
    );
    expect(migrateGamePersisted({ snapshot: wire() }, SNAPSHOT_VERSION + 1)).toEqual({
      snapshot: null,
    });
    expect(migrateGamePersisted({ snapshot: wire() }, 0)).toEqual({ snapshot: null });
    expect(migrateGamePersisted(null, SNAPSHOT_VERSION)).toEqual({ snapshot: null });
    expect(restoreSession({ snapshot: wire() })?.levelId).toBe('level-5');
    expect(restoreSession(undefined)).toBeNull();
  });
});

describe('debounced storage', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const fakeBase = () => {
    const written: [string, string][] = [];
    return {
      written,
      base: {
        getItem: jest.fn((_name: string) => 'stored'),
        setItem: jest.fn((name: string, value: string) => {
          written.push([name, value]);
        }),
        removeItem: jest.fn(),
      },
    };
  };

  it('coalesces writes and only writes the latest value after the delay', async () => {
    const { base, written } = fakeBase();
    const storage = createDebouncedStorage(base, 500);
    storage.setItem('k', '1');
    jest.advanceTimersByTime(300);
    storage.setItem('k', '2');
    expect(storage.getItem('k')).toBe('2');
    jest.advanceTimersByTime(499);
    expect(written).toEqual([]);
    jest.advanceTimersByTime(1);
    await Promise.resolve();
    expect(written).toEqual([['k', '2']]);
    expect(storage.getItem('k')).toBe('stored');
  });

  it('flushes pending writes immediately and removeItem cancels them', async () => {
    const { base, written } = fakeBase();
    const storage = createDebouncedStorage(base, 500);
    storage.setItem('a', 'x');
    await storage.flush();
    expect(written).toEqual([['a', 'x']]);
    storage.setItem('b', 'y');
    await storage.removeItem('b');
    jest.advanceTimersByTime(1000);
    expect(written).toEqual([['a', 'x']]);
    expect(base.removeItem).toHaveBeenCalledWith('b');
  });
});

describe('game store persistence', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    await AsyncStorage.clear();
    useGameStore.setState({ session: null, hint: null });
    await flushGameSnapshot();
    await AsyncStorage.clear();
  });
  afterEach(() => jest.useRealTimers());

  const stored = async (): Promise<{
    state: { snapshot: WireSession | null };
    version: number;
  } | null> => {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.game);
    return raw === null ? null : JSON.parse(raw);
  };

  it('saves the session after the debounce, or at once on flush', async () => {
    useGameStore.getState().loadLevel(levelOf(5, revealBoard()), 'level', T0);
    useGameStore.getState().commitPour(0, 2, T0);
    expect(await stored()).toBeNull();
    jest.advanceTimersByTime(SNAPSHOT_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    const saved = await stored();
    expect(saved?.version).toBe(SNAPSHOT_VERSION);
    expect(saved?.state.snapshot?.current).toEqual(['ba', 'aaa', 'b', 'bb']);

    useGameStore.getState().undo(false);
    await flushGameSnapshot();
    expect((await stored())?.state.snapshot?.current).toEqual(['bAb', 'aaa', '', 'bb']);
  });

  it('rehydrates a stored snapshot with the clock stopped, and rejects a corrupt one', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEYS.game,
      JSON.stringify({ state: { snapshot: wire() }, version: SNAPSHOT_VERSION }),
    );
    await useGameStore.persist.rehydrate();
    expect(useGameStore.getState().session).toMatchObject({
      levelId: 'level-5',
      moves: 1,
      runningSince: null,
    });

    await AsyncStorage.setItem(
      STORAGE_KEYS.game,
      JSON.stringify({
        state: { snapshot: { ...wire(), current: ['zz'] } },
        version: SNAPSHOT_VERSION,
      }),
    );
    await useGameStore.persist.rehydrate();
    expect(useGameStore.getState().session).toBeNull();
  });

  it('writes an empty snapshot once the level is won', async () => {
    useGameStore.getState().loadLevel(levelOf(5, almostWon()), 'level', T0);
    useGameStore.getState().commitPour(1, 0, T0);
    await flushGameSnapshot();
    expect((await stored())?.state.snapshot).toBeNull();
  });
});
