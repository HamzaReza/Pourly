import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import SettingsScreen from '../app/settings';
import { PRIVACY_URL, SUPPORT_MAILTO, TERMS_URL } from '@/config/constants';
import { initI18n, SUPPORTED_LANGUAGES } from '@/i18n';
import { track } from '@/services/analytics';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { DEFAULT_SETTINGS, useSettingsStore } from '@/state/settingsStore';

import { levelOf, revealBoard } from '../test-utils/boards';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/state/levelLoader', () => ({
  ...jest.requireActual('@/state/levelLoader'),
  prepareLevel: jest.fn(() => new Promise(() => undefined)),
}));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '7',
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const openURL = jest.spyOn(Linking, 'openURL');

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  openURL.mockResolvedValue(undefined);
  useSettingsStore.setState({ ...DEFAULT_SETTINGS });
  useProgressStore.setState(createDefaultProgress(NOW));
  useGameStore.setState({ session: null, parked: null, hint: null });
});

describe('Settings screen', () => {
  it('renders every row available now and the version', async () => {
    await render(<SettingsScreen />);
    for (const label of ['Sound', 'Haptics', 'Color-blind symbols', 'Reduced motion']) {
      expect(screen.getAllByLabelText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('Performance mode')).toBeTruthy();
    expect(screen.getByLabelText('Language: System default. Change')).toBeTruthy();
    expect(screen.getByText('Version 1.0.0 (build 7)')).toBeTruthy();
  });

  it('toggles and choices update the store and emit setting_changed', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByRole('switch', { name: 'Sound' }));
    await fireEvent.press(screen.getByTestId('setting-color-blind'));
    await fireEvent.press(screen.getByLabelText('Reduced motion: On'));
    await fireEvent.press(screen.getByLabelText('Performance mode: Low'));
    expect(useSettingsStore.getState()).toMatchObject({
      sound: false,
      colorBlind: true,
      reducedMotion: 'on',
      quality: 'low',
    });
    expect(track).toHaveBeenCalledWith('setting_changed', { setting: 'sound', value: 'false' });
    expect(track).toHaveBeenCalledWith('setting_changed', { setting: 'quality', value: 'low' });
    expect(screen.getByRole('switch', { name: 'Sound' })).toHaveProp('accessibilityState', {
      checked: false,
    });
  });

  it('notes when Auto lowered the effects', async () => {
    useSettingsStore.setState({ quality: 'auto', autoQualityDowngraded: true });
    await render(<SettingsScreen />);
    expect(
      screen.getByText('Auto lowered the effects to keep play smooth on this device'),
    ).toBeTruthy();
  });

  it('lists System default and every supported language by native name', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId('setting-language'));
    expect(screen.getAllByRole('radio')).toHaveLength(SUPPORTED_LANGUAGES.length + 1);
    await fireEvent.press(screen.getByLabelText('English'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(useSettingsStore.getState().language).toBe('en');
    expect(track).toHaveBeenCalledWith('setting_changed', { setting: 'language', value: 'en' });
  });

  it('opens privacy, terms and support links', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByLabelText('Privacy Policy'));
    await fireEvent.press(screen.getByLabelText('Terms of Service'));
    await fireEvent.press(screen.getByLabelText('Contact support'));
    expect(openURL.mock.calls.map(([url]) => url)).toEqual([
      PRIVACY_URL,
      TERMS_URL,
      SUPPORT_MAILTO,
    ]);
  });

  it('reset asks twice, keeps purchases, clears saved games and opens level 1', async () => {
    useProgressStore.setState({
      level: 40,
      coins: 999,
      entitlements: { noAds: true, vip: true },
      processedTransactions: ['t1'],
    });
    useGameStore.getState().loadLevel(levelOf(40, revealBoard()), 'level', NOW);
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId('setting-reset'));
    expect(screen.getByText('Reset progress?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue'));
    expect(screen.getByText('Are you sure?')).toBeTruthy();
    expect(useProgressStore.getState().level).toBe(40);
    await fireEvent.press(screen.getByTestId('reset-confirm'));
    expect(useProgressStore.getState()).toMatchObject({
      level: 1,
      coins: 100,
      entitlements: { noAds: true, vip: true },
      processedTransactions: ['t1'],
    });
    expect(useGameStore.getState()).toMatchObject({ session: null, parked: null });
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/game', params: { mode: 'level' } });
  });

  it('cancel at either step keeps everything', async () => {
    useProgressStore.setState({ level: 40 });
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId('setting-reset'));
    await fireEvent.press(screen.getByText('Cancel'));
    await fireEvent.press(screen.getByTestId('setting-reset'));
    await fireEvent.press(screen.getByText('Continue'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(useProgressStore.getState().level).toBe(40);
  });
});
