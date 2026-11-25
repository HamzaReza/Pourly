import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import GameScreen from '../app/game';
import type { Level } from '@/game/types';
import { initI18n } from '@/i18n';
import { readyDaily } from '@/state/dailyLoader';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { logger } from '@/utils/logger';

import { almostWon, levelOf, revealBoard, stuckBoard } from '../test-utils/boards';
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
jest.mock('expo-router', () => ({
  ...jest.requireActual('../test-utils/gameScreenMocks').routerModule(),
  useLocalSearchParams: () => ({ mode: 'daily' }),
}));
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/ui/game/Crown', () => ({ Crown: () => null }));
jest.mock('@/ui/FpsOverlay', () => ({ FpsOverlay: () => null }));
jest.mock('@/ui/splash', () => ({ revealApp: jest.fn() }));
jest.mock('@/services/ads', () => ({
  ads: {
    showRewarded: jest.fn(),
    isRewardedReady: jest.fn(),
    showInterstitial: jest.fn(),
    preload: jest.fn(),
  },
}));
jest.mock('@/state/dailyLoader', () => ({
  readyDaily: jest.fn(),
  prepareDaily: jest.fn(() => new Promise(() => undefined)),
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const readyMock = readyDaily as jest.MockedFunction<typeof readyDaily>;
const daily = (board = almostWon()): Level => ({ ...levelOf(0, board), id: 'daily-2026-11-24' });

const mount = async () => {
  const view = await render(<GameScreen />);
  const root = screen.root;
  if (root === null) throw new Error('nothing rendered');
  await fireEvent(root, 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
  return view;
};

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  useProgressStore.setState({
    ...createDefaultProgress(NOW),
    lastSeenAt: 0,
    tutorialDone: true,
    level: 12,
  });
  useGameStore.setState({ session: null, parked: null, hint: null });
  readyMock.mockReturnValue(daily());
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('game screen in daily mode', () => {
  it('plays the daily with its title and parks the level in progress', async () => {
    useGameStore.getState().loadLevel(levelOf(12, revealBoard()), 'level', NOW);
    await mount();
    expect(useGameStore.getState().session?.levelId).toBe('daily-2026-11-24');
    expect(useGameStore.getState().parked?.levelId).toBe('level-12');
    expect(screen.getByText('Daily · Nov 24')).toBeTruthy();
    expect(screen.getByLabelText('Daily challenge, November 24')).toBeTruthy();
    expect(screen.getByTestId('board')).toBeTruthy();
  });

  it('wins once with the streak and coins, Home only; a replay grants nothing', async () => {
    const first = await mount();
    await act(() => {
      boardProps.current?.onPour?.(1, 0);
    });
    expect(useProgressStore.getState()).toMatchObject({ coins: 142, streak: 1, level: 12 });
    await act(() => {
      boardProps.current?.onWinSequenceEnd?.();
    });
    expect(screen.getByText('Daily complete!')).toBeTruthy();
    expect(screen.getByText('1 day streak')).toBeTruthy();
    expect(screen.getByLabelText('42 coins earned')).toBeTruthy();
    expect(screen.queryByLabelText('Play the next level')).toBeNull();
    expect(screen.getByTestId('win-home')).toBeTruthy();
    await first.unmount();

    await mount();
    await act(() => {
      boardProps.current?.onPour?.(1, 0);
    });
    await act(() => {
      boardProps.current?.onWinSequenceEnd?.();
    });
    expect(useProgressStore.getState().coins).toBe(142);
    expect(screen.getByText('Already done today. Replays are just for fun.')).toBeTruthy();
    expect(screen.queryByLabelText('42 coins earned')).toBeNull();
  });

  it('offers no skip on a stuck daily board', async () => {
    readyMock.mockReturnValue(daily(stuckBoard()));
    await mount();
    await act(() => {
      boardProps.current?.onSettled?.();
    });
    expect(screen.getByText('No moves left')).toBeTruthy();
    expect(screen.getByText('Undo a move, add a tube or restart.')).toBeTruthy();
    expect(screen.queryByLabelText('Skip this level by watching an ad')).toBeNull();
  });
});
