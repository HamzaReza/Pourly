import { ECONOMY } from '@/config/economy';
import { getLevel } from '@/game/generator';
import { ads, type RewardedResult } from '@/services/ads';
import { track } from '@/services/analytics';
import {
  activatePowerUp,
  buyPowerUpWithAd,
  commitPlayerPour,
  costOf,
  doubleWinCoins,
  ensureLevelSession,
  isSkipOffered,
  onNextPressed,
  restartLevel,
  restartNeedsConfirm,
  skipWithAd,
} from '@/state/gameFlow';
import { useGameStore } from '@/state/gameStore';
import { prepareLevel } from '@/state/levelLoader';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';

import { almostWon, levelOf, oneFromStuck, revealBoard } from '../test-utils/boards';

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
jest.mock('@/state/levelLoader', () => {
  const actual = jest.requireActual('@/state/levelLoader');
  return { ...actual, prepareLevel: jest.fn((n: number) => Promise.resolve(actual.levelNow(n))) };
});

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const showRewarded = ads.showRewarded as jest.MockedFunction<typeof ads.showRewarded>;
const adResult = (result: RewardedResult) => showRewarded.mockResolvedValueOnce(result);

const setProgress = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({ ...createDefaultProgress(NOW), ...overrides });
const session = () => useGameStore.getState().session!;
const load = (n: number, value = revealBoard()) =>
  useGameStore.getState().loadLevel(levelOf(n, value), 'level', NOW);

beforeEach(() => {
  jest.clearAllMocks();
  useGameStore.setState({ session: null, hint: null });
  setProgress();
});

describe('starting a level', () => {
  it('starts the progress level synchronously, or resumes a matching session', () => {
    setProgress({ level: 2 });
    expect(ensureLevelSession(NOW)).toBeNull();
    expect(session().levelId).toBe('level-2');
    expect(track).toHaveBeenLastCalledWith('level_start', {
      level: 2,
      mode: 'level',
      resumed: false,
    });
    useGameStore.getState().pause(NOW + 10);
    const before = session();
    expect(ensureLevelSession(NOW + 20)).toBeNull();
    expect(session().status).toBe('playing');
    expect(session().history).toBe(before.history);
    expect(track).toHaveBeenLastCalledWith('level_start', {
      level: 2,
      mode: 'level',
      resumed: true,
    });
  });

  it('onNextPressed loads the player next level', () => {
    setProgress({ level: 6 });
    onNextPressed(NOW);
    expect(session().levelId).toBe('level-6');
    expect(session().initialBoard).toBe(getLevel(6).board);
  });
});

describe('commitPlayerPour', () => {
  it('grants the win at commit: stars, coins, next level, result and analytics', () => {
    setProgress({ level: 7, coins: 100 });
    load(7, almostWon());
    expect(commitPlayerPour(1, 0, NOW)).not.toBeNull();
    const progress = useProgressStore.getState();
    expect(progress).toMatchObject({ level: 8, coins: 116, tutorialDone: true });
    expect(progress.stars[7]).toBe(3);
    expect(session().result).toEqual({ stars: 3, coins: 16, skipped: false, doubled: false });
    expect(prepareLevel).toHaveBeenCalledWith(8);
    expect(track).toHaveBeenCalledWith(
      'level_complete',
      expect.objectContaining({ level: 7, stars: 3, coins: 16, skipped: false }),
    );
  });

  it('pays double on a hard level for VIPs and leaves the tutorial alone before level 3', () => {
    setProgress({ level: 10, coins: 0, entitlements: { noAds: false, vip: true } });
    load(10, almostWon());
    commitPlayerPour(1, 0, NOW);
    expect(useProgressStore.getState().coins).toBe(64);
    setProgress({ level: 2 });
    load(2, almostWon());
    commitPlayerPour(1, 0, NOW);
    expect(useProgressStore.getState().tutorialDone).toBe(false);
  });

  it('reports level_stuck once, and returns null for an illegal pour', () => {
    load(4, oneFromStuck());
    expect(commitPlayerPour(1, 0, NOW)).toBeNull();
    commitPlayerPour(0, 2, NOW);
    expect(session().status).toBe('stuck');
    expect(track).toHaveBeenCalledWith('level_stuck', { level: 4, moves: 1 });
  });
});

