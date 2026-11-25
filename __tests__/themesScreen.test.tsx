import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import ThemesScreen from '../app/themes';
import { initI18n } from '@/i18n';
import { track } from '@/services/analytics';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/ui/themes/ThemePreview', () => ({ ThemePreview: () => null }));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const setProgress = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({ ...createDefaultProgress(NOW), ...overrides });

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  setProgress();
});

describe('Themes screen', () => {
  it('shows all eight cards with their owned or locked state', async () => {
    await render(<ThemesScreen />);
    for (const id of ['classic', 'ember', 'sunset', 'forest', 'candy', 'neon', 'aurora', 'gold']) {
      expect(screen.getByTestId(`theme-card-${id}`)).toBeTruthy();
    }
    expect(screen.getByLabelText('Classic theme, in use')).toBeTruthy();
    expect(screen.getByLabelText('Unlock the Ember theme for 300 coins')).toBeTruthy();
    expect(screen.getByLabelText('Unlock the Neon theme for 1,000 coins')).toBeTruthy();
    expect(screen.getByLabelText('Aurora comes with the Starter Pack. Open the shop')).toBeTruthy();
    expect(screen.getByLabelText('Gold is included with VIP. Open the shop')).toBeTruthy();
  });

  it('unlocking a coin theme spends coins, applies it and reports theme_unlocked', async () => {
    setProgress({ coins: 350 });
    await render(<ThemesScreen />);
    await fireEvent.press(screen.getByLabelText('Unlock the Ember theme for 300 coins'));
    expect(screen.getByText('Unlock Ember?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Unlock theme'));
    expect(useProgressStore.getState()).toMatchObject({ coins: 50, activeTheme: 'ember' });
    expect(useProgressStore.getState().ownedThemes).toContain('ember');
    expect(track).toHaveBeenCalledWith('theme_unlocked', { themeId: 'ember', via: 'coins' });
    expect(screen.getByLabelText('Ember theme, in use')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Apply the Classic theme'));
    expect(useProgressStore.getState().activeTheme).toBe('classic');
  });

  it('cancelling the confirmation spends nothing', async () => {
    setProgress({ coins: 350 });
    await render(<ThemesScreen />);
    await fireEvent.press(screen.getByLabelText('Unlock the Ember theme for 300 coins'));
    await fireEvent.press(screen.getByText('Not now'));
    expect(useProgressStore.getState().coins).toBe(350);
  });

  it('too few coins opens Not enough coins with the Shop only', async () => {
    await render(<ThemesScreen />);
    await fireEvent.press(screen.getByLabelText('Unlock the Neon theme for 1,000 coins'));
    expect(screen.getByText('Not enough coins')).toBeTruthy();
    expect(screen.getByText('The Neon theme costs 1000 coins. You have 100.')).toBeTruthy();
    expect(screen.queryByText('Watch ad')).toBeNull();
    await fireEvent.press(screen.getByText('Shop'));
    expect(router.push).toHaveBeenCalledWith('/shop');
    expect(useProgressStore.getState().coins).toBe(100);
  });

  it('Aurora and Gold route to the Shop', async () => {
    await render(<ThemesScreen />);
    await fireEvent.press(
      screen.getByLabelText('Aurora comes with the Starter Pack. Open the shop'),
    );
    await fireEvent.press(screen.getByLabelText('Gold is included with VIP. Open the shop'));
    expect(router.push).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenCalledWith('shop_opened', { from: 'themes_vip' });
  });

  it('Gold is owned while VIP and falls back to Classic when VIP lapses', async () => {
    setProgress({ entitlements: { noAds: false, vip: true } });
    await render(<ThemesScreen />);
    await fireEvent.press(screen.getByLabelText('Apply the Gold theme'));
    expect(useProgressStore.getState().activeTheme).toBe('gold');
    expect(screen.getByLabelText('Gold theme, in use')).toBeTruthy();
    await act(() => {
      useProgressStore.setState({ entitlements: { noAds: false, vip: false } });
    });
    expect(screen.getByLabelText('Classic theme, in use')).toBeTruthy();
  });
});
