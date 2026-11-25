import type { Level } from '@/game/types';
import { ads } from '@/services/ads';
import { track } from '@/services/analytics';
import { readyDaily, prepareDaily } from '@/state/dailyLoader';
import {
  commitPlayerPour,
  ensureDailySession,
  ensureLevelSession,
  isSkipOffered,
  localToday,
  skipWithAd,
} from '@/state/gameFlow';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';

import { almostWon, levelOf, revealBoard, stuckBoard } from '../test-utils/boards';

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
jest.mock('@/state/dailyLoader', () => ({ readyDaily: jest.fn(), prepareDaily: jest.fn() }));
jest.mock('@/state/levelLoader', () => {
  const actual = jest.requireActual('@/state/levelLoader');
  return { ...actual, prepareLevel: jest.fn((n: number) => Promise.resolve(actual.levelNow(n))) };
});

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const TODAY = localToday(NOW);
const readyMock = readyDaily as jest.MockedFunction<typeof readyDaily>;
const prepareMock = prepareDaily as jest.MockedFunction<typeof prepareDaily>;

const dailyLevel = (board = almostWon(), date = TODAY): Level => ({
  ...levelOf(0, board),
  id: `daily-${date}`,
});
const setProgress = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({ ...createDefaultProgress(NOW), lastSeenAt: 0, ...overrides });
const game = () => useGameStore.getState();
const events = () => (track as jest.Mock).mock.calls.map(([name]) => name);

beforeEach(() => {
  jest.clearAllMocks();
  useGameStore.setState({ session: null, parked: null, hint: null });
  setProgress({ level: 12 });
  readyMock.mockReturnValue(null);
});

describe('ensureDailySession', () => {
  it('starts a ready board and parks the level in progress', () => {
    game().loadLevel(levelOf(12, revealBoard()), 'level', NOW);
    readyMock.mockReturnValue(dailyLevel());
    expect(ensureDailySession(TODAY, NOW)).toBeNull();
    expect(game().session?.levelId).toBe(`daily-${TODAY}`);
    expect(game().parked?.levelId).toBe('level-12');
    expect(track).toHaveBeenCalledWith('daily_started', { date: TODAY });
  });

  it("resumes today's board from the parked slot", () => {
    game().loadLevel(dailyLevel(revealBoard()), 'daily', NOW);
    game().loadLevel(levelOf(12, revealBoard()), 'level', NOW);
    expect(ensureDailySession(TODAY, NOW + 1)).toBeNull();
    expect(game().session).toMatchObject({ mode: 'daily', status: 'playing' });
    expect(track).toHaveBeenCalledWith('level_start', { level: 0, mode: 'daily', resumed: true });
    expect(events()).not.toContain('daily_started');
  });

  it('waits for generation and drops a late board nobody wants', async () => {
    prepareMock.mockResolvedValue(dailyLevel());
    await ensureDailySession(TODAY, NOW);
    expect(game().session?.mode).toBe('daily');
    useGameStore.setState({ session: null, parked: null });
    await ensureDailySession(TODAY, NOW, () => false);
    expect(game().session).toBeNull();
  });

  it('ensureLevelSession brings a parked level back', () => {
    game().loadLevel(levelOf(12, revealBoard()), 'level', NOW);
    game().loadLevel(dailyLevel(revealBoard()), 'daily', NOW);
    expect(ensureLevelSession(NOW)).toBeNull();
    expect(game().session).toMatchObject({ levelId: 'level-12', status: 'playing' });
    expect(game().parked?.mode).toBe('daily');
  });
});

describe('daily win', () => {
  it('grants once per day, fires the events and keeps the level untouched', () => {
    readyMock.mockReturnValue(dailyLevel());
    ensureDailySession(TODAY, NOW);
    commitPlayerPour(1, 0, NOW + 1000);
    expect(useProgressStore.getState()).toMatchObject({ coins: 142, streak: 1, level: 12 });
    expect(game().session?.result).toMatchObject({
      coins: 42,
      daily: { streak: 1, rewarded: true },
    });
    expect(events()).toEqual(expect.arrayContaining(['daily_completed', 'level_complete']));
    expect(events()).not.toContain('streak_extended');

    ensureDailySession(TODAY, NOW + 2000);
    commitPlayerPour(1, 0, NOW + 3000);
    expect(useProgressStore.getState().coins).toBe(142);
    expect(game().session?.result).toMatchObject({ coins: 0, daily: { rewarded: false } });
  });

  it('emits streak_extended on a consecutive day', () => {
    const yesterday = localToday(NOW - 86_400_000);
    setProgress({ streak: 2, bestStreak: 2, lastDailyDate: yesterday });
    readyMock.mockReturnValue(dailyLevel());
    ensureDailySession(TODAY, NOW);
    commitPlayerPour(1, 0, NOW);
    expect(track).toHaveBeenCalledWith('streak_extended', { streak: 3 });
  });

  it('daily boards are never skippable', async () => {
    readyMock.mockReturnValue(dailyLevel(stuckBoard()));
    ensureDailySession(TODAY, NOW);
    expect(isSkipOffered(game().session, NOW)).toBe(false);
    expect(await skipWithAd()).toBe(false);
    expect(ads.showRewarded).not.toHaveBeenCalled();
  });
});
