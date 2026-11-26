/**
 * +Tube prompts on the game screen (DECISIONS P12.3): confirm before inventory or coins, the ad
 * plays straight away, Shop only once the ad is used, the action bar and Stuck labels, the cap,
 * and the coins fallback when the ad cannot be shown.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import GameScreen from '../app/game';
import { initI18n } from '@/i18n';
import { getTheme } from '@/render/themes';
import { ads } from '@/services/ads';
import { selectTubeAdUnavailable, useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { StuckOverlay } from '@/ui/game/overlays/StuckOverlay';
import { TubeConfirmOverlay } from '@/ui/game/overlays/TubeConfirmOverlay';
import { currentToast, dismissToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import { levelOf, revealBoard, stuckBoard } from '../test-utils/boards';

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
const ui = getTheme('classic').ui;
const showRewarded = ads.showRewarded as jest.Mock;

/** Level 5 with an empty +Tube inventory and no coins unless overridden. */
const setProgress = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({
    ...createDefaultProgress(NOW),
    tutorialDone: true,
    level: 5,
    extraTubes: 0,
    coins: 0,
    ...overrides,
  });

const session = () => useGameStore.getState().session!;

/** Loads level 5 (optionally with the level's ad tube already used) and mounts the screen. */
const mount = async ({ board = revealBoard(), adUsed = false } = {}) => {
  useGameStore.getState().loadLevel(levelOf(5, board), 'level', NOW);
  if (adUsed) useGameStore.getState().markAdTubeUsed();
  await render(<GameScreen />);
  const root = screen.root;
  if (root === null) throw new Error('nothing rendered');
  await fireEvent(root, 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
};

type Element = Parameters<typeof fireEvent.press>[0];

const press = async (element: Element) => {
  await act(async () => {
    await fireEvent.press(element);
  });
};

const AD_TUBE_A11Y = 'Watch an ad to get an extra tube';
/** For dialogs opened over the (also modal) Stuck card. */
const HIDDEN = { includeHiddenElements: true } as const;

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(logger, 'debug').mockImplementation(() => undefined);
  useGameStore.setState({ session: null, parked: null, hint: null, tubeAdUnavailableFor: null });
  for (let toast = currentToast(); toast !== null; toast = currentToast()) dismissToast(toast.id);
  setProgress();
});

describe('action bar +Tube', () => {
  it('inventory asks first: Cancel adds nothing, Add tube uses one', async () => {
    setProgress({ extraTubes: 2 });
    await mount();
    await press(screen.getByLabelText('+Tube, 2 left'));
    expect(screen.getByText('Use 1 +Tube?')).toBeTruthy();
    expect(
      screen.getByText(
        'You have 2 +Tubes. The empty tube stays on this level, even if you restart.',
      ),
    ).toBeTruthy();
    await press(screen.getByText('Cancel'));
    expect(screen.queryByText('Use 1 +Tube?')).toBeNull();
    expect(session().extraTubesAdded).toBe(0);
    expect(useProgressStore.getState().extraTubes).toBe(2);
    await press(screen.getByLabelText('+Tube, 2 left'));
    await press(screen.getByText('Add tube'));
    expect(session().extraTubesAdded).toBe(1);
    expect(useProgressStore.getState().extraTubes).toBe(1);
  });

  it('coins ask first: Buy tube spends 40', async () => {
    setProgress({ coins: 100 });
    await mount({ adUsed: true });
    await press(screen.getByLabelText('+Tube, 40 coins'));
    expect(screen.getByText('Spend 40 coins for +1 Tube?')).toBeTruthy();
    await press(screen.getByText('Buy tube'));
    expect(useProgressStore.getState().coins).toBe(60);
    expect(session()).toMatchObject({ extraTubesAdded: 1, adTubeUsed: true });
  });

  it('the level ad plays straight away with no dialog', async () => {
    showRewarded.mockResolvedValueOnce('earned');
    setProgress({ coins: 100 });
    await mount();
    await press(screen.getByLabelText('+Tube, watch an ad'));
    expect(showRewarded).toHaveBeenCalledWith('EXTRA_TUBE', { quietUnavailable: true });
    expect(screen.queryByTestId('tube-confirm-overlay')).toBeNull();
    expect(session()).toMatchObject({ extraTubesAdded: 1, adTubeUsed: true });
    expect(useProgressStore.getState().coins).toBe(100);
  });

  it('no coins and no ad left: Not-enough-coins offers the Shop only', async () => {
    await mount({ adUsed: true });
    await press(screen.getByLabelText('+Tube, 40 coins'));
    expect(screen.getByText('Not enough coins')).toBeTruthy();
    expect(screen.getByText('Shop')).toBeTruthy();
    expect(screen.queryByLabelText(AD_TUBE_A11Y)).toBeNull();
    expect(showRewarded).not.toHaveBeenCalled();
  });

  it('is disabled at the cap with the reason in its label', async () => {
    setProgress({ extraTubes: 5 });
    await mount();
    useGameStore.getState().addTube();
    useGameStore.getState().addTube();
    await act(async () => undefined);
    expect(screen.getByLabelText('+Tube, limit reached for this level')).toBeDisabled();
  });
});

