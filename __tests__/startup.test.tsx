import { render, screen } from '@testing-library/react-native';

import HomeScreen from '../app/index';
import { initI18n } from '@/i18n';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { consumeAutoStart, decideAutoStart, shouldAutoStart } from '@/state/startup';
import { revealApp } from '@/ui/splash';

import { levelOf, revealBoard } from '../test-utils/boards';

jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/ui/splash', () => ({ revealApp: jest.fn() }));
jest.mock('@/state/levelLoader', () => ({
  prepareLevel: jest.fn(() => new Promise(() => undefined)),
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  consumeAutoStart();
  useProgressStore.setState(createDefaultProgress(NOW));
  useGameStore.setState({ session: null, hint: null });
});

describe('decideAutoStart', () => {
  it('auto-starts only a brand-new player (level 1, no saved game)', () => {
    decideAutoStart();
    expect(shouldAutoStart()).toBe(true);
    consumeAutoStart();
    expect(shouldAutoStart()).toBe(false);

    useGameStore.getState().loadLevel(levelOf(1, revealBoard()), 'level', NOW);
    decideAutoStart();
    expect(shouldAutoStart()).toBe(false);

    useGameStore.setState({ session: null });
    useProgressStore.setState({ level: 2 });
    decideAutoStart();
    expect(shouldAutoStart()).toBe(false);
  });
});

describe('Home', () => {
  it('redirects to the game once, then shows Home', async () => {
    decideAutoStart();
    const first = await render(<HomeScreen />);
    expect(screen.getByText('redirect')).toBeTruthy();
    expect(revealApp).not.toHaveBeenCalled();
    await first.unmount();
    await render(<HomeScreen />);
    expect(screen.queryByText('redirect')).toBeNull();
    expect(screen.getByLabelText('Play level 1')).toBeTruthy();
    expect(revealApp).toHaveBeenCalled();
  });

  it('shows the resume banner only for a saved game of the current level', async () => {
    useProgressStore.setState({ level: 5 });
    useGameStore.getState().loadLevel(levelOf(5, revealBoard()), 'level', NOW);
    const view = await render(<HomeScreen />);
    expect(screen.getByLabelText('Resume level 5 where you left off')).toBeTruthy();
    await view.unmount();
    useGameStore.getState().loadLevel(levelOf(4, revealBoard()), 'level', NOW);
    await render(<HomeScreen />);
    expect(screen.queryByLabelText('Resume level 5 where you left off')).toBeNull();
  });
});
