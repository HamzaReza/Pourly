import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import LevelsScreen, { CHAPTER_SIZE, listedLevelCount } from '../app/levels';
import { PRECOMPUTED_LEVEL_COUNT } from '@/game/generator';
import { initI18n } from '@/i18n';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/ui/game/Crown', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Crown: () => <View testID="crown" /> };
});

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

const setProgress = (overrides: Partial<ProgressState>) =>
  useProgressStore.setState({ ...createDefaultProgress(NOW), ...overrides });

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  // Levels 1–11 done (10 is a hard level), level 12 is current.
  setProgress({
    level: 12,
    stars: { 1: 3, 2: 2, 3: 1, 4: 3, 5: 3, 6: 3, 7: 2, 8: 2, 9: 1, 10: 3, 11: 2 },
  });
});

describe('listedLevelCount', () => {
  it('lists every precomputed level, or more once the player is past them', () => {
    expect(listedLevelCount(1)).toBe(PRECOMPUTED_LEVEL_COUNT);
    expect(listedLevelCount(PRECOMPUTED_LEVEL_COUNT + 7)).toBe(PRECOMPUTED_LEVEL_COUNT + 7);
  });
});

describe('Levels screen', () => {
  it('shows the stars collected out of every listed level and the levels completed', async () => {
    await render(<LevelsScreen />);
    expect(
      screen.getByLabelText(`Stars collected: 25 of ${PRECOMPUTED_LEVEL_COUNT * 3}`),
    ).toBeTruthy();
    expect(screen.getByText(`25 / ${PRECOMPUTED_LEVEL_COUNT * 3}`)).toBeTruthy();
    expect(screen.getByText('11 levels completed')).toBeTruthy();
  });

  it('labels completed, current, hard and locked levels', async () => {
    await render(<LevelsScreen />);
    expect(screen.getByLabelText('Level 2: 2 of 3 stars. Replay')).toBeTruthy();
    expect(screen.getByLabelText('Level 10: 3 of 3 stars. Replay hard level')).toBeTruthy();
    expect(screen.getByLabelText('Level 12: not completed yet. Play')).toBeTruthy();
    const locked = screen.getByLabelText('Level 13, locked');
    expect(locked).toBeDisabled();
    expect(within(screen.getByTestId('level-cell-10')).getByTestId('crown')).toBeTruthy();
    expect(within(screen.getByTestId('level-cell-20')).queryByTestId('crown')).toBeNull();
  });

  it('opens a replay for a completed level and the progression for the current one', async () => {
    await render(<LevelsScreen />);
    await fireEvent.press(screen.getByTestId('level-cell-3'));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/game',
      params: { mode: 'replay', level: '3' },
    });
    await fireEvent.press(screen.getByTestId('level-cell-12'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/game', params: { mode: 'level' } });
  });

  it('locked levels do nothing when pressed', async () => {
    await render(<LevelsScreen />);
    await fireEvent.press(screen.getByTestId('level-cell-15'));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('groups levels into chapters with their progress', async () => {
    await render(<LevelsScreen />);
    const first = screen.getByTestId('chapter-1');
    expect(first.props.accessibilityLabel).toBe(
      'Levels 1 to 20: 11 of 20 completed, 25 of 60 stars',
    );
    expect(within(first).getByText('Levels 1–20')).toBeTruthy();
    expect(within(first).getByText('11/20 · 25★')).toBeTruthy();
    // Chapter 2 is gated (25 of 40 stars in chapter 1, P12.7): its header says what is missing.
    expect(screen.getByTestId(`chapter-${CHAPTER_SIZE + 1}`).props.accessibilityLabel).toBe(
      'Chapter 2 is locked: 25 of 40 stars in chapter 1. See how to unlock it',
    );
  });

  it('counts a skipped level without stored stars as one star', async () => {
    setProgress({ level: 3, stars: { 1: 3 } });
    await render(<LevelsScreen />);
    expect(screen.getByLabelText('Level 2: 1 of 3 stars. Replay')).toBeTruthy();
    expect(screen.getByText('2 levels completed')).toBeTruthy();
  });

  it("opens on the current level's chapter", async () => {
    setProgress({ level: 45, stars: {}, paidChapters: [3] });
    await render(<LevelsScreen />);
    expect(screen.getByTestId('chapter-41')).toBeTruthy();
    expect(screen.getByLabelText('Level 45: not completed yet. Play')).toBeTruthy();
    expect(screen.queryByTestId('chapter-1')).toBeNull();
  });

  it('lists levels past the precomputed ones once the player gets there', async () => {
    setProgress({ level: PRECOMPUTED_LEVEL_COUNT + 3, stars: {}, paidChapters: [16] });
    await render(<LevelsScreen />);
    expect(
      screen.getByLabelText(`Level ${PRECOMPUTED_LEVEL_COUNT + 3}: not completed yet. Play`),
    ).toBeTruthy();
  });

  it('a new player sees level 1 as current and no completed levels', async () => {
    setProgress({ level: 1, stars: {} });
    await render(<LevelsScreen />);
    expect(screen.getByLabelText('Level 1: not completed yet. Play')).toBeTruthy();
    expect(screen.getByText('0 levels completed')).toBeTruthy();
  });
});
