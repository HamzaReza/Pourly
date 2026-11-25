import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import DailyScreen from '../app/daily';
import { initI18n } from '@/i18n';
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
jest.mock('expo-localization', () => ({
  ...jest.requireActual('expo-localization'),
  getCalendars: () => [{ firstWeekday: 1 }],
}));
jest.mock('@/state/dailyLoader', () => ({
  prepareDaily: jest.fn(() => new Promise(() => undefined)),
  readyDaily: jest.fn(() => null),
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const TODAY = '2026-11-24';

const setProgress = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({
    ...createDefaultProgress(NOW),
    installDate: '2026-09-10',
    ...overrides,
  });

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  setProgress();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Daily screen', () => {
  it('shows streaks, the gift progress and Play for an open day', async () => {
    setProgress({ streak: 2, bestStreak: 5, lastDailyDate: '2026-11-23', giftDayIndex: 2 });
    await render(<DailyScreen />);
    expect(screen.getByText('Current streak')).toBeTruthy();
    expect(screen.getByText('2 days')).toBeTruthy();
    expect(screen.getByText('5 days')).toBeTruthy();
    expect(screen.getByText('2 of 7 gifts claimed')).toBeTruthy();
    expect(screen.getByLabelText('November 24, today')).toBeTruthy();
    await fireEvent.press(screen.getByText("Play today's challenge"));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/game', params: { mode: 'daily' } });
  });

  it('marks completed days and offers Play again when today is done', async () => {
    setProgress({
      streak: 1,
      bestStreak: 1,
      lastDailyDate: TODAY,
      dailyHistory: {
        [TODAY]: { stars: 3, moves: 20 },
        '2026-11-03': { stars: 2, moves: 30 },
      },
    });
    await render(<DailyScreen />);
    expect(screen.getByLabelText('November 24, today, completed')).toBeTruthy();
    expect(screen.getByLabelText('November 3, completed')).toBeTruthy();
    expect(screen.getByLabelText('November 4')).toBeTruthy();
    expect(screen.getAllByText('1 day')).toHaveLength(2);
    expect(screen.getByText('Done ✓')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Replay today's challenge for fun (no reward)"));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/game', params: { mode: 'daily' } });
  });

  it('navigates months from the install month to the current month only', async () => {
    await render(<DailyScreen />);
    expect(screen.getByText('November 2026')).toBeTruthy();
    expect(screen.queryByLabelText('Next month')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getByText('October 2026')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Previous month'));
    expect(screen.getByText('September 2026')).toBeTruthy();
    expect(screen.queryByLabelText('Previous month')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Next month'));
    expect(screen.getByText('October 2026')).toBeTruthy();
  });

  it('starts weeks on the device first weekday (Sunday here)', async () => {
    await render(<DailyScreen />);
    const headers = screen
      .getAllByText(/^[SMTWF]$/, { includeHiddenElements: true })
      .map((node) => node.props.children);
    expect(headers.slice(0, 7)).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });
});
