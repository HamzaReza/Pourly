import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LevelsScreen from '../app/levels';
import { initI18n } from '@/i18n';
import { getTheme } from '@/render/themes';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { Button } from '@/ui/Button';
import { GameHud } from '@/ui/game/GameHud';
import { Overlay } from '@/ui/Overlay';
import { spacing } from '@/ui/tokens';

import { almostWon, levelOf } from '../test-utils/boards';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/ui/game/Crown', () => ({ Crown: () => null }));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const theme = getTheme('classic');
const ui = theme.ui;

const flat = (style: unknown) =>
  (StyleSheet.flatten(style as never) ?? {}) as Record<string, unknown>;

const layout = (width: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width, height: 44 } },
});

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  useGameStore.getState().clearAll();
  useProgressStore.setState({ ...createDefaultProgress(NOW), level: 7, stars: { 1: 3, 2: 2 } });
});

describe('game HUD title', () => {
  const titleLayer = () => screen.getByTestId('game-title').parent;

  it('is inset on both sides by the wider side group, so it stays centred', async () => {
    useGameStore.getState().loadLevel(levelOf(7, almostWon()), 'level', NOW);
    await render(<GameHud ui={ui} onPause={jest.fn()} onSkip={jest.fn()} skipDisabled={false} />);
    await fireEvent(screen.getByTestId('hud-start'), 'layout', layout(40));
    await fireEvent(screen.getByTestId('hud-end'), 'layout', layout(164));
    const style = flat(titleLayer()?.props.style);
    expect(style.paddingStart).toBe(164 + spacing.sm);
    expect(style.paddingEnd).toBe(164 + spacing.sm);
    expect(style).toMatchObject({ position: 'absolute', alignItems: 'center' });
  });

  it('follows whichever side is wider and never lets the title under either group', async () => {
    useGameStore.getState().loadLevel(levelOf(7, almostWon()), 'level', NOW);
    await render(<GameHud ui={ui} onPause={jest.fn()} onSkip={jest.fn()} skipDisabled={false} />);
    await fireEvent(screen.getByTestId('hud-start'), 'layout', layout(120));
    await fireEvent(screen.getByTestId('hud-end'), 'layout', layout(80));
    let style = flat(titleLayer()?.props.style);
    expect(style.paddingStart).toBe(120 + spacing.sm);
    expect(style.paddingEnd).toBe(120 + spacing.sm);
    await fireEvent(screen.getByTestId('hud-end'), 'layout', layout(200));
    style = flat(titleLayer()?.props.style);
    expect(style.paddingStart).toBe(200 + spacing.sm);
    expect(style.paddingStart).toBeGreaterThan(120);
  });

  it('shrinks a long title to fit instead of overlapping', async () => {
    useGameStore.getState().loadLevel(levelOf(2, almostWon()), 'replay', NOW);
    await render(<GameHud ui={ui} onPause={jest.fn()} onSkip={jest.fn()} skipDisabled={false} />);
    const title = screen.getByText('Replay · Level 2');
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.adjustsFontSizeToFit).toBe(true);
  });
});

describe('Levels list', () => {
  it('pins the chapter headers with an opaque background', async () => {
    await render(<LevelsScreen />);
    const list = screen.getByTestId('levels-list');
    // Item 0 is the intro line; each chapter is a header followed by its 4 rows of 5.
    expect(list.props.stickyHeaderIndices).toEqual(expect.arrayContaining([1, 6, 11]));
    expect(list.props.stickyHeaderIndices).not.toContain(0);
    expect(flat(screen.getByTestId('chapter-1').props.style).backgroundColor).toBe(
      theme.background[0],
    );
  });

  it('makes the "levels completed" line the first item, scrolling with the grid', async () => {
    await render(<LevelsScreen />);
    const intro = within(screen.getByTestId('levels-list')).getByTestId('levels-completed');
    expect(intro).toBeTruthy();
    expect(screen.getByText('6 levels completed')).toBeTruthy();
  });
});

describe('dialog bottom padding', () => {
  const card = () => screen.getByRole('header').parent;
  const bottomPadding = () => {
    const style = flat(card()?.props.style);
    return (style.paddingBottom ?? style.padding) as number;
  };

  it('shrinks under a final ghost (text) action', async () => {
    await render(
      <Overlay title="Level complete!">
        <Button variant="primary" label="Levels" onPress={jest.fn()} ui={ui} />
        <Button variant="ghost" label="Home" onPress={jest.fn()} ui={ui} />
      </Overlay>,
    );
    expect(bottomPadding()).toBe(spacing.md);
  });

  it('keeps 24 dp under a final filled action', async () => {
    await render(
      <Overlay title="Reward">
        <Button variant="primary" label="Continue" onPress={jest.fn()} ui={ui} />
      </Overlay>,
    );
    expect(bottomPadding()).toBe(spacing.xl);
  });

  it('a bottom sheet clears the gesture bar: inset + 24 dp', async () => {
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 640 },
          insets: { top: 0, left: 0, right: 0, bottom: 20 },
        }}
      >
        <Overlay title="Paused" placement="bottom">
          <Button variant="ghost" label="Close" onPress={jest.fn()} ui={ui} />
        </Overlay>
      </SafeAreaProvider>,
    );
    await act(async () => undefined);
    expect(bottomPadding()).toBe(20 + spacing.xl);
  });
});
