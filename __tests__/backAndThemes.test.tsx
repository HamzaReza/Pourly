import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { BackHandler, Text } from 'react-native';

import SettingsScreen from '../app/settings';
import ThemesScreen from '../app/themes';
import { initI18n } from '@/i18n';
import { track } from '@/services/analytics';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { Overlay } from '@/ui/Overlay';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/ui/themes/ThemePreview', () => ({ ThemePreview: () => null }));
jest.mock('@/state/levelLoader', () => ({
  ...jest.requireActual('@/state/levelLoader'),
  prepareLevel: jest.fn(() => new Promise(() => undefined)),
}));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  nativeBuildVersion: '7',
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

/** A BackHandler like Android's: newest listener first, the first one returning true wins. */
type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
let listeners: BackListener[] = [];
const pressBack = async (): Promise<boolean> => {
  let handled = false;
  await act(() => {
    for (const listener of [...listeners].reverse()) {
      if (listener({} as never)) {
        handled = true;
        return;
      }
    }
  });
  return handled;
};

const setProgress = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({ ...createDefaultProgress(NOW), ...overrides });

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  listeners = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    listeners.push(handler);
    return {
      remove: () => {
        listeners = listeners.filter((listener) => listener !== handler);
      },
    };
  });
  setProgress({ coins: 100 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Android Back closes only the top-most overlay', () => {
  it('Themes: Not enough coins closes, the screen stays', async () => {
    await render(<ThemesScreen />);
    await fireEvent.press(screen.getByLabelText('Unlock the Ember theme for 300 coins'));
    expect(screen.getByText('Not enough coins')).toBeTruthy();
    expect(await pressBack()).toBe(true);
    expect(screen.queryByText('Not enough coins')).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    // Nothing open: Back is left to the navigator.
    expect(await pressBack()).toBe(false);
  });

  it('Themes: the unlock confirmation closes on Back without spending', async () => {
    setProgress({ coins: 500 });
    await render(<ThemesScreen />);
    await fireEvent.press(screen.getByLabelText('Unlock the Ember theme for 300 coins'));
    expect(screen.getByTestId('theme-confirm')).toBeTruthy();
    await pressBack();
    expect(screen.queryByTestId('theme-confirm')).toBeNull();
    expect(useProgressStore.getState().coins).toBe(500);
  });

  it('Settings: the reset dialog and the language sheet close on Back', async () => {
    await render(<SettingsScreen />);
    await fireEvent.press(screen.getByTestId('setting-reset'));
    expect(screen.getByTestId('reset-step-1')).toBeTruthy();
    expect(await pressBack()).toBe(true);
    expect(screen.queryByTestId('reset-step-1')).toBeNull();
    await fireEvent.press(screen.getByTestId('setting-language'));
    expect(screen.getByTestId('language-sheet')).toBeTruthy();
    expect(await pressBack()).toBe(true);
    expect(screen.queryByTestId('language-sheet')).toBeNull();
  });

  it('stacked overlays close one at a time, newest first', async () => {
    const closeBottom = jest.fn();
    const closeTop = jest.fn();
    const view = await render(
      <>
        <Overlay title="Bottom" onBackdropPress={closeBottom}>
          <Text>bottom</Text>
        </Overlay>
        <Overlay title="Top" onBackdropPress={closeTop}>
          <Text>top</Text>
        </Overlay>
      </>,
    );
    await pressBack();
    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();
    await view.rerender(
      <Overlay title="Bottom" onBackdropPress={closeBottom}>
        <Text>bottom</Text>
      </Overlay>,
    );
    await pressBack();
    expect(closeBottom).toHaveBeenCalledTimes(1);
  });

  it('an overlay without a close action leaves Back to the screen', async () => {
    await render(<Overlay title="Inert" />);
    expect(await pressBack()).toBe(false);
  });

  it('onRequestClose takes precedence over the backdrop action', async () => {
    const onBackdropPress = jest.fn();
    const onRequestClose = jest.fn();
    await render(
      <Overlay title="T" onBackdropPress={onBackdropPress} onRequestClose={onRequestClose} />,
    );
    await pressBack();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onBackdropPress).not.toHaveBeenCalled();
  });
});

describe('Theme cards', () => {
  it('tapping a locked card body does what its price pill does', async () => {
    await render(<ThemesScreen />);
    await fireEvent.press(screen.getByTestId('theme-card-ember'));
    expect(screen.getByText('Not enough coins')).toBeTruthy();
  });

  it('the card body opens the confirmation when coins suffice, and applies an owned theme', async () => {
    setProgress({ coins: 500, ownedThemes: ['classic', 'sunset'] });
    await render(<ThemesScreen />);
    await fireEvent.press(screen.getByTestId('theme-card-ember'));
    expect(screen.getByTestId('theme-confirm')).toBeTruthy();
    await pressBack();
    await fireEvent.press(screen.getByTestId('theme-card-sunset'));
    expect(useProgressStore.getState().activeTheme).toBe('sunset');
  });

  it('Starter Pack and VIP cards open the Shop; the card in use does nothing', async () => {
    await render(<ThemesScreen />);
    await fireEvent.press(screen.getByTestId('theme-card-gold'));
    expect(track).toHaveBeenCalledWith('shop_opened', { from: 'themes_vip' });
    expect(router.push).toHaveBeenCalledWith('/shop');
    await fireEvent.press(screen.getByTestId('theme-card-aurora'));
    expect(track).toHaveBeenCalledWith('shop_opened', { from: 'themes_starter_pack' });
    (router.push as jest.Mock).mockClear();
    await fireEvent.press(screen.getByTestId('theme-card-classic'));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByTestId('theme-card-classic')).toBeDisabled();
  });

  it('the card is not a separate screen-reader stop: the pill keeps the label', async () => {
    await render(<ThemesScreen />);
    expect(screen.getByTestId('theme-card-ember').props.accessible).toBe(false);
    expect(screen.getAllByLabelText('Unlock the Ember theme for 300 coins')).toHaveLength(1);
  });
});
