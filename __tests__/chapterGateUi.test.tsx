import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import HomeScreen from '../app/index';
import LevelsScreen from '../app/levels';
import { initI18n } from '@/i18n';
import { getTheme } from '@/render/themes';
import { track } from '@/services/analytics';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState, type StarCount } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { consumeAutoStart } from '@/state/startup';
import { ChapterGateOverlay } from '@/ui/game/overlays/ChapterGateOverlay';
import { currentToast, dismissToast } from '@/ui/toastQueue';
import { colors } from '@/ui/tokens';

const mockParams: { current: Record<string, string> } = { current: {} };

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => ({
  ...jest.requireActual('../test-utils/gameScreenMocks').routerModule(),
  useLocalSearchParams: () => mockParams.current,
}));
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
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
  const MockIcon = ({ name, color }: { name: string; color?: string }) => (
    <MockText testID={`icon-${name}`} style={{ color }}>
      {name}
    </MockText>
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
const trackMock = track as jest.Mock;

const starsFor = (from: number, to: number, value: StarCount): Record<number, StarCount> => {
  const out: Record<number, StarCount> = {};
  for (let level = from; level <= to; level += 1) out[level] = value;
  return out;
};

/** Level 21 reached with 34★ in chapter 1: chapter 2 is gated at 60 coins. */
const setGated = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({
    ...createDefaultProgress(NOW),
    lastSeenAt: 0,
    tutorialDone: true,
    level: 21,
    coins: 100,
    stars: starsFor(1, 17, 2),
    ...overrides,
  });

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.current = {};
  consumeAutoStart();
  useGameStore.getState().clearAll();
  setGated();
  for (let toast = currentToast(); toast !== null; toast = currentToast()) dismissToast(toast.id);
});

