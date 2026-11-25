import {
  activateSession,
  createSession,
  encodeSession,
  encodeSlots,
  migrateGamePersisted,
  reducePour,
  restoreSlots,
  SNAPSHOT_VERSION,
  switchSessionMode,
  type GameSession,
} from '@/state/gameModel';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { decideAutoStart, shouldAutoStart, consumeAutoStart } from '@/state/startup';

import { almostWon, levelOf, revealBoard } from '../test-utils/boards';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

const level = (n = 5): GameSession => createSession(levelOf(n, revealBoard()), 'level', NOW);
const daily = (date = '2026-11-24'): GameSession =>
  createSession({ ...levelOf(0, revealBoard()), id: `daily-${date}` }, 'daily', NOW);
const won = (session: GameSession): GameSession => {
  const step = reducePour(
    { ...session, history: { current: almostWon(), past: [] } },
    { from: 1, to: 0 },
    NOW,
  );
  if (step === null) throw new Error('not won');
  return step.session;
};

beforeEach(() => {
  useGameStore.setState({ session: null, parked: null, hint: null });
  useProgressStore.setState(createDefaultProgress(NOW));
  consumeAutoStart();
});

describe('slot reducers', () => {
  it('activating the other mode parks the unfinished session, paused', () => {
    const slots = activateSession({ session: level(), parked: null }, daily(), NOW + 5000);
    expect(slots.session?.mode).toBe('daily');
    expect(slots.parked).toMatchObject({ mode: 'level', status: 'paused', runningSince: null });
    expect(slots.parked?.elapsedMs).toBe(5000);
  });

  it('a finished session is not parked; a same-mode session replaces, keeping the parked one', () => {
    expect(
      activateSession({ session: won(level()), parked: null }, daily(), NOW).parked,
    ).toBeNull();
    const parked = daily();
    const slots = activateSession({ session: level(5), parked }, level(6), NOW);
    expect(slots.session?.levelId).toBe('level-6');
    expect(slots.parked).toBe(parked);
    expect(
      activateSession({ session: null, parked: daily() }, daily('2026-11-25'), NOW).parked,
    ).toBeNull();
  });

  it('switchSessionMode swaps slots or leaves them alone', () => {
    const start = { session: daily(), parked: level() };
    const swapped = switchSessionMode(start, 'level', NOW);
    expect(swapped.session).toBe(start.parked);
    expect(swapped.parked?.mode).toBe('daily');
    expect(switchSessionMode(start, 'daily', NOW)).toBe(start);
    expect(switchSessionMode({ session: daily(), parked: null }, 'level', NOW).session?.mode).toBe(
      'daily',
    );
    expect(
      switchSessionMode({ session: won(daily()), parked: level() }, 'level', NOW).parked,
    ).toBeNull();
  });

  it('encodes and restores both slots; old data without parked loads', () => {
    const encoded = encodeSlots({ session: daily(), parked: level() }, NOW);
    expect(encoded.parked?.mode).toBe('level');
    const restored = restoreSlots(JSON.parse(JSON.stringify(encoded)));
    expect(restored.session?.levelId).toBe('daily-2026-11-24');
    expect(restored.parked?.levelId).toBe('level-5');
    expect(encodeSlots({ session: level(), parked: null }, NOW)).not.toHaveProperty('parked');
    expect(restoreSlots({ snapshot: encodeSession(level(), NOW) }).parked).toBeNull();
    const sameMode = {
      snapshot: encodeSession(level(), NOW),
      parked: encodeSession(level(6), NOW),
    };
    expect(restoreSlots(sameMode).parked).toBeNull();
    expect(migrateGamePersisted(encoded, SNAPSHOT_VERSION).parked?.levelId).toBe('level-5');
  });
});

describe('game store slots', () => {
  it('loadLevel parks and switchTo swaps', () => {
    const store = useGameStore.getState();
    store.loadLevel(levelOf(5, revealBoard()), 'level', NOW);
    store.loadLevel({ ...levelOf(0, revealBoard()), id: 'daily-2026-11-24' }, 'daily', NOW);
    expect(useGameStore.getState().parked?.levelId).toBe('level-5');
    expect(useGameStore.getState().switchTo('level', NOW)).toBe(true);
    expect(useGameStore.getState().session?.levelId).toBe('level-5');
    expect(useGameStore.getState().switchTo('level', NOW)).toBe(true);
    useGameStore.setState({ parked: null });
    expect(useGameStore.getState().switchTo('daily', NOW)).toBe(false);
  });

  it('discardStale drops another level and another day only', () => {
    useGameStore.setState({ session: daily('2026-11-23'), parked: level(5) });
    useGameStore.getState().discardStale(5, 'daily-2026-11-24');
    expect(useGameStore.getState().session).toBeNull();
    expect(useGameStore.getState().parked?.levelId).toBe('level-5');
    useGameStore.setState({ session: daily('2026-11-24'), parked: level(4) });
    useGameStore.getState().discardStale(5, 'daily-2026-11-24');
    expect(useGameStore.getState().session?.levelId).toBe('daily-2026-11-24');
    expect(useGameStore.getState().parked).toBeNull();
    useGameStore.setState({ session: daily('2026-11-23'), parked: null });
    useGameStore.getState().discardStale(5);
    expect(useGameStore.getState().session).not.toBeNull();
  });

  it('clearAll forgets both slots', () => {
    useGameStore.setState({ session: daily(), parked: level() });
    useGameStore.getState().clearAll();
    expect(useGameStore.getState()).toMatchObject({ session: null, parked: null, hint: null });
  });

  it('a parked game prevents the first-launch auto start', () => {
    useGameStore.setState({ session: null, parked: daily() });
    decideAutoStart();
    expect(shouldAutoStart()).toBe(false);
  });
});
