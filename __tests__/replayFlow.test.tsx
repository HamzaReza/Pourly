import { fireEvent, render, screen } from '@testing-library/react-native';

import { ECONOMY } from '@/config/economy';
import { initI18n } from '@/i18n';
import { getTheme } from '@/render/themes';
import { ads } from '@/services/ads';
import { track } from '@/services/analytics';
import {
  commitPlayerPour,
  doubleWinCoins,
  ensureReplaySession,
  isSkipOffered,
  skipWithAd,
} from '@/state/gameFlow';
import { useGameStore } from '@/state/gameStore';
import { prepareLevel, readyLevel } from '@/state/levelLoader';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { WinOverlay } from '@/ui/game/overlays/WinOverlay';

import { almostWon, levelOf } from '../test-utils/boards';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
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
  return { ...actual, readyLevel: jest.fn(), prepareLevel: jest.fn() };
});

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const readyMock = readyLevel as jest.MockedFunction<typeof readyLevel>;
const prepareMock = prepareLevel as jest.MockedFunction<typeof prepareLevel>;
const showRewarded = ads.showRewarded as jest.Mock;
const trackMock = track as jest.Mock;
const ui = getTheme('classic').ui;

/** Level `n` as a board one pour (1 → 0) from solved, par `par`. */
const winnable = (n: number, par = 1) => levelOf(n, almostWon(), par);

const setProgress = (overrides: Partial<ProgressState>) =>
  useProgressStore.setState({ ...createDefaultProgress(NOW), tutorialDone: true, ...overrides });

const winReplay = () => {
  commitPlayerPour(1, 0, NOW + 1000);
  return useGameStore.getState().session;
};

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  useGameStore.getState().clearAll();
  readyMock.mockImplementation((n: number) => winnable(n));
  setProgress({
    level: 12,
    coins: 100,
    stars: { 1: 1, 2: 2, 3: 3, 10: 1 },
    review: { ...createDefaultProgress(NOW).review, threeStarStreak: 2 },
  });
});

