import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { BackHandler } from 'react-native';

import GameScreen from '../app/game';
import { initI18n } from '@/i18n';
import { ads } from '@/services/ads';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { currentToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import { almostWon, levelOf, revealBoard, stuckBoard } from '../test-utils/boards';
import { boardProps, hintResult } from '../test-utils/gameScreenMocks';

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

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

let pressBack: () => boolean | undefined = () => undefined;

const setProgress = (overrides: Partial<ProgressState>) =>
  useProgressStore.setState({ ...createDefaultProgress(NOW), tutorialDone: true, ...overrides });

const mount = async () => {
  await render(<GameScreen />);
  const root = screen.root;
  if (root === null) throw new Error('nothing rendered');
  await fireEvent(root, 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
};

const back = async () => {
  let handled: boolean | undefined;
  await act(() => {
    handled = pressBack();
  });
  return handled;
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
  hintResult.current = null;
  boardProps.current = null;
  useGameStore.setState({ session: null, hint: null });
  setProgress({ level: 4 });
});

describe('game screen', () => {
  it('starts the progress level and renders the HUD, board and action bar', async () => {
    await mount();
    expect(useGameStore.getState().session?.levelId).toBe('level-4');
    expect(screen.getByTestId('board')).toBeTruthy();
    expect(screen.getByText('Level 4')).toBeTruthy();
    expect(screen.getByLabelText('Pause')).toBeTruthy();
    expect(screen.getByLabelText('100 coins. Open the shop')).toBeTruthy();
    expect(screen.getByLabelText('Undo, 3 free left')).toBeDisabled();
    expect(screen.getByLabelText('Hint, 3 left')).toBeTruthy();
    expect(screen.getByLabelText('+Tube, 1 left')).toBeTruthy();
    expect(screen.getByText('Restart')).toBeTruthy();
  });

  it('hardware back opens Pause, then resumes', async () => {
    await mount();
    expect(await back()).toBe(true);
    expect(useGameStore.getState().session?.status).toBe('paused');
    expect(screen.getByText('Paused')).toBeTruthy();
    await back();
    expect(useGameStore.getState().session?.status).toBe('playing');
    expect(screen.queryByText('Paused')).toBeNull();
  });

  it('shows the win overlay after the win sequence; Next loads the next level, back goes Home', async () => {
    setProgress({ level: 7, coins: 100 });
    useGameStore.getState().loadLevel(levelOf(7, almostWon()), 'level', NOW);
    await mount();
    await act(() => {
      boardProps.current?.onPour?.(1, 0);
    });
    expect(useProgressStore.getState()).toMatchObject({ level: 8, coins: 116 });
    expect(screen.queryByText('Level complete!')).toBeNull();
    await act(() => {
      boardProps.current?.onWinSequenceEnd?.();
    });
    expect(screen.getByText('Level complete!')).toBeTruthy();
    await back();
    expect(router.replace).toHaveBeenCalledWith('/');
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    expect(useGameStore.getState().session?.levelNumber).toBe(8);
    expect(screen.queryByText('Level complete!')).toBeNull();
  });

  it('opens the stuck overlay once the board settles; back closes it', async () => {
    setProgress({ level: 9 });
    useGameStore.getState().loadLevel(levelOf(9, stuckBoard()), 'level', NOW);
    await mount();
    expect(screen.getByText('No moves left')).toBeTruthy();
    await back();
    expect(screen.queryByText('No moves left')).toBeNull();
    expect(useGameStore.getState().session?.status).toBe('stuck');
    await act(() => {
      boardProps.current?.onSettled?.();
    });
    expect(screen.getByText('No moves left')).toBeTruthy();
  });

  it('opens Not-enough-coins when a found hint cannot be paid; back closes it', async () => {
    setProgress({ level: 5, coins: 0, hints: 0 });
    useGameStore.getState().loadLevel(levelOf(5, revealBoard()), 'level', NOW);
    hintResult.current = { from: 0, to: 2 };
    await mount();
    await fireEvent.press(screen.getByLabelText('Hint, watch an ad'));
    expect(screen.getByText('Not enough coins')).toBeTruthy();
    expect(screen.getByText('A hint costs 25 coins. You have 0.')).toBeTruthy();
    await back();
    expect(screen.queryByText('Not enough coins')).toBeNull();
    expect(useGameStore.getState().session?.status).toBe('playing');
  });

  it('a hint with no move shows a toast and charges nothing', async () => {
    setProgress({ level: 5, hints: 2 });
    useGameStore.getState().loadLevel(levelOf(5, revealBoard()), 'level', NOW);
    await mount();
    await fireEvent.press(screen.getByLabelText('Hint, 2 left'));
    expect(useProgressStore.getState().hints).toBe(2);
    expect(useGameStore.getState().hint).toBeNull();
    expect(currentToast()?.key).toBe('game.noHint');
  });

  it('restart asks for confirmation only after a paid item; the extra tube is kept', async () => {
    setProgress({ level: 5 });
    useGameStore.getState().loadLevel(levelOf(5, revealBoard()), 'level', NOW);
    hintResult.current = { from: 0, to: 2 };
    await mount();
    await fireEvent.press(screen.getByText('Restart'));
    expect(useGameStore.getState().session?.restartsThisLevel).toBe(1);
    await fireEvent.press(screen.getByLabelText('+Tube, 1 left'));
    expect(screen.getByText('Use 1 +Tube?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Add tube'));
    await fireEvent.press(screen.getByText('Restart'));
    expect(useGameStore.getState().session?.restartsThisLevel).toBe(2);
    await fireEvent.press(screen.getByLabelText('Hint, 3 left'));
    await fireEvent.press(screen.getByText('Restart'));
    expect(screen.getByText('Restart level?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Restart anyway'));
    expect(useGameStore.getState().session).toMatchObject({
      restartsThisLevel: 3,
      extraTubesAdded: 1,
    });
  });

  it('skip through the stuck overlay shows the skipped card; back continues', async () => {
    (ads.showRewarded as jest.Mock).mockResolvedValueOnce('earned');
    setProgress({ level: 9, coins: 30 });
    useGameStore.getState().loadLevel(levelOf(9, stuckBoard()), 'level', NOW);
    await mount();
    await act(async () => {
      await fireEvent.press(screen.getByLabelText('Skip this level by watching an ad'));
    });
    expect(screen.getByText('Level skipped')).toBeTruthy();
    expect(useProgressStore.getState()).toMatchObject({ level: 10, coins: 30 });
    await back();
    expect(useGameStore.getState().session?.levelNumber).toBe(10);
    expect(screen.queryByText('Level skipped')).toBeNull();
  });
});
