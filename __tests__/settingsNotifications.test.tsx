import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import SettingsScreen from '../app/settings';
import { initI18n } from '@/i18n';
import { track } from '@/services/analytics';
import { setNotificationsModuleLoader } from '@/services/notifications';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/state/settingsStore';
import { currentToast, dismissToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import { createFakeNotifications, type FakePermission } from '../test-utils/fakeNotifications';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '7',
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const openSettings = jest.spyOn(Linking, 'openSettings');
let fake: ReturnType<typeof createFakeNotifications>;

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const mount = async (permission: FakePermission) => {
  fake.state.permission = permission;
  await render(<SettingsScreen />);
  await settle();
};

const checked = (testID: string): boolean | undefined =>
  (screen.getByTestId(testID).props as { accessibilityState?: { checked?: boolean } })
    .accessibilityState?.checked;

const notifications = () => useProgressStore.getState().notifications;

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  openSettings.mockResolvedValue(undefined);
  fake = createFakeNotifications({ granted: false, canAskAgain: true });
  setNotificationsModuleLoader(fake.loader);
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  useProgressStore.setState(createDefaultProgress(NOW));
  const toast = currentToast();
  if (toast !== null) dismissToast(toast.id);
});

describe('Settings → Notifications', () => {
  it('with permission, the switches show the stored choices and turn them off', async () => {
    await mount({ granted: true, canAskAgain: true });
    expect(screen.getByText('Notifications')).toBeTruthy();
    expect(checked('setting-daily-reminders')).toBe(true);
    expect(checked('setting-streak-reminders')).toBe(true);
    expect(screen.queryByText(/Notifications are/)).toBeNull();

    await fireEvent.press(screen.getByTestId('setting-streak-reminders'));
    expect(notifications().streakEnabled).toBe(false);
    expect(checked('setting-streak-reminders')).toBe(false);
    expect(fake.fake.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith('setting_changed', {
      setting: 'streakReminders',
      value: 'false',
    });
  });

  it('without permission the switches show off with a note; turning one on asks Android', async () => {
    await mount({ granted: false, canAskAgain: true });
    expect(checked('setting-daily-reminders')).toBe(false);
    expect(
      screen.getByText('Notifications are off for Pourly. Turn on a reminder to allow them.'),
    ).toBeTruthy();

    await fireEvent.press(screen.getByTestId('setting-daily-reminders'));
    await settle();
    expect(fake.calls).toEqual(['channel:reminders:Reminders:5', 'request']);
    expect(notifications()).toMatchObject({ granted: true, dailyEnabled: true });
    expect(checked('setting-daily-reminders')).toBe(true);
    expect(screen.queryByText(/Notifications are/)).toBeNull();
    expect(track).toHaveBeenCalledWith('setting_changed', {
      setting: 'dailyReminders',
      value: 'true',
    });
  });

  it('keeps the choice when the request is declined', async () => {
    fake.state.requestAnswer = { granted: false, canAskAgain: true };
    useProgressStore.setState({
      notifications: { ...notifications(), streakEnabled: false },
    });
    await mount({ granted: false, canAskAgain: true });
    await fireEvent.press(screen.getByTestId('setting-streak-reminders'));
    await settle();
    expect(notifications()).toMatchObject({ streakEnabled: true, granted: false });
    expect(checked('setting-streak-reminders')).toBe(false);
  });

  it('once Android no longer prompts, turning one on opens the app settings', async () => {
    await mount({ granted: false, canAskAgain: false });
    expect(
      screen.getByText(
        'Notifications are blocked in Android settings. Turn on a reminder to open the settings.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId('setting-streak-reminders'));
    await settle();
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(fake.fake.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('a failure to open the app settings shows a toast', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    openSettings.mockRejectedValueOnce(new Error('no activity'));
    await mount({ granted: false, canAskAgain: false });
    await fireEvent.press(screen.getByTestId('setting-daily-reminders'));
    await settle();
    expect(currentToast()?.key).toBe('settings.openSettingsFailed');
    expect(warn).toHaveBeenCalled();
  });
});
