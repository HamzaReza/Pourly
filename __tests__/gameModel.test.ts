import {
  createSession,
  elapsedOf,
  isResumable,
  reduceAddTube,
  reduceHintUsed,
  reduceMarkWon,
  reducePause,
  reducePour,
  reduceRestart,
  reduceResume,
  reduceSkip,
  reduceUndo,
  type GameSession,
} from '@/state/gameModel';
import { useGameStore } from '@/state/gameStore';

import { almostWon, levelOf, revealBoard, stuckBoard, tube } from '../test-utils/boards';

const T0 = 1_000_000;

const fresh = (value = revealBoard()): GameSession => createSession(levelOf(5, value), 'level', T0);

const pour = (session: GameSession, from: number, to: number, now = T0): GameSession => {
  const step = reducePour(session, { from, to }, now);
  if (step === null) throw new Error('pour refused');
  return step.session;
};

describe('session reducers', () => {
  it('creates a running, playing session', () => {
    const session = fresh();
    expect(session).toMatchObject({
      levelNumber: 5,
      levelId: 'level-5',
      status: 'playing',
      moves: 0,
      runningSince: T0,
    });
    expect(createSession(levelOf(5, stuckBoard()), 'level', T0).status).toBe('stuck');
    expect(createSession(levelOf(5, revealBoard()), 'daily', T0).levelNumber).toBe(0);
  });

  it('commits a legal pour (revealing the hidden segment) and refuses an illegal one', () => {
    const step = reducePour(fresh(), { from: 0, to: 2 }, T0);
    expect(step?.outcome.result).toEqual({ count: 1, revealed: [1] });
    expect(step?.session.moves).toBe(1);
    expect(step?.session.history.current.tubes[0]?.[1]).toEqual({ color: 0, hidden: false });
    expect(reducePour(fresh(), { from: 1, to: 0 }, T0)).toBeNull();
  });

  it('detects the win and stops the clock', () => {
    const won = pour(fresh(almostWon()), 1, 0, T0 + 5000);
    expect(won.status).toBe('won');
    expect(won.runningSince).toBeNull();
    expect(won.elapsedMs).toBe(5000);
    expect(reducePour(won, { from: 0, to: 3 }, T0)).toBeNull();
  });

  it('undo restores the exact previous board, takes a move back and counts the undo', () => {
    const start = fresh();
    const after = pour(start, 0, 2);
    const undone = reduceUndo(after, false);
    expect(undone?.history.current).toBe(start.history.current);
    expect(undone?.history.current.tubes[0]?.[1]?.hidden).toBe(true);
    expect(undone).toMatchObject({ moves: 0, undosUsed: 1, paidResourceUsedThisAttempt: false });
    expect(reduceUndo(after, true)?.paidResourceUsedThisAttempt).toBe(true);
    expect(reduceUndo(start, false)).toBeNull();
  });

  it('adds extra tubes up to the level cap, through all of history, so undo keeps them', () => {
    const after = pour(fresh(), 0, 2);
    const added = reduceAddTube(after);
    expect(added?.history.current.tubes).toHaveLength(5);
    expect(added?.paidResourceUsedThisAttempt).toBe(false);
    expect(reduceUndo(added!, false)?.history.current.tubes).toHaveLength(5);
    const second = reduceAddTube(added!);
    expect(second).toMatchObject({ extraTubesAdded: 2 });
    expect(reduceAddTube(second!)).toBeNull();
  });

  it('turns a stuck board live again with the extra tube', () => {
    const stuck = createSession(levelOf(5, stuckBoard()), 'level', T0);
    expect(reduceAddTube(stuck)?.status).toBe('playing');
  });

  it('restart resets the attempt but keeps extra tubes, hints, restarts and time', () => {
    let session = pour(fresh(), 0, 2);
    session = reduceAddTube(session)!;
    session = reduceUndo(session, true)!;
    session = reduceHintUsed(session);
    const restarted = reduceRestart(reducePause(session, T0 + 3000), T0 + 9000)!;
    expect(restarted.history.current.tubes).toEqual([...session.initialBoard.tubes, []]);
    expect(restarted).toMatchObject({
      moves: 0,
      undosUsed: 0,
      extraTubesAdded: 1,
      paidResourceUsedThisAttempt: false,
      hintsUsed: 1,
      restartsThisLevel: 1,
      status: 'playing',
      elapsedMs: 3000,
      runningSince: T0 + 9000,
    });
    expect(reduceRestart(pour(fresh(almostWon()), 1, 0), T0)).toBeNull();
  });

  it('pauses and resumes with a pause-aware clock', () => {
    const session = fresh();
    const paused = reducePause(session, T0 + 4000);
    expect(paused).toMatchObject({
      status: 'paused',
      pausedFrom: 'playing',
      runningSince: null,
      elapsedMs: 4000,
    });
    expect(elapsedOf(paused, T0 + 60_000)).toBe(4000);
    const resumed = reduceResume(paused, T0 + 60_000);
    expect(resumed.status).toBe('playing');
    expect(elapsedOf(resumed, T0 + 61_000)).toBe(5000);
    const stuckPaused = reducePause(createSession(levelOf(5, stuckBoard()), 'level', T0), T0);
    expect(reduceResume(stuckPaused, T0).status).toBe('stuck');
  });

  it('records the win result and the skip', () => {
    const won = pour(fresh(almostWon()), 1, 0);
    const result = { stars: 3 as const, coins: 16, skipped: false, doubled: false };
    expect(reduceMarkWon(won, result)?.result).toEqual(result);
    expect(reduceMarkWon(fresh(), result)).toBeNull();
    const skipped = reduceSkip(fresh(), T0 + 2000)!;
    expect(skipped).toMatchObject({ status: 'won', result: { stars: 1, coins: 0, skipped: true } });
    expect(reduceSkip(skipped, T0)).toBeNull();
  });

  it('isResumable needs an unfinished level-mode session for the progress level', () => {
    expect(isResumable(fresh(), 5)).toBe(true);
    expect(isResumable(fresh(), 6)).toBe(false);
    expect(isResumable(null, 5)).toBe(false);
    expect(isResumable(pour(fresh(almostWon()), 1, 0), 5)).toBe(false);
    expect(isResumable(createSession(levelOf(5, revealBoard()), 'daily', T0), 0)).toBe(false);
  });
});