describe('replay flow', () => {
  it('starts a replay of a completed level and reports it', () => {
    expect(ensureReplaySession(2, NOW)).toBeNull();
    expect(useGameStore.getState().session).toMatchObject({
      mode: 'replay',
      levelNumber: 2,
      levelId: 'level-2',
    });
    expect(trackMock).toHaveBeenCalledWith('level_start', {
      level: 2,
      mode: 'replay',
      resumed: false,
    });
    expect(trackMock).toHaveBeenCalledWith('replay_started', { level: 2, bestStars: 2 });
  });

  it('refuses levels the player has not completed', () => {
    expect(ensureReplaySession(12, NOW)).toBeNull();
    expect(ensureReplaySession(0, NOW)).toBeNull();
    expect(ensureReplaySession(1.5, NOW)).toBeNull();
    expect(useGameStore.getState().session).toBeNull();
    expect(readyMock).not.toHaveBeenCalled();
  });

  it('waits for an ungenerated level and drops it when no longer wanted', async () => {
    readyMock.mockReturnValue(null);
    prepareMock.mockResolvedValue(winnable(2));
    await ensureReplaySession(2, NOW, () => false);
    expect(useGameStore.getState().session).toBeNull();
    await ensureReplaySession(2, NOW);
    expect(useGameStore.getState().session?.mode).toBe('replay');
  });

  it('a better win pays only the star improvement and keeps level and the 3★ streak', () => {
    ensureReplaySession(1, NOW);
    const won = winReplay();
    const coins = ECONOMY.winBonus3Star;
    expect(won?.result).toEqual({
      stars: 3,
      coins,
      skipped: false,
      doubled: false,
      replay: { previousStars: 1, improved: true },
    });
    const progress = useProgressStore.getState();
    expect(progress).toMatchObject({ level: 12, coins: 100 + coins });
    expect(progress.stars[1]).toBe(3);
    expect(progress.review.threeStarStreak).toBe(2);
    expect(trackMock).toHaveBeenCalledWith('replay_completed', {
      level: 1,
      stars: 3,
      previousStars: 1,
      improved: true,
      coins,
    });
  });

  it('applies the hard-level multiplier to the improvement', () => {
    readyMock.mockImplementation((n: number) => ({
      ...winnable(n),
      config: { ...winnable(n).config, hard: true },
    }));
    ensureReplaySession(10, NOW);
    expect(winReplay()?.result?.coins).toBe(ECONOMY.winBonus3Star * ECONOMY.hardLevelMultiplier);
  });

  it('matching the best pays nothing and the double-coins ad is refused', async () => {
    ensureReplaySession(3, NOW);
    const won = winReplay();
    expect(won?.result).toMatchObject({ coins: 0, replay: { previousStars: 3, improved: false } });
    expect(useProgressStore.getState().coins).toBe(100);
    expect(await doubleWinCoins()).toBe(false);
    expect(showRewarded).not.toHaveBeenCalled();
  });

  it('never offers or accepts Skip', async () => {
    ensureReplaySession(2, NOW);
    expect(isSkipOffered(useGameStore.getState().session, NOW + 10 * 60_000)).toBe(false);
    expect(await skipWithAd()).toBe(false);
    expect(showRewarded).not.toHaveBeenCalled();
  });

  it('has its own +Tube count, separate from the level in progress', () => {
    useGameStore.getState().loadLevel(winnable(12), 'level', NOW);
    useGameStore.getState().addTube(true);
    ensureReplaySession(2, NOW + 1);
    expect(useGameStore.getState().session).toMatchObject({
      extraTubesAdded: 0,
      adTubeUsed: false,
    });
    useGameStore.getState().exitReplay();
    expect(useGameStore.getState().session).toMatchObject({
      levelNumber: 12,
      extraTubesAdded: 1,
      adTubeUsed: true,
    });
  });
});

describe('replay win overlay', () => {
  const renderWin = async (coins: number, improved: boolean, previousStars: 1 | 2 | 3 = 1) => {
    const handlers = {
      onNext: jest.fn(),
      onDouble: jest.fn(),
      onHome: jest.fn(),
      onLevels: jest.fn(),
    };
    await render(
      <WinOverlay
        ui={ui}
        result={{
          stars: 3,
          coins,
          skipped: false,
          doubled: false,
          replay: { previousStars, improved },
        }}
        {...handlers}
      />,
    );
    return handlers;
  };

  it('offers Levels and Home but no Next, and marks a new best', async () => {
    const handlers = await renderWin(6, true);
    expect(screen.getByTestId('win-new-best')).toBeTruthy();
    expect(screen.getByText('New best!')).toBeTruthy();
    expect(screen.queryByTestId('win-next')).toBeNull();
    expect(screen.getByText('Double coins')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('win-levels'));
    await fireEvent.press(screen.getByText('Home'));
    expect(handlers.onLevels).toHaveBeenCalledTimes(1);
    expect(handlers.onHome).toHaveBeenCalledTimes(1);
    expect(handlers.onNext).not.toHaveBeenCalled();
  });

  it('hides Double and the coins at 0 coins and explains how to earn some', async () => {
    await renderWin(0, false, 2);
    expect(screen.queryByText('Double coins')).toBeNull();
    expect(screen.queryByTestId('win-new-best')).toBeNull();
    expect(screen.getByText('Beat your best stars to earn coins.')).toBeTruthy();
    expect(screen.getByLabelText('Back to the level list')).toBeTruthy();
  });

  it('says "Perfect again" when the best was already 3 stars', async () => {
    await renderWin(0, false, 3);
    expect(screen.getByText('Perfect again! You already have every star.')).toBeTruthy();
    expect(screen.queryByText('Beat your best stars to earn coins.')).toBeNull();
  });
});