describe('ad fallback to coins', () => {
  /** The one toast on screen, dismissed so a second one would show up next. */
  const takeOnlyToast = (): string | null => {
    const toast = currentToast();
    if (toast === null) return null;
    dismissToast(toast.id);
    expect(currentToast()).toBeNull();
    return toast.key;
  };

  it('ad unavailable: one toast, no dialog, the +Tube shows coins; Buy tube keeps the ad unused', async () => {
    showRewarded.mockResolvedValueOnce('unavailable');
    setProgress({ coins: 100 });
    await mount();
    await press(screen.getByLabelText('+Tube, watch an ad'));
    expect(showRewarded).toHaveBeenCalledWith('EXTRA_TUBE', { quietUnavailable: true });
    expect(takeOnlyToast()).toBe('game.tubeAdUnavailable');
    expect(screen.queryByTestId('tube-confirm-overlay')).toBeNull();
    expect(screen.queryByText('Not enough coins')).toBeNull();
    await press(screen.getByLabelText('+Tube, 40 coins'));
    expect(screen.getByText('Spend 40 coins for +1 Tube?')).toBeTruthy();
    await press(screen.getByText('Buy tube'));
    expect(session()).toMatchObject({ extraTubesAdded: 1, adTubeUsed: false });
    expect(useProgressStore.getState().coins).toBe(60);
    expect(showRewarded).toHaveBeenCalledTimes(1);
  });

  it('ad unavailable without enough coins: the coins +Tube opens the Shop-only overlay', async () => {
    showRewarded.mockResolvedValueOnce('unavailable');
    setProgress({ coins: 39 });
    await mount();
    await press(screen.getByLabelText('+Tube, watch an ad'));
    expect(screen.queryByText('Not enough coins')).toBeNull();
    await press(screen.getByLabelText('+Tube, 40 coins'));
    expect(screen.getByText('Not enough coins')).toBeTruthy();
    expect(screen.getByText('Shop')).toBeTruthy();
    expect(screen.queryByLabelText(AD_TUBE_A11Y)).toBeNull();
    expect(session()).toMatchObject({ extraTubesAdded: 0, adTubeUsed: false });
  });

  it('ad dismissed: nothing added, no toast, the +Tube stays on the ad', async () => {
    showRewarded.mockResolvedValueOnce('dismissed');
    setProgress({ coins: 100 });
    await mount();
    await press(screen.getByLabelText('+Tube, watch an ad'));
    expect(takeOnlyToast()).toBeNull();
    expect(screen.queryByTestId('tube-confirm-overlay')).toBeNull();
    expect(session()).toMatchObject({ extraTubesAdded: 0, adTubeUsed: false });
    expect(useProgressStore.getState().coins).toBe(100);
    expect(screen.getByLabelText('+Tube, watch an ad')).toBeTruthy();
  });

  it('the Stuck overlay switches its primary +1 Tube to coins', async () => {
    showRewarded.mockResolvedValueOnce('unavailable');
    setProgress({ coins: 100 });
    await mount({ board: stuckBoard() });
    await press(screen.getByLabelText('Watch an ad to add an empty tube'));
    expect(takeOnlyToast()).toBe('game.tubeAdUnavailable');
    expect(screen.queryByText('Spend 40 coins for +1 Tube?', HIDDEN)).toBeNull();
    await press(screen.getByText('+1 Tube · 40 coins'));
    await press(screen.getByText('Buy tube', HIDDEN));
    expect(session()).toMatchObject({ extraTubesAdded: 1, adTubeUsed: false, status: 'playing' });
  });

  it('the switch resets on another level and when the screen unmounts', async () => {
    showRewarded.mockResolvedValueOnce('unavailable');
    setProgress({ coins: 100 });
    await mount();
    await press(screen.getByLabelText('+Tube, watch an ad'));
    expect(screen.getByLabelText('+Tube, 40 coins')).toBeTruthy();
    await act(async () => {
      useGameStore.getState().loadLevel(levelOf(6, revealBoard()), 'level', NOW);
    });
    expect(screen.getByLabelText('+Tube, watch an ad')).toBeTruthy();
    await act(async () => {
      useGameStore.getState().markTubeAdUnavailable();
    });
    expect(selectTubeAdUnavailable(useGameStore.getState())).toBe(true);
    await act(async () => {
      screen.unmount();
    });
    expect(useGameStore.getState().tubeAdUnavailableFor).toBeNull();
  });
});