describe('power-ups', () => {
  it('undo uses the free undos, then inventory, then coins, then asks for payment', () => {
    setProgress({ undos: 1, coins: ECONOMY.undoCost });
    load(4);
    const pourAndUndo = () => {
      commitPlayerPour(0, 2, NOW);
      return activatePowerUp('undo', null, NOW);
    };
    for (let i = 0; i < 3; i += 1)
      expect(pourAndUndo()).toEqual({ kind: 'applied', source: 'free' });
    expect(session().paidResourceUsedThisAttempt).toBe(false);
    expect(pourAndUndo()).toEqual({ kind: 'applied', source: 'inventory' });
    expect(pourAndUndo()).toEqual({ kind: 'applied', source: 'coins' });
    expect(useProgressStore.getState()).toMatchObject({ undos: 0, coins: 0 });
    expect(pourAndUndo()).toEqual({
      kind: 'needsPayment',
      powerUp: 'undo',
      cost: ECONOMY.undoCost,
    });
    expect(session().paidResourceUsedThisAttempt).toBe(true);
    expect(track).toHaveBeenCalledWith('undo_used', { level: 4, source: 'coins' });
  });

  it('undo is unavailable with nothing to undo', () => {
    load(4);
    expect(activatePowerUp('undo')).toEqual({ kind: 'unavailable' });
  });

  it('hint needs a move, then charges inventory before coins', () => {
    setProgress({ hints: 1, coins: 30 });
    load(4);
    expect(activatePowerUp('hint', null)).toEqual({ kind: 'unavailable' });
    expect(useProgressStore.getState().hints).toBe(1);
    const move = { from: 0, to: 2 };
    expect(activatePowerUp('hint', move)).toEqual({ kind: 'applied', source: 'inventory' });
    expect(useGameStore.getState().hint).toEqual(move);
    expect(activatePowerUp('hint', move)).toEqual({ kind: 'applied', source: 'coins' });
    expect(useProgressStore.getState().coins).toBe(5);
    expect(activatePowerUp('hint', move).kind).toBe('needsPayment');
  });

  it('extra tube: once per attempt, a restart frees it again', () => {
    setProgress({ extraTubes: 1, coins: 0 });
    load(4);
    expect(costOf('extraTube').kind).toBe('inventory');
    expect(activatePowerUp('extraTube')).toEqual({ kind: 'applied', source: 'inventory' });
    expect(activatePowerUp('extraTube')).toEqual({ kind: 'unavailable' });
    expect(restartNeedsConfirm()).toBe(true);
    expect(restartLevel(NOW)).toBe(true);
    expect(track).toHaveBeenCalledWith('level_restart', { level: 4, restarts: 1 });
    expect(restartNeedsConfirm()).toBe(false);
    expect(activatePowerUp('extraTube')).toEqual({
      kind: 'needsPayment',
      powerUp: 'extraTube',
      cost: ECONOMY.extraTubeCost,
    });
  });

  it('applies a power-up bought with an ad only when earned', async () => {
    load(4);
    const board = session().history.current;
    adResult('dismissed');
    await expect(buyPowerUpWithAd('extraTube', null, null)).resolves.toEqual({ kind: 'none' });
    expect(session().extraTubeUsed).toBe(false);
    adResult('earned');
    await expect(buyPowerUpWithAd('hint', { from: 0, to: 2 }, board)).resolves.toEqual({
      kind: 'applied',
    });
    expect(useGameStore.getState().hint).toEqual({ from: 0, to: 2 });
    expect(showRewarded).toHaveBeenLastCalledWith('HINT');
    expect(track).toHaveBeenCalledWith('hint_used', { level: 4, source: 'ad' });
  });

  it('banks an earned unit when the board changed during the ad', async () => {
    setProgress({ hints: 0 });
    load(4);
    const board = session().history.current;
    showRewarded.mockImplementationOnce(async () => {
      commitPlayerPour(0, 2, NOW);
      return 'earned';
    });
    await expect(buyPowerUpWithAd('hint', { from: 0, to: 2 }, board)).resolves.toEqual({
      kind: 'granted',
      reward: { hints: 1 },
    });
    expect(useProgressStore.getState().hints).toBe(1);
    expect(useGameStore.getState().hint).toBeNull();
  });
});

describe('skip and double coins', () => {
  it('offers skip by the stuck, restart and time rules', () => {
    load(4);
    expect(isSkipOffered(session(), NOW)).toBe(false);
    expect(isSkipOffered(session(), NOW + 120_000)).toBe(true);
    for (let i = 0; i < 3; i += 1) restartLevel(NOW);
    expect(isSkipOffered(session(), NOW)).toBe(true);
    load(4, oneFromStuck());
    commitPlayerPour(0, 2, NOW);
    useGameStore.getState().pause(NOW);
    expect(isSkipOffered(session(), NOW)).toBe(true);
    expect(isSkipOffered(null, NOW)).toBe(false);
  });

  it('skips only when the ad is earned: 1 star, no coins', async () => {
    setProgress({ level: 3, coins: 50 });
    load(3);
    adResult('dismissed');
    await expect(skipWithAd()).resolves.toBe(false);
    expect(session().status).toBe('playing');
    adResult('earned');
    await expect(skipWithAd()).resolves.toBe(true);
    expect(showRewarded).toHaveBeenLastCalledWith('SKIP_LEVEL');
    expect(session().result).toMatchObject({ skipped: true, stars: 1, coins: 0 });
    expect(useProgressStore.getState()).toMatchObject({ level: 4, coins: 50, tutorialDone: true });
    expect(useProgressStore.getState().stars[3]).toBe(1);
  });

  it('doubles the win coins once', async () => {
    setProgress({ level: 7, coins: 0 });
    load(7, almostWon());
    commitPlayerPour(1, 0, NOW);
    adResult('earned');
    await expect(doubleWinCoins()).resolves.toBe(true);
    expect(useProgressStore.getState().coins).toBe(32);
    expect(session().result?.doubled).toBe(true);
    await expect(doubleWinCoins()).resolves.toBe(false);
    expect(showRewarded).toHaveBeenCalledTimes(1);
  });
});
