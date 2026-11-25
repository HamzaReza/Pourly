import { AppState, type AppStateStatus } from 'react-native';

import { i18n, initI18n } from '@/i18n';
import {
  REMINDERS_CHANNEL_ID,
  RESCHEDULE_DEBOUNCE_MS,
  requestNotificationPermission,
  readLaunchRoute,
  rescheduleNotifications,
  setNotificationsModuleLoader,
  startNotifications,
  syncNotificationPermission,
  getNotificationPermission,
} from '@/services/notifications';
import { planNotifications } from '@/services/notificationPlanner';
import { colors } from '@/ui/tokens';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';
import { logger } from '@/utils/logger';

import { createFakeNotifications } from '../test-utils/fakeNotifications';

jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());

const NOW = new Date(2026, 10, 25, 9, 0).getTime();

let fake: ReturnType<typeof createFakeNotifications>;
let appStateListener: ((state: AppStateStatus) => void) | null = null;

/** Lets pending promise chains (module load, permission read, scheduling) run. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

const setProgress = (overrides: Partial<ProgressState> = {}) => {
  const base = createDefaultProgress(NOW);
  useProgressStore.setState({
    ...base,
    level: 12,
    lastOpenAt: NOW,
    notifications: { ...base.notifications, granted: true },
    ...overrides,
  });
};

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  fake = createFakeNotifications({ granted: true, canAskAgain: true });
  setNotificationsModuleLoader(fake.loader);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  useSettingsStore.setState({ language: 'system' });
  setProgress();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('rescheduleNotifications', () => {
  it('cancels everything, creates the channel, then schedules the plan with DATE triggers', async () => {
    setProgress({ streak: 4, lastDailyDate: '2026-11-24' });
    const plan = planNotifications(useProgressStore.getState(), NOW);
    await rescheduleNotifications();
    expect(fake.calls).toEqual([
      'cancelAll',
      `channel:${REMINDERS_CHANNEL_ID}:Reminders:5`,
      ...plan.map((item) => `schedule:${item.id}`),
    ]);
    expect(fake.scheduled.map((request) => request.trigger)).toEqual(
      plan.map((item) => ({ type: 'date', date: item.fireAt, channelId: REMINDERS_CHANNEL_ID })),
    );
    const risk = fake.scheduled.find((request) => request.identifier.startsWith('streak_risk'));
    expect(risk?.content).toEqual({
      title: 'Your 4-day streak is at risk!',
      body: "Solve today's daily challenge before midnight to keep it going.",
      data: { url: 'pourly://daily', kind: 'streak_risk' },
      color: colors.accent,
    });
    const comeback = fake.scheduled.find((request) => request.identifier === 'comeback-3d');
    expect(comeback?.content.body).toBe(
      'Level 12 is still waiting for you. Come back for a quick pour.',
    );
    expect(comeback?.content.data).toEqual({ url: 'pourly://', kind: 'comeback' });
  });

  it('translates in the Settings language, not the language the UI is showing', async () => {
    useSettingsStore.setState({ language: 'en' });
    await i18n.changeLanguage('cimode');
    try {
      await rescheduleNotifications();
    } finally {
      await i18n.changeLanguage('en');
    }
    expect(fake.scheduled[0]?.content.title).toBe("Today's daily challenge is ready");
  });

  it('only cancels when permission is missing', async () => {
    setProgress({ notifications: { ...createDefaultProgress(NOW).notifications, granted: false } });
    await rescheduleNotifications();
    expect(fake.calls).toEqual(['cancelAll']);
  });

  it('is a no-op when the module cannot load', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    setNotificationsModuleLoader(() => Promise.reject(new Error('no native module')));
    await expect(rescheduleNotifications()).resolves.toBeUndefined();
    await expect(syncNotificationPermission()).resolves.toBeNull();
    await expect(requestNotificationPermission()).resolves.toBeNull();
    await expect(readLaunchRoute()).resolves.toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe('permission', () => {
  it('sync mirrors the OS answer into progress', async () => {
    fake.state.permission = { granted: false, canAskAgain: false };
    await expect(syncNotificationPermission()).resolves.toEqual({
      granted: false,
      canAskAgain: false,
    });
    expect(getNotificationPermission()).toEqual({ granted: false, canAskAgain: false });
    expect(useProgressStore.getState().notifications.granted).toBe(false);
  });

  it('the request creates the channel first', async () => {
    fake.state.permission = { granted: false, canAskAgain: true };
    await expect(requestNotificationPermission()).resolves.toEqual({
      granted: true,
      canAskAgain: true,
    });
    expect(fake.calls).toEqual([`channel:${REMINDERS_CHANNEL_ID}:Reminders:5`, 'request']);
    expect(useProgressStore.getState().notifications.granted).toBe(true);
  });
});

describe('startNotifications', () => {
  it('suppresses foreground notifications and schedules on start', async () => {
    const stop = startNotifications();
    await flush();
    const handler = fake.fake.setNotificationHandler.mock.calls[0]?.[0] as {
      handleNotification: () => Promise<unknown>;
    };
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
    expect(fake.calls[0]).toBe('cancelAll');
    expect(fake.scheduled.length).toBeGreaterThan(0);
    stop();
  });

  it('on foreground: touches lastOpenAt, notices a revoked permission and clears the schedule', async () => {
    const stop = startNotifications();
    await flush();
    expect(fake.scheduled.length).toBeGreaterThan(0);
    fake.state.permission = { granted: false, canAskAgain: true };
    jest.setSystemTime(NOW + 60_000);
    appStateListener?.('active');
    await flush();
    expect(useProgressStore.getState().lastOpenAt).toBe(NOW + 60_000);
    expect(useProgressStore.getState().notifications.granted).toBe(false);
    expect(fake.calls[fake.calls.length - 1]).toBe('cancelAll');
    expect(fake.scheduled).toEqual([]);
    stop();
  });

  it('reschedules once, debounced, after planner inputs change', async () => {
    const stop = startNotifications();
    await flush();
    fake.fake.cancelAllScheduledNotificationsAsync.mockClear();
    useProgressStore.getState().setNotificationToggle('streakEnabled', false);
    useProgressStore.setState({ lastGiftDate: '2026-11-25' });
    useSettingsStore.setState({ language: 'en' });
    await flush();
    jest.advanceTimersByTime(RESCHEDULE_DEBOUNCE_MS - 1);
    await flush();
    expect(fake.fake.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await flush();
    expect(fake.fake.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(fake.scheduled.some((request) => request.identifier.startsWith('gift_ready'))).toBe(
      false,
    );
    stop();
  });

  it('ignores changes that do not affect the plan', async () => {
    const stop = startNotifications();
    await flush();
    fake.fake.cancelAllScheduledNotificationsAsync.mockClear();
    useProgressStore.setState({ coins: 999 });
    jest.advanceTimersByTime(RESCHEDULE_DEBOUNCE_MS * 2);
    await flush();
    expect(fake.fake.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    stop();
  });
});
