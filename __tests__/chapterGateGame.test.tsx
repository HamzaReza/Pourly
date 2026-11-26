import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { BackHandler } from 'react-native';

import GameScreen from '../app/game';
import { initI18n } from '@/i18n';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState, type StarCount } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { currentToast, dismissToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import { almostWon, levelOf } from '../test-utils/boards';
import { boardProps } from '../test-utils/gameScreenMocks';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('@/render/Board', () =>
  jest.requireActual('../test-utils/gameScreenMocks').boardModule(),
);
jest.mock('@/render/useRenderSettings', () =>
  jest.requireActual('../test-utils/gameScreenMocks').renderSettingsModule(),
);
jest.mock('@/render/useHint', () =>
  jest.requireActual('../test-utils/gameScreenMocks').hintModule(),
);
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('@/ui/game/Crown', () => ({ Crown: () => null }));
jest.mock('@/ui/FpsOverlay', () => ({ FpsOverlay: () => null }));
jest.mock('@/ui/splash', () => ({ revealApp: jest.fn() }));
jest.mock('@/services/ads', () => ({
  ads: {
    showRewarded: jest.fn(),
    isRewardedReady: jest.fn(),
    showInterstitial: jest.fn(() => Promise.resolve(false)),
    preload: jest.fn(),
  },
}));
jest.mock('@/state/levelLoader', () => {
  const actual = jest.requireActual('@/state/levelLoader');
  const { almostWon: board, levelOf: level } = jest.requireActual('../test-utils/boards');
  return {
    ...actual,
    readyLevel: jest.fn((n: number) => level(n, board())),
    levelNow: jest.fn((n: number) => level(n, board())),
    prepareLevel: jest.fn(() => new Promise(() => undefined)),
  };
});

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

let pressBack: () => boolean | undefined = () => undefined;

const starsFor = (from: number, to: number, value: StarCount): Record<number, StarCount> => {
  const out: Record<number, StarCount> = {};
  for (let level = from; level <= to; level += 1) out[level] = value;
  return out;
};

const setProgress = (overrides: Partial<ProgressState>) =>
  useProgressStore.setState({ ...createDefaultProgress(NOW), tutorialDone: true, ...overrides });

const mount = async () => {
  await render(<GameScreen />);
  const root = screen.root;
  if (root === null) throw new Error('nothing rendered');
  await fireEvent(root, 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
};

const winOnScreen = async () => {
  await act(() => {
    boardProps.current?.onPour?.(1, 0);
  });
  await act(() => {
    boardProps.current?.onWinSequenceEnd?.();
  });
};

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    pressBack = handler as () => boolean | undefined;
    return { remove: jest.fn() };
  });
  boardProps.current = null;
  useGameStore.getState().clearAll();
  for (let toast = currentToast(); toast !== null; toast = currentToast()) dismissToast(toast.id);
});

describe('game screen with a locked chapter', () => {
  it('opening level mode shows the gate, starts nothing and has no title', async () => {
    setProgress({ level: 21, coins: 100, stars: starsFor(1, 17, 2) });
    await mount();
    expect(screen.getByTestId('chapter-gate')).toBeTruthy();
    expect(useGameStore.getState().session).toBeNull();
    expect(screen.queryByText(/^Level /)).toBeNull();
  });

  it('Not now (or back) leaves for Home', async () => {
    setProgress({ level: 21, stars: starsFor(1, 17, 2) });
    await mount();
    await act(() => {
      pressBack();
    });
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('buying the chapter starts its first level', async () => {
    setProgress({ level: 21, coins: 100, stars: starsFor(1, 17, 2) });
    await mount();
    await fireEvent.press(screen.getByTestId('chapter-gate-unlock'));
    await fireEvent.press(screen.getByTestId('chapter-unlock-confirm-button'));
    expect(useProgressStore.getState().paidChapters).toEqual([2]);
    expect(screen.queryByTestId('chapter-gate')).toBeNull();
    expect(useGameStore.getState().session?.levelNumber).toBe(21);
  });

  it('Replay levels swaps the game for the Levels screen on the previous chapter', async () => {
    setProgress({ level: 21, stars: starsFor(1, 17, 2) });
    await mount();
    await fireEvent.press(screen.getByTestId('chapter-gate-replay'));
    expect(router.replace).toHaveBeenCalledWith({
      pathname: '/levels',
      params: { chapter: '1' },
    });
  });

  it('Next on the last level of a chapter opens the gate when the stars fall short', async () => {
    setProgress({ level: 20, coins: 0, stars: starsFor(1, 19, 1) });
    useGameStore.getState().loadLevel(levelOf(20, almostWon()), 'level', NOW);
    await mount();
    await winOnScreen();
    await fireEvent.press(screen.getByTestId('win-next'));
    expect(screen.getByTestId('chapter-gate')).toBeTruthy();
    // The Win card steps aside so the gate is the only dialog (and the only modal for a11y).
    expect(screen.queryByTestId('win-overlay')).toBeNull();
    expect(useGameStore.getState().session?.levelNumber).toBe(20);
    // Not now returns to the Win card rather than leaving.
    await fireEvent.press(screen.getByText('Not now'));
    expect(screen.queryByTestId('chapter-gate')).toBeNull();
    expect(screen.getByTestId('win-overlay')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('a win that opens the chapter with stars toasts and lets Next continue', async () => {
    setProgress({ level: 20, stars: starsFor(1, 19, 2) });
    useGameStore.getState().loadLevel(levelOf(20, almostWon()), 'level', NOW);
    await mount();
    await winOnScreen();
    expect(currentToast()?.key).toBe('chapters.unlocked');
    await fireEvent.press(screen.getByTestId('win-next'));
    expect(screen.queryByTestId('chapter-gate')).toBeNull();
    expect(useGameStore.getState().session?.levelNumber).toBe(21);
  });
});
