import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { BackHandler } from 'react-native';

import GameScreen from '../app/game';
import { initI18n } from '@/i18n';
import { track } from '@/services/analytics';
import {
  shouldOfferNotificationPrompt,
  type NotificationPromptInput,
} from '@/services/notificationPrompt';
import { setNotificationsModuleLoader, syncNotificationPermission } from '@/services/notifications';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';

import { almostWon, levelOf } from '../test-utils/boards';
import { createFakeNotifications, type FakePermission } from '../test-utils/fakeNotifications';
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
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/ui/game/Crown', () => ({ Crown: () => null }));
jest.mock('@/ui/FpsOverlay', () => ({ FpsOverlay: () => null }));
jest.mock('@/ui/splash', () => ({ revealApp: jest.fn() }));
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/ads', () => ({
  ads: {
    showRewarded: jest.fn(),
    isRewardedReady: jest.fn(),
    showInterstitial: jest.fn(() => Promise.resolve(false)),
    preload: jest.fn(),
  },
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const FRESH = createDefaultProgress(NOW).notifications;
let fake: ReturnType<typeof createFakeNotifications>;
let pressBack: () => boolean | undefined = () => undefined;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** Wins `level` (a one-pour board) with the OS permission in `permission`, up to the Win overlay. */
const winLevel = async (
  level: number,
  notifications: ProgressState['notifications'] = FRESH,
  permission: FakePermission = { granted: false, canAskAgain: true },
) => {
  fake.state.permission = permission;
  useProgressStore.setState({
    ...createDefaultProgress(NOW),
    tutorialDone: true,
    level,
    notifications,
  });
  await syncNotificationPermission();
  useGameStore.getState().loadLevel(levelOf(level, almostWon()), 'level', NOW);
  await render(<GameScreen />);
  const root = screen.root;
  if (root === null) throw new Error('nothing rendered');
  await fireEvent(root, 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
  await act(() => {
    boardProps.current?.onPour?.(1, 0);
  });
  await act(() => {
    boardProps.current?.onWinSequenceEnd?.();
  });
  expect(screen.getByText('Level complete!')).toBeTruthy();
};

const promptShown = () => screen.queryByTestId('notification-prompt') !== null;

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  fake = createFakeNotifications({ granted: false, canAskAgain: true });
  setNotificationsModuleLoader(fake.loader);
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    pressBack = handler as () => boolean | undefined;
    return { remove: jest.fn() };
  });
  useGameStore.setState({ session: null, parked: null, hint: null });
});

describe('shouldOfferNotificationPrompt', () => {
  const input = (overrides: Partial<NotificationPromptInput>): NotificationPromptInput => ({
    mode: 'level',
    level: 3,
    skipped: false,
    notifications: { askedCount: 0, granted: false },
    permission: { granted: false, canAskAgain: true },
    ...overrides,
  });

  it.each<[string, Partial<NotificationPromptInput>, boolean]>([
    ['level 3 win, never asked', {}, true],
    ['level 2', { level: 2 }, false],
    ['level 4 (level 3 was skipped)', { level: 4 }, true],
    ['the daily', { mode: 'daily' }, false],
    ['a skipped level', { skipped: true }, false],
    [
      'level 14 after one ask',
      { level: 14, notifications: { askedCount: 1, granted: false } },
      false,
    ],
    [
      'level 15 after one ask',
      { level: 15, notifications: { askedCount: 1, granted: false } },
      true,
    ],
    ['after two asks', { level: 40, notifications: { askedCount: 2, granted: false } }, false],
    ['already granted (stored)', { notifications: { askedCount: 1, granted: true } }, false],
    ['already granted (OS)', { permission: { granted: true, canAskAgain: true } }, false],
    ['permanently denied', { permission: { granted: false, canAskAgain: false } }, false],
    ['permission not read', { permission: null }, false],
  ])('%s', (_label, overrides, expected) => {
    expect(shouldOfferNotificationPrompt(input(overrides))).toBe(expected);
  });
});

describe('notification soft-prompt on the game screen', () => {
  it('after winning level 3, Next shows the prompt instead of the Win overlay; Allow requests', async () => {
    await winLevel(3);
    expect(promptShown()).toBe(false);
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    expect(screen.queryByText('Level complete!')).toBeNull();
    expect(screen.getByText('Never miss a puzzle')).toBeTruthy();
    expect(useGameStore.getState().session?.levelNumber).toBe(3);

    await fireEvent.press(screen.getByLabelText('Allow reminders'));
    await settle();
    expect(fake.calls).toEqual(['channel:reminders:Reminders:5', 'request']);
    expect(useProgressStore.getState().notifications).toMatchObject({
      asked: true,
      askedCount: 1,
      granted: true,
    });
    expect(track).toHaveBeenCalledWith('notification_prompt_result', {
      granted: true,
      askedCount: 1,
    });
    expect(promptShown()).toBe(false);
    expect(useGameStore.getState().session?.levelNumber).toBe(4);
  });

  it('Not now declines without a system request and continues to the next level', async () => {
    await winLevel(3);
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    await fireEvent.press(screen.getByLabelText('Not now, no reminders'));
    await settle();
    expect(fake.fake.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(useProgressStore.getState().notifications).toMatchObject({
      askedCount: 1,
      granted: false,
    });
    expect(track).toHaveBeenCalledWith('notification_prompt_result', {
      granted: false,
      askedCount: 1,
    });
    expect(useGameStore.getState().session?.levelNumber).toBe(4);
  });

  it('Home on the Win overlay continues Home after the answer', async () => {
    await winLevel(3);
    await fireEvent.press(screen.getByText('Home'));
    expect(promptShown()).toBe(true);
    expect(router.replace).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Not now, no reminders'));
    await settle();
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('does not ask again at level 14 after one decline', async () => {
    await winLevel(14, { ...FRESH, asked: true, askedCount: 1 });
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    expect(promptShown()).toBe(false);
    expect(useGameStore.getState().session?.levelNumber).toBe(15);
  });

  it('asks a second time at level 15; hardware back is Not now, then Home', async () => {
    await winLevel(15, { ...FRESH, asked: true, askedCount: 1 });
    await act(async () => {
      pressBack();
    });
    expect(promptShown()).toBe(true);
    await act(async () => {
      pressBack();
    });
    await settle();
    expect(useProgressStore.getState().notifications.askedCount).toBe(2);
    expect(fake.fake.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/');
  });

  it('never asks after two asks', async () => {
    await winLevel(20, { ...FRESH, asked: true, askedCount: 2 });
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    expect(promptShown()).toBe(false);
  });

  it('never asks when Android will not prompt again', async () => {
    await winLevel(3, FRESH, { granted: false, canAskAgain: false });
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    expect(promptShown()).toBe(false);
    expect(useGameStore.getState().session?.levelNumber).toBe(4);
  });

  it('never asks when the OS already allows notifications', async () => {
    await winLevel(3, FRESH, { granted: true, canAskAgain: true });
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    expect(promptShown()).toBe(false);
    expect(useProgressStore.getState().notifications.granted).toBe(true);
  });
});