describe('game store actions', () => {
  beforeEach(() => {
    useGameStore.setState({ session: null, hint: null });
  });

  it('commitPour returns the outcome and clears the hint', () => {
    const store = useGameStore.getState();
    store.loadLevel(levelOf(5, revealBoard()), 'level', T0);
    store.applyHint({ from: 0, to: 2 });
    expect(useGameStore.getState().hint).toEqual({ from: 0, to: 2 });
    expect(useGameStore.getState().session?.hintsUsed).toBe(1);
    expect(store.commitPour(1, 0, T0)).toBeNull();
    const outcome = store.commitPour(0, 2, T0);
    expect(outcome?.result.count).toBe(1);
    expect(useGameStore.getState().hint).toBeNull();
    expect(useGameStore.getState().session?.history.current).toBe(outcome?.board);
  });

  it('undo, addTube, restart and skip report whether they applied', () => {
    const store = useGameStore.getState();
    expect(store.undo(false)).toBe(false);
    store.loadLevel(levelOf(5, revealBoard()), 'level', T0);
    expect(store.undo(false)).toBe(false);
    store.commitPour(0, 2, T0);
    expect(store.undo(false)).toBe(true);
    expect(store.addTube()).toBe(true);
    expect(store.addTube()).toBe(true);
    expect(store.addTube()).toBe(false);
    expect(store.restart(T0)).toBe(true);
    expect(useGameStore.getState().session?.restartsThisLevel).toBe(1);
    expect(store.skip(T0)).toBe(true);
    expect(store.skip(T0)).toBe(false);
  });

  it('pause and resume change status only when they apply', () => {
    const store = useGameStore.getState();
    store.loadLevel(levelOf(5, revealBoard()), 'level', T0);
    store.pause(T0 + 10);
    const paused = useGameStore.getState().session;
    expect(paused?.status).toBe('paused');
    store.pause(T0 + 20);
    expect(useGameStore.getState().session).toBe(paused);
    store.resume(T0 + 30);
    expect(useGameStore.getState().session?.status).toBe('playing');
  });

  it('discardStale drops only a level session for another level', () => {
    const store = useGameStore.getState();
    store.loadLevel(levelOf(5, revealBoard()), 'level', T0);
    store.discardStale(5);
    expect(useGameStore.getState().session).not.toBeNull();
    store.discardStale(6);
    expect(useGameStore.getState().session).toBeNull();
    store.loadLevel(levelOf(5, revealBoard()), 'daily', T0);
    store.discardStale(6);
    expect(useGameStore.getState().session?.mode).toBe('daily');
  });

  it('restart keeps working with a stuck board', () => {
    const store = useGameStore.getState();
    store.loadLevel(
      levelOf(5, { tubes: [tube(0, 1, 0, 1), tube(1, 0, 1, 0)], capacity: 4 }),
      'level',
      T0,
    );
    expect(store.restart(T0)).toBe(true);
    expect(useGameStore.getState().session?.status).toBe('stuck');
  });
});
