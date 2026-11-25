import { render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AppState } from 'react-native';

import HomeScreen from '../app/index';
import { initI18n } from '@/i18n';
import {
  readLaunchRoute,
  setNotificationsModuleLoader,
  startNotifications,
} from '@/services/notifications';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import {
  consumeAutoStart,
  consumeLaunchRoute,
  decideAutoStart,
  shouldAutoStart,
} from '@/state/startup';

import { createFakeNotifications, fakeResponse } from '../test-utils/fakeNotifications';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => {
  const base = jest.requireActual('../test-utils/gameScreenMocks').routerModule();
  return { ...base, router: { ...base.router, navigate: jest.fn() } };
});
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('@/ui/home/HeroTubes', () => ({ HeroTubes: () => null }));
jest.mock('@/ui/game/Crown', () => ({ Crown: () => null }));
jest.mock('@/ui/splash', () => ({ revealApp: jest.fn() }));
jest.mock('@/state/levelLoader', () => ({
  prepareLevel: jest.fn(() => new Promise(() => undefined)),
}));
jest.mock('@/state/dailyLoader', () => ({
  prepareDaily: jest.fn(() => new Promise(() => undefined)),
  readyDaily: jest.fn(() => null),
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
let fake: ReturnType<typeof createFakeNotifications>;
let nextDate = 100;

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

/** A tap response nobody handled before (responses are handled once per identifier + date). */
const tap = (identifier: string, url: string) => fakeResponse(identifier, url, (nextDate += 1));

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  fake = createFakeNotifications({ granted: true, canAskAgain: true });
  setNotificationsModuleLoader(fake.loader);
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(
      () => ({ remove: jest.fn() }) as unknown as ReturnType<typeof AppState.addEventListener>,
    );
  consumeAutoStart();
  consumeLaunchRoute();
  useGameStore.setState({ session: null, parked: null, hint: null });
  useProgressStore.setState({ ...createDefaultProgress(NOW), level: 5, tutorialDone: true });
});

describe('cold start', () => {
  it('reads the launching tap once and clears it', async () => {
    const response = tap('streak_risk-2026-11-24', 'pourly://daily');
    fake.state.lastResponse = response;
    await expect(readLaunchRoute()).resolves.toBe('/daily');
    expect(fake.fake.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
    await expect(readLaunchRoute()).resolves.toBeNull();

    // The same response arriving through the listener later is not handled again.
    const stop = startNotifications();
    await flush();
    fake.state.responseListener?.(response);
    expect(router.navigate).not.toHaveBeenCalled();
    stop();
  });

  it('a comeback tap launches Home', async () => {
    fake.state.lastResponse = tap('comeback-3d', 'pourly://');
    await expect(readLaunchRoute()).resolves.toBe('/');
  });

  it('a notification launch turns the first-launch auto-start off', () => {
    useProgressStore.setState({ level: 1 });
    decideAutoStart(null);
    expect(shouldAutoStart()).toBe(true);
    decideAutoStart('/daily');
    expect(shouldAutoStart()).toBe(false);
    expect(consumeLaunchRoute()).toBe('/daily');
    expect(consumeLaunchRoute()).toBeNull();
  });

  it('Home opens Daily for a launch route, once', async () => {
    decideAutoStart('/daily');
    await render(<HomeScreen />);
    expect(router.push).toHaveBeenCalledWith('/daily');
    expect(screen.queryByText('redirect')).toBeNull();
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(consumeLaunchRoute()).toBeNull();
  });

  it('Home stays put for a comeback launch', async () => {
    decideAutoStart('/');
    await render(<HomeScreen />);
    expect(router.push).not.toHaveBeenCalledWith('/daily');
  });
});

describe('warm taps', () => {
  it('daily, streak and gift reminders open Daily; comebacks go Home; unknown links are ignored', async () => {
    const stop = startNotifications();
    await flush();
    const listener = fake.state.responseListener;
    expect(listener).not.toBeNull();
    listener?.(tap('daily_ready-2026-11-24', 'pourly://daily'));
    listener?.(tap('gift_ready-2026-11-24', 'pourly://daily'));
    expect(router.navigate).toHaveBeenNthCalledWith(1, '/daily');
    expect(router.navigate).toHaveBeenCalledTimes(2);
    listener?.(tap('comeback-1d', 'pourly://'));
    expect(router.replace).toHaveBeenCalledWith('/');
    listener?.(tap('other', 'https://example.com'));
    expect(router.navigate).toHaveBeenCalledTimes(2);
    expect(router.replace).toHaveBeenCalledTimes(1);
    stop();
  });

  it('handles each response once', async () => {
    const stop = startNotifications();
    await flush();
    const response = tap('streak_risk-2026-11-25', 'pourly://daily');
    fake.state.responseListener?.(response);
    fake.state.responseListener?.(response);
    expect(router.navigate).toHaveBeenCalledTimes(1);
    stop();
  });
});
