import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import HomeScreen from '../app/index';
import { initI18n } from '@/i18n';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';
import { consumeAutoStart } from '@/state/startup';
import { getTheme } from '@/render/themes';
import { titleSizeFor } from '@/ui/home/AnimatedTitle';

import { almostWon, levelOf } from '../test-utils/boards';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('@/services/ads', () => ({
  ads: {
    showRewarded: jest.fn(),
    isRewardedReady: jest.fn(),
    showInterstitial: jest.fn(),
    preload: jest.fn(),
  },
}));
jest.mock('@expo/vector-icons/Ionicons', () => {
  const { Text: MockText } = jest.requireActual<typeof import('react-native')>('react-native');
  const MockIcon = ({ name }: { name: string }) => (
    <MockText testID={`icon-${name}`}>{name}</MockText>
  );
  return { __esModule: true, default: MockIcon };
});
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
const ui = getTheme('classic').ui;

const setProgress = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({
    ...createDefaultProgress(NOW),
    lastSeenAt: 0,
    tutorialDone: true,
    level: 5,
    ...overrides,
  });

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  consumeAutoStart();
  useSettingsStore.setState({ reducedMotion: 'on' });
  useGameStore.getState().clearAll();
  setProgress();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Home main button', () => {
  it('reads "Level N" without a saved game and opens the level', async () => {
    await render(<HomeScreen />);
    const play = screen.getByTestId('home-play');
    expect(play.props.accessibilityLabel).toBe('Play level 5');
    expect(screen.getByText('Level 5')).toBeTruthy();
    expect(screen.queryByText(/Continue level/)).toBeNull();
    await fireEvent.press(play);
    expect(router.push).toHaveBeenCalledWith({ pathname: '/game', params: { mode: 'level' } });
  });

  it('reads "Continue level N" when the level is in progress, with no separate resume card', async () => {
    useGameStore.getState().loadLevel(levelOf(5, almostWon()), 'level', NOW);
    await render(<HomeScreen />);
    expect(screen.getByText('Continue level 5')).toBeTruthy();
    expect(screen.getAllByLabelText('Resume level 5 where you left off')).toHaveLength(1);
    expect(screen.queryByText('Level 5')).toBeNull();
    await fireEvent.press(screen.getByTestId('home-play'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/game', params: { mode: 'level' } });
  });

  it('a level stashed behind a replay still counts as in progress', async () => {
    useGameStore.getState().loadLevel(levelOf(5, almostWon()), 'level', NOW);
    useGameStore.getState().loadLevel(levelOf(2, almostWon()), 'replay', NOW + 1);
    await render(<HomeScreen />);
    expect(screen.getByText('Continue level 5')).toBeTruthy();
  });
});

describe('Home layout', () => {
  it('has no chevron on the daily card (Play is its action) and still opens the calendar', async () => {
    await render(<HomeScreen />);
    expect(screen.queryByTestId('icon-chevron-forward')).toBeNull();
    expect(screen.queryByTestId('icon-chevron-back')).toBeNull();
    await fireEvent.press(
      screen.getByLabelText('Daily challenge. Start a streak today. Open the calendar'),
    );
    expect(router.push).toHaveBeenCalledWith('/daily');
  });

  it('has four menu tiles; Levels opens the level list', async () => {
    await render(<HomeScreen />);
    for (const label of ['Levels', 'Shop', 'Themes', 'Settings']) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId('home-levels'));
    expect(router.push).toHaveBeenCalledWith('/levels');
  });

  it('renders the wordmark in the fallback system font with the accented ending', async () => {
    await render(<HomeScreen />);
    const title = screen.getByTestId('home-title');
    expect(title.props.accessibilityLabel).toBe('Pourly');
    const style = flat(title.props.style);
    expect(style.fontFamily).toBeUndefined();
    expect(style.fontWeight).toBe('800');
    expect(screen.getByText('ly').props.style).toMatchObject({ color: ui.accent });
  });

  it('the gift chip and the coin badge share one height; only a ready gift is outlined in accent', async () => {
    await render(<HomeScreen />);
    const gift = screen.getByTestId('gift-button');
    const coins = screen.getByLabelText('100 coins. Open the shop');
    expect(flat(gift.props.style).height).toBe(flat(coins.props.style).height);
    expect(flat(gift.props.style).borderColor).toBe(ui.accent);
    await fireEvent.press(gift);
    expect(
      flat(screen.getByTestId('gift-button', { includeHiddenElements: true }).props.style)
        .borderColor,
    ).not.toBe(ui.accent);
  });
});

describe('wordmark size', () => {
  it('scales with the window width and is clamped to 56–84 dp', () => {
    expect(titleSizeFor(360)).toBe(68);
    expect(titleSizeFor(200)).toBe(56);
    expect(titleSizeFor(800)).toBe(84);
  });
});