describe('stuck overlay +1 Tube', () => {
  it('is the primary action, labelled by how it is paid', async () => {
    setProgress({ extraTubes: 1 });
    await mount({ board: stuckBoard() });
    await press(screen.getByText('Use +Tube (1 left)'));
    // The dialog opens over the Stuck card; both are modal, so query hidden elements too.
    expect(screen.getByText('Use 1 +Tube?', HIDDEN)).toBeTruthy();
    await press(screen.getByText('Add tube', HIDDEN));
    expect(session()).toMatchObject({ extraTubesAdded: 1, status: 'playing' });
    expect(screen.queryByText('No moves left')).toBeNull();
  });

  it('labels the ad and coins paths', async () => {
    const props = {
      ui,
      canUndo: false,
      busy: false,
      onUndo: jest.fn(),
      onAddTube: jest.fn(),
      onRestart: jest.fn(),
      onClose: jest.fn(),
    };
    await render(<StuckOverlay {...props} tubeCost={{ kind: 'ad' }} />);
    await fireEvent.press(screen.getByLabelText('Watch an ad to add an empty tube'));
    expect(screen.getByText('Watch ad: +1 Tube')).toBeTruthy();
    await render(<StuckOverlay {...props} tubeCost={{ kind: 'coins', cost: 40 }} />);
    await fireEvent.press(screen.getByText('+1 Tube · 40 coins'));
    await render(<StuckOverlay {...props} tubeCost={{ kind: 'shop', cost: 40 }} />);
    await fireEvent.press(screen.getByText('+1 Tube · 40 coins'));
    expect(props.onAddTube).toHaveBeenCalledTimes(3);
  });

  it('the ad button is disabled while an ad is busy', async () => {
    await render(
      <StuckOverlay
        ui={ui}
        canUndo={false}
        tubeCost={{ kind: 'ad' }}
        busy
        onUndo={jest.fn()}
        onAddTube={jest.fn()}
        onRestart={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByLabelText('Watch an ad to add an empty tube')).toBeDisabled();
  });

  it('shows the disabled limit button after two tubes', async () => {
    await mount({ board: stuckBoard() });
    await act(async () => {
      useGameStore.setState({ session: { ...session(), extraTubesAdded: 2 } });
    });
    expect(screen.getByText('No moves left')).toBeTruthy();
    expect(screen.getByText('Tube limit reached for this level')).toBeDisabled();
  });
});

describe('tube confirm overlay', () => {
  it('inventory: title, message, Add tube and Cancel', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(
      <TubeConfirmOverlay
        ui={ui}
        payment={{ kind: 'inventory', owned: 1 }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('Use 1 +Tube?')).toBeTruthy();
    expect(
      screen.getByText(
        'You have 1 +Tube. The empty tube stays on this level, even if you restart.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Add tube'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect([onConfirm.mock.calls.length, onCancel.mock.calls.length]).toEqual([1, 1]);
  });

  it('coins: title, message, Buy tube; the backdrop cancels', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(
      <TubeConfirmOverlay
        ui={ui}
        payment={{ kind: 'coins', cost: 40 }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByText('Spend 40 coins for +1 Tube?')).toBeTruthy();
    expect(
      screen.getByText('The empty tube stays on this level, even if you restart.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByText('Buy tube'));
    const backdrop = screen.getByTestId('tube-confirm-overlay').children[0] as Element;
    await fireEvent.press(backdrop);
    expect([onConfirm.mock.calls.length, onCancel.mock.calls.length]).toEqual([1, 1]);
  });
});