describe('chapter gate dialog', () => {
  const renderGate = async () => {
    const handlers = {
      onReplay: jest.fn(),
      onUnlocked: jest.fn(),
      onClose: jest.fn(),
      onShop: jest.fn(),
    };
    await render(<ChapterGateOverlay ui={ui} chapter={2} {...handlers} />);
    return handlers;
  };

  it('shows what is missing and reports that it opened', async () => {
    await renderGate();
    expect(screen.getByText('Chapter 2 is locked')).toBeTruthy();
    expect(screen.getByText('Collect 40★ in chapter 1 to unlock it.')).toBeTruthy();
    expect(screen.getByText('34 / 40 ★')).toBeTruthy();
    expect(screen.getByLabelText('34 of 40 stars in chapter 1')).toBeTruthy();
    expect(screen.getByText('Unlock for 60 coins')).toBeTruthy();
    expect(trackMock).toHaveBeenCalledWith('chapter_gate_shown', {
      chapter: 2,
      stars: 34,
      target: 40,
    });
  });

  it('Replay levels points at the previous chapter; Not now closes', async () => {
    const handlers = await renderGate();
    await fireEvent.press(screen.getByTestId('chapter-gate-replay'));
    expect(handlers.onReplay).toHaveBeenCalledWith(1);
    await fireEvent.press(screen.getByText('Not now'));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before spending; Unlock spends, toasts and continues', async () => {
    const handlers = await renderGate();
    await fireEvent.press(screen.getByTestId('chapter-gate-unlock'));
    expect(screen.getByText('Spend 60 coins to unlock chapter 2?')).toBeTruthy();
    expect(useProgressStore.getState().coins).toBe(100);
    await fireEvent.press(screen.getByTestId('chapter-unlock-confirm-button'));
    expect(useProgressStore.getState()).toMatchObject({ coins: 40, paidChapters: [2] });
    expect(currentToast()?.key).toBe('chapters.unlocked');
    expect(handlers.onUnlocked).toHaveBeenCalledTimes(1);
  });

  it('Cancel on the confirmation goes back without spending', async () => {
    await renderGate();
    await fireEvent.press(screen.getByTestId('chapter-gate-unlock'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.getByText('Chapter 2 is locked')).toBeTruthy();
    expect(useProgressStore.getState().coins).toBe(100);
  });

  it('the stars in the dialog are gold and Replay levels has no restart icon', async () => {
    await renderGate();
    const stars = screen.getAllByText('★');
    expect(stars.length).toBeGreaterThanOrEqual(2);
    for (const star of stars) expect(StyleSheet.flatten(star.props.style).color).toBe(colors.star);
    expect(within(screen.getByTestId('chapter-gate-replay')).queryByTestId(/^icon-/)).toBeNull();
  });

  it('when coins fall short the unlock looks secondary and shows the balance', async () => {
    setGated({ coins: 20 });
    await renderGate();
    expect(StyleSheet.flatten(screen.getByTestId('chapter-gate-unlock').props.style).opacity).toBe(
      0.6,
    );
    expect(screen.getByText('You have 20 coins')).toBeTruthy();
  });

  it('when affordable the unlock has the normal style and no balance line', async () => {
    await renderGate();
    expect(
      StyleSheet.flatten(screen.getByTestId('chapter-gate-unlock').props.style).opacity,
    ).toBeUndefined();
    expect(screen.queryByTestId('chapter-gate-balance')).toBeNull();
  });

  it('short on coins opens Not enough coins with the Shop', async () => {
    setGated({ coins: 20 });
    const handlers = await renderGate();
    await fireEvent.press(screen.getByTestId('chapter-gate-unlock'));
    expect(screen.getByText('Not enough coins')).toBeTruthy();
    expect(screen.getByText('Unlocking chapter 2 costs 60 coins. You have 20.')).toBeTruthy();
    expect(screen.queryByText('Spend 60 coins to unlock chapter 2?')).toBeNull();
    await fireEvent.press(screen.getByText('Shop'));
    expect(handlers.onShop).toHaveBeenCalledTimes(1);
  });

  it('closes itself as soon as the chapter opens some other way', async () => {
    const handlers = await renderGate();
    await act(async () => {
      useProgressStore.setState({ stars: starsFor(1, 20, 2) });
    });
    expect(handlers.onUnlocked).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Chapter 2 is locked')).toBeNull();
    expect(useProgressStore.getState().coins).toBe(100);
  });
});

describe('Home main button', () => {
  it('becomes "Unlock chapter N" and opens the gate', async () => {
    await render(<HomeScreen />);
    const button = screen.getByTestId('home-play');
    expect(screen.getByText('Unlock chapter 2')).toBeTruthy();
    expect(button.props.accessibilityLabel).toBe('Chapter 2 is locked. See how to unlock it');
    await fireEvent.press(button);
    expect(screen.getByTestId('chapter-gate')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalledWith({ pathname: '/game', params: { mode: 'level' } });
    await fireEvent.press(screen.getByTestId('chapter-gate-replay'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/levels', params: { chapter: '1' } });
  });

  it('plays normally once the chapter is open', async () => {
    setGated({ stars: starsFor(1, 20, 2) });
    await render(<HomeScreen />);
    expect(screen.getByText('Level 21')).toBeTruthy();
  });
});

describe('Levels screen gates', () => {
  it('a locked chapter header shows what is missing and opens the gate', async () => {
    await render(<LevelsScreen />);
    const header = screen.getByLabelText(
      'Chapter 2 is locked: 34 of 40 stars in chapter 1. See how to unlock it',
    );
    expect(screen.getByText('34/40★ to unlock')).toBeTruthy();
    await fireEvent.press(header);
    expect(screen.getByTestId('chapter-gate')).toBeTruthy();
  });

  it('chapters behind the next gate just say "Locked" and are not buttons', async () => {
    await render(<LevelsScreen />);
    const third = screen.getByTestId('chapter-41');
    expect(third.props.accessibilityLabel).toBe('Levels 41–60, Locked');
    expect(third.props.accessibilityRole).toBe('header');
    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/to unlock/)).toHaveLength(1);
  });

  it('draws the gate requirement and its bar in gold', async () => {
    await render(<LevelsScreen />);
    const text = screen.getByText('34/40★ to unlock');
    expect(StyleSheet.flatten(text.props.style).color).toBe(colors.star);
    const header = screen.getByTestId('chapter-21');
    expect(
      StyleSheet.flatten(within(header).getByTestId('icon-lock-closed').props.style).color,
    ).toBe(colors.star);
  });

  it('the current level inside a locked chapter is a locked tile', async () => {
    await render(<LevelsScreen />);
    expect(screen.getByLabelText('Level 21, locked')).toBeDisabled();
    expect(screen.queryByLabelText('Level 21: not completed yet. Play')).toBeNull();
  });

  it('an open chapter keeps the plain header and a playable current tile', async () => {
    setGated({ stars: starsFor(1, 20, 2) });
    await render(<LevelsScreen />);
    expect(screen.getByLabelText('Level 21: not completed yet. Play')).toBeTruthy();
    // Chapter 2 is open; chapter 3 (0★ in chapter 2) is the next gate.
    expect(screen.getByTestId('chapter-21').props.accessibilityRole).toBe('header');
    expect(screen.getByText('0/40★ to unlock')).toBeTruthy();
  });

  it('opens on the chapter named by the route', async () => {
    setGated({ level: 85, stars: starsFor(1, 84, 3) });
    mockParams.current = { chapter: '2' };
    await render(<LevelsScreen />);
    expect(screen.getByTestId('chapter-21')).toBeTruthy();
    expect(screen.queryByTestId('chapter-81')).toBeNull();
  });
});
