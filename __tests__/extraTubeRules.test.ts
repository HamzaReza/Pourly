/**
 * +Tube rules (DECISIONS P12.3): a cap of 2 per level, inventory → one ad per level → coins →
 * Shop, per-level scope (restart and parking keep it), restart keeps the tubes, the ad fallback
 * to coins, and the v2 resume snapshot.
 */
import { ECONOMY } from '@/config/economy';
import { dailyLevelId } from '@/game/daily';
import { extraTubesLeft } from '@/game/economy';
import type { Board, Level } from '@/game/types';
import { ads, type RewardedResult } from '@/services/ads';
import { track } from '@/services/analytics';
import { activatePowerUp, buyPowerUpWithAd, costOf, restartLevel } from '@/state/gameFlow';
import {
  createSession,
  decodeSession,
  encodeSession,
  migrateGamePersisted,
  reduceAddTube,
  reduceMarkAdTubeUsed,
  reducePour,
  reduceRestart,
  type GameSession,
  type WireSession,
} from '@/state/gameModel';
import { selectTubeAdUnavailable, useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';

import { levelOf, revealBoard, stuckBoard } from '../test-utils/boards';

jest.mock('@/services/audio', () => ({
  pauseAll: jest.fn(),
  resumeAll: jest.fn(),
  play: jest.fn(),
}));
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/ads', () => ({
  ads: {
    showRewarded: jest.fn(),
    isRewardedReady: jest.fn(),
    showInterstitial: jest.fn(),
    preload: jest.fn(),
  },
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const T0 = 1_000_000;
const showRewarded = ads.showRewarded as jest.MockedFunction<typeof ads.showRewarded>;
const adResult = (result: RewardedResult) => showRewarded.mockResolvedValueOnce(result);

/** Default progress with an empty +Tube inventory and no coins unless overridden. */
const setProgress = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({
    ...createDefaultProgress(NOW),
    extraTubes: 0,
    coins: 0,
    ...overrides,
  });
const session = () => useGameStore.getState().session!;
const tubeCount = () => session().history.current.tubes.length;
const load = (n: number, value: Board = revealBoard()) =>
  useGameStore.getState().loadLevel(levelOf(n, value), 'level', NOW);
const dailyLevel = (date: string): Level => ({
  ...levelOf(1, revealBoard()),
  id: dailyLevelId(date),
});
const loadDaily = (date: string) =>
  useGameStore.getState().loadLevel(dailyLevel(date), 'daily', NOW);

const fresh = (value: Board = revealBoard()): GameSession =>
  createSession(levelOf(5, value), 'level', T0);
const played = (): GameSession =>
  reduceAddTube(reducePour(fresh(), { from: 0, to: 2 }, T0 + 1000)!.session)!;

beforeEach(() => {
  jest.clearAllMocks();
  useGameStore.setState({ session: null, parked: null, hint: null, tubeAdUnavailableFor: null });
  setProgress();
});

describe('extraTubesLeft', () => {
  it('counts down from the cap, never below 0, and treats bad input as 0 added', () => {
    expect(extraTubesLeft(0)).toBe(ECONOMY.maxExtraTubesPerLevel);
    expect(extraTubesLeft(1)).toBe(1);
    expect(extraTubesLeft(2)).toBe(0);
    expect(extraTubesLeft(7)).toBe(0);
    expect(extraTubesLeft(-3)).toBe(2);
    expect(extraTubesLeft(Number.NaN)).toBe(2);
    expect(extraTubesLeft(1.9)).toBe(1);
  });
});

describe('session reducers', () => {
  it('an ad tube sets the ad flag; marking it used works once', () => {
    const viaAd = reduceAddTube(fresh(), true)!;
    expect(viaAd).toMatchObject({ extraTubesAdded: 1, adTubeUsed: true });
    expect(reduceAddTube(fresh(), false)).toMatchObject({ extraTubesAdded: 1, adTubeUsed: false });
    const marked = reduceMarkAdTubeUsed(fresh())!;
    expect(marked).toMatchObject({ extraTubesAdded: 0, adTubeUsed: true });
    expect(reduceMarkAdTubeUsed(marked)).toBeNull();
  });

  it('restart after two tubes keeps both, live again, and the cap still holds', () => {
    let stuck = createSession(levelOf(5, stuckBoard()), 'level', T0);
    expect(stuck.status).toBe('stuck');
    stuck = reduceAddTube(reduceAddTube(stuck)!)!;
    const restarted = reduceRestart(stuck, T0 + 1000)!;
    expect(restarted.history.current.tubes).toEqual([...stuck.initialBoard.tubes, [], []]);
    expect(restarted.history.past).toEqual([]);
    expect(restarted).toMatchObject({ extraTubesAdded: 2, status: 'playing' });
    expect(reduceAddTube(restarted)).toBeNull();
  });
});

describe('resume snapshot v2', () => {
  const v1Of = (value: GameSession, used: boolean) => {
    const { extraTubesAdded: _count, adTubeUsed: _ad, ...rest } = encodeSession(value, T0)!;
    return { ...rest, extraTubeUsed: used };
  };

  it('migrates v1 for both slots: true → 1, false → 0, ad unused', () => {
    const daily = { ...v1Of(fresh(), false), mode: 'daily', levelId: 'daily-2026-11-24' };
    const out = migrateGamePersisted({ snapshot: v1Of(played(), true), parked: daily }, 1);
    expect(out.snapshot).toMatchObject({ extraTubesAdded: 1, adTubeUsed: false });
    expect(out.snapshot?.current).toHaveLength(5);
    expect(out.parked).toMatchObject({ extraTubesAdded: 0, adTubeUsed: false });
  });

  it('round-trips the count and the ad flag', () => {
    const session = reduceAddTube(played(), true)!;
    expect(decodeSession(encodeSession(session, T0 + 2000))).toMatchObject({
      extraTubesAdded: 2,
      adTubeUsed: true,
    });
  });

  it.each<[string, (value: WireSession) => unknown]>([
    ['a tube count that does not match', (v) => ({ ...v, extraTubesAdded: 2 })],
    ['a count above the cap', (v) => ({ ...v, extraTubesAdded: 3 })],
    ['a negative count', (v) => ({ ...v, extraTubesAdded: -1 })],
    ['a non-boolean ad flag', (v) => ({ ...v, adTubeUsed: 'yes' })],
    ['a missing ad flag', ({ adTubeUsed: _ad, ...v }) => v],
  ])('rejects %s', (_name, mutate) => {
    expect(decodeSession(mutate(encodeSession(played(), T0)!))).toBeNull();
  });
});

describe('payment order', () => {
  it('inventory, then the level ad, then coins, then the Shop, then the cap', async () => {
    setProgress({ extraTubes: 1, coins: ECONOMY.extraTubeCost * 2 - 1 });
    load(4);
    const start = tubeCount();
    expect(activatePowerUp('extraTube')).toEqual({ kind: 'applied', source: 'inventory' });
    expect(activatePowerUp('extraTube')).toEqual({ kind: 'needsAd', powerUp: 'extraTube' });
    adResult('earned');
    await expect(buyPowerUpWithAd('extraTube', null, null)).resolves.toEqual({ kind: 'applied' });
    expect(showRewarded).toHaveBeenLastCalledWith('EXTRA_TUBE', { quietUnavailable: true });
    expect(track).toHaveBeenCalledWith('extra_tube_used', { level: 4, source: 'ad' });
    expect(session()).toMatchObject({ extraTubesAdded: 2, adTubeUsed: true });
    expect(tubeCount()).toBe(start + 2);
    expect(costOf('extraTube')).toEqual({ kind: 'unavailable' });
    expect(activatePowerUp('extraTube')).toEqual({ kind: 'unavailable' });
  });

  it('after the ad tube, coins when affordable, otherwise the Shop only', () => {
    setProgress({ coins: ECONOMY.extraTubeCost + 10 });
    load(4);
    useGameStore.getState().markAdTubeUsed();
    expect(activatePowerUp('extraTube')).toEqual({ kind: 'applied', source: 'coins' });
    expect(useProgressStore.getState().coins).toBe(10);
    expect(activatePowerUp('extraTube')).toEqual({
      kind: 'needsShop',
      powerUp: 'extraTube',
      cost: ECONOMY.extraTubeCost,
    });
  });
});

describe('the +Tube ad', () => {
  it('is not shown again once the level used it', async () => {
    load(4);
    useGameStore.getState().markAdTubeUsed();
    await expect(buyPowerUpWithAd('extraTube', null, null)).resolves.toEqual({ kind: 'none' });
    expect(showRewarded).not.toHaveBeenCalled();
  });

  it('earned on a level that changed meanwhile banks the unit and leaves the new level alone', async () => {
    load(4);
    showRewarded.mockImplementationOnce(async () => {
      load(5);
      return 'earned';
    });
    await expect(buyPowerUpWithAd('extraTube', null, null)).resolves.toEqual({
      kind: 'granted',
      reward: { extraTubes: 1 },
    });
    expect(useProgressStore.getState().extraTubes).toBe(1);
    expect(session()).toMatchObject({ levelId: 'level-5', extraTubesAdded: 0, adTubeUsed: false });
  });

  it('earned while the tube no longer applies banks the unit and still spends the ad', async () => {
    load(4);
    useGameStore.getState().addTube();
    showRewarded.mockImplementationOnce(async () => {
      useGameStore.getState().addTube();
      return 'earned';
    });
    await expect(buyPowerUpWithAd('extraTube', null, null)).resolves.toMatchObject({
      kind: 'granted',
    });
    expect(session()).toMatchObject({ extraTubesAdded: 2, adTubeUsed: true });
    expect(useProgressStore.getState().extraTubes).toBe(1);
  });
});

describe('ad fallback to coins', () => {
  it('an ad that cannot be shown switches the level +Tube to coins without spending the ad', async () => {
    setProgress({ coins: ECONOMY.extraTubeCost });
    load(4);
    expect(costOf('extraTube')).toEqual({ kind: 'ad' });
    adResult('unavailable');
    await expect(buyPowerUpWithAd('extraTube', null, null)).resolves.toEqual({
      kind: 'adUnavailable',
    });
    expect(showRewarded).toHaveBeenLastCalledWith('EXTRA_TUBE', { quietUnavailable: true });
    expect(selectTubeAdUnavailable(useGameStore.getState())).toBe(true);
    expect(costOf('extraTube')).toEqual({ kind: 'coins', cost: ECONOMY.extraTubeCost });
    expect(activatePowerUp('extraTube')).toEqual({ kind: 'applied', source: 'coins' });
    expect(session()).toMatchObject({ extraTubesAdded: 1, adTubeUsed: false });
    expect(costOf('extraTube')).toEqual({ kind: 'shop', cost: ECONOMY.extraTubeCost });
  });

  it('without enough coins the switched +Tube goes to the Shop only', async () => {
    setProgress({ coins: ECONOMY.extraTubeCost - 1 });
    load(4);
    adResult('unavailable');
    await buyPowerUpWithAd('extraTube', null, null);
    expect(activatePowerUp('extraTube')).toEqual({
      kind: 'needsShop',
      powerUp: 'extraTube',
      cost: ECONOMY.extraTubeCost,
    });
    expect(session().adTubeUsed).toBe(false);
  });

  it('inventory still comes first after the switch', async () => {
    setProgress({ coins: 999 });
    load(4);
    adResult('unavailable');
    await buyPowerUpWithAd('extraTube', null, null);
    useProgressStore.getState().grant({ extraTubes: 1 });
    expect(costOf('extraTube').kind).toBe('inventory');
  });

  it('the switch lasts through a restart, is not persisted and resets on another level', async () => {
    setProgress({ coins: 999 });
    load(4);
    adResult('unavailable');
    await buyPowerUpWithAd('extraTube', null, null);
    expect(restartLevel(NOW)).toBe(true);
    expect(costOf('extraTube').kind).toBe('coins');
    expect(encodeSession(session(), NOW)).not.toHaveProperty('tubeAdUnavailableFor');
    loadDaily('2026-11-24');
    expect(costOf('extraTube')).toEqual({ kind: 'ad' });
    // A fresh start of the same level is a new play (new `startedAt`).
    useGameStore.getState().loadLevel(levelOf(4, revealBoard()), 'level', NOW + 1);
    expect(costOf('extraTube')).toEqual({ kind: 'ad' });
    useGameStore.getState().markTubeAdUnavailable();
    useGameStore.getState().clearTubeAdUnavailable();
    expect(costOf('extraTube')).toEqual({ kind: 'ad' });
  });

  it('a dismissed ad adds nothing and keeps the +Tube on the ad', async () => {
    setProgress({ coins: 999 });
    load(4);
    adResult('dismissed');
    await expect(buyPowerUpWithAd('extraTube', null, null)).resolves.toEqual({ kind: 'none' });
    expect(session()).toMatchObject({ extraTubesAdded: 0, adTubeUsed: false });
    expect(useProgressStore.getState().coins).toBe(999);
    expect(costOf('extraTube')).toEqual({ kind: 'ad' });
  });

  it('other power-ups keep the generic ad call', async () => {
    load(4);
    adResult('unavailable');
    await expect(buyPowerUpWithAd('hint', { from: 0, to: 2 }, null)).resolves.toEqual({
      kind: 'adUnavailable',
    });
    expect(showRewarded).toHaveBeenLastCalledWith('HINT');
    expect(selectTubeAdUnavailable(useGameStore.getState())).toBe(false);
  });
});

describe('per-level scope', () => {
  it('survives restart and parking for a daily; resets on the next level', () => {
    setProgress({ extraTubes: 5 });
    load(4);
    activatePowerUp('extraTube');
    useGameStore.getState().markAdTubeUsed();
    expect(restartLevel(NOW)).toBe(true);
    expect(session()).toMatchObject({ extraTubesAdded: 1, adTubeUsed: true });
    loadDaily('2026-11-24');
    expect(session()).toMatchObject({ mode: 'daily', extraTubesAdded: 0, adTubeUsed: false });
    expect(useGameStore.getState().switchTo('level', NOW)).toBe(true);
    expect(session()).toMatchObject({ levelId: 'level-4', extraTubesAdded: 1, adTubeUsed: true });
    load(5);
    expect(session()).toMatchObject({ extraTubesAdded: 0, adTubeUsed: false });
  });

  it('a daily keeps its count until another date starts', () => {
    setProgress({ extraTubes: 5 });
    loadDaily('2026-11-24');
    activatePowerUp('extraTube');
    activatePowerUp('extraTube');
    expect(activatePowerUp('extraTube')).toEqual({ kind: 'unavailable' });
    expect(restartLevel(NOW)).toBe(true);
    expect(session().extraTubesAdded).toBe(2);
    loadDaily('2026-11-25');
    expect(session()).toMatchObject({ extraTubesAdded: 0, adTubeUsed: false });
  });
});
