import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { BackHandler } from 'react-native';

import GameScreen from '../app/game';
import { initI18n } from '@/i18n';
import { readyLevel } from '@/state/levelLoader';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { logger } from '@/utils/logger';

import { almostWon, levelOf } from '../test-utils/boards';
import { boardProps } from '../test-utils/gameScreenMocks';

const mockParams: { current: Record<string, string> } = {
  current: { mode: 'replay', level: '2' },
};

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
  useLocalSearchParams: () => mockParams.current,
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
jest.mock('@/state/levelLoader', () => {
  const actual = jest.requireActual('@/state/levelLoader');
  return { ...actual, readyLevel: jest.fn(), prepareLevel: jest.fn(() => new Promise(() => {})) };
});

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const readyMock = readyLevel as jest.MockedFunction<typeof readyLevel>;

let pressBack: () => boolean | undefined = () => undefined;

const setProgress = (overrides: Partial<ProgressState>) =>
  useProgressStore.setState({ ...createDefaultProgress(NOW), tutorialDone: true, ...overrides });

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
  jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    pressBack = handler as () => boolean | undefined;
    return { remove: jest.fn() };
  });
  boardProps.current = null;
  mockParams.current = { mode: 'replay', level: '2' };
  readyMock.mockImplementation((n: number) => levelOf(n, almostWon()));
  useGameStore.getState().clearAll();
  setProgress({ level: 9, coins: 100, stars: { 1: 3, 2: 1 } });
});

describe('game screen in replay mode', () => {
  it('plays the replay with its own title and no Skip, leaving the level slot alone', async () => {
    useGameStore.getState().loadLevel(levelOf(9, almostWon()), 'level', NOW);
    await mount();
    expect(useGameStore.getState().session).toMatchObject({ mode: 'replay', levelNumber: 2 });
    expect(screen.getByText('Replay · Level 2')).toBeTruthy();
    expect(screen.queryByLabelText(/Skip this level/)).toBeNull();
    expect(useGameStore.getState().stashed?.session?.levelNumber).toBe(9);
  });

  it('a better win shows New best!, Levels instead of Next, and pays the improvement', async () => {
    await mount();
    await act(() => {
      boardProps.current?.onPour?.(1, 0);
    });
    await act(() => {
      boardProps.current?.onWinSequenceEnd?.();
    });
    expect(screen.getByText('New best!')).toBeTruthy();
    expect(screen.queryByTestId('win-next')).toBeNull();
    expect(useProgressStore.getState()).toMatchObject({ level: 9, coins: 106 });
    expect(useProgressStore.getState().stars[2]).toBe(3);
    await fireEvent.press(screen.getByTestId('win-levels'));
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('leaving the screen discards the replay and restores the level in progress', async () => {
    useGameStore.getState().loadLevel(levelOf(9, almostWon()), 'level', NOW);
    const view = await mount();
    expect(useGameStore.getState().session?.mode).toBe('replay');
    await view.unmount();
    const state = useGameStore.getState();
    expect(state.session?.levelNumber).toBe(9);
    expect(state.session?.mode).toBe('level');
    expect(state.stashed).toBeNull();
  });

  it('back on the replay pauses it like any game', async () => {
    await mount();
    await act(() => {
      pressBack();
    });
    expect(useGameStore.getState().session?.status).toBe('paused');
    expect(screen.getByText('Paused')).toBeTruthy();
  });

  it('a level that is not reached yet falls back to nothing being started', async () => {
    mockParams.current = { mode: 'replay', level: '20' };
    await mount();
    expect(useGameStore.getState().session).toBeNull();
  });
});
