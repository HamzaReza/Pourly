import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as Reanimated from 'react-native-reanimated';

import HomeScreen from '../app/index';
import { initI18n } from '@/i18n';
import { ads } from '@/services/ads';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { useSettingsStore } from '@/state/settingsStore';
import { consumeAutoStart } from '@/state/startup';
import { currentToast, dismissToast } from '@/ui/toastQueue';

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
const withRepeat = jest.spyOn(Reanimated, 'withRepeat');
const showRewarded = ads.showRewarded as jest.Mock;

const setProgress = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({
    ...createDefaultProgress(NOW),
    lastSeenAt: 0,
    tutorialDone: true,
    level: 5,
    ...overrides,
  });

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.clearAllMocks();
  consumeAutoStart();
  useSettingsStore.setState({ reducedMotion: 'off' });
  useGameStore.setState({ session: null, parked: null, hint: null });
  setProgress();
  const toast = currentToast();
  if (toast !== null) dismissToast(toast.id);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Home', () => {
  it('renders play, the daily card, the coin badge and the menu', async () => {
    await render(<HomeScreen />);
    expect(screen.getByLabelText('Play level 5')).toBeTruthy();
    expect(screen.getByText('Daily Challenge')).toBeTruthy();
    expect(screen.getByText('Start a streak today')).toBeTruthy();
    expect(screen.getByLabelText("Play today's daily challenge")).toBeTruthy();
    expect(screen.getByLabelText('100 coins. Open the shop')).toBeTruthy();
    expect(screen.queryByTestId('starter-pack-banner')).toBeNull();
    expect(screen.queryByLabelText('Claim your VIP daily bonus')).toBeNull();
    await fireEvent.press(screen.getByLabelText("Play today's daily challenge"));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/game', params: { mode: 'daily' } });
    await fireEvent.press(screen.getByLabelText('Themes'));
    expect(router.push).toHaveBeenCalledWith('/themes');
    await fireEvent.press(screen.getByLabelText('Settings'));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });

  it('marks hard levels and a finished daily with its streak', async () => {
    setProgress({
      level: 20,
      streak: 4,
      lastDailyDate: '2026-11-24',
      dailyHistory: { '2026-11-24': { stars: 3, moves: 20 } },
    });
    await render(<HomeScreen />);
    expect(screen.getByLabelText('Play level 20, hard level')).toBeTruthy();
    expect(screen.getByText('4 day streak')).toBeTruthy();
    expect(screen.getByText('Done ✓')).toBeTruthy();
    expect(screen.queryByLabelText("Play today's daily challenge")).toBeNull();
  });

  it('claims the gift once per day, doubles it with an ad and pulses only while claimable', async () => {
    await render(<HomeScreen />);
    expect(withRepeat).toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText('Claim your daily gift'));
    expect(screen.getByText('Daily gift')).toBeTruthy();
    expect(screen.getByText('Day 1 of 7')).toBeTruthy();
    expect(useProgressStore.getState()).toMatchObject({ coins: 120, giftDayIndex: 1 });
    showRewarded.mockResolvedValueOnce('earned');
    await fireEvent.press(screen.getByLabelText('Double this gift by watching an ad'));
    expect(showRewarded).toHaveBeenCalledWith('DAILY_GIFT_X2');
    expect(useProgressStore.getState().coins).toBe(140);
    expect(screen.getByText('Gift doubled!')).toBeTruthy();
    expect(screen.queryByLabelText('Double this gift by watching an ad')).toBeNull();
    await fireEvent.press(screen.getByText('Continue'));
    withRepeat.mockClear();
    await fireEvent.press(
      screen.getByLabelText('Daily gift claimed. The next one is ready tomorrow'),
    );
    expect(useProgressStore.getState().coins).toBe(140);
    expect(currentToast()?.key).toBe('gift.comeBack');
  });

  it('does not pulse under reduced motion', async () => {
    useSettingsStore.setState({ reducedMotion: 'on' });
    await render(<HomeScreen />);
    expect(withRepeat).not.toHaveBeenCalled();
  });

  it('shows the VIP bonus only to VIPs, once per day', async () => {
    setProgress({ entitlements: { noAds: false, vip: true } });
    await render(<HomeScreen />);
    await fireEvent.press(screen.getByLabelText('Claim your VIP daily bonus'));
    expect(useProgressStore.getState()).toMatchObject({ coins: 150, hints: 5 });
    expect(screen.getByText('VIP daily bonus')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue'));
    expect(screen.queryByLabelText('Claim your VIP daily bonus')).toBeNull();
  });

  it('opens the starter pack window after level 8 and counts down to its end', async () => {
    setProgress({ level: 9 });
    await render(<HomeScreen />);
    expect(useProgressStore.getState().starterPackExpiresAt).toBe(NOW + 72 * 3_600_000);
    expect(screen.getByText('Ends in 72:00:00')).toBeTruthy();
    await act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByText('Ends in 71:59:59')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('View the Starter Pack in the shop'));
    expect(router.push).toHaveBeenCalledWith('/shop');
    // Jump the clock to the end instead of ticking through 259,200 one-second renders (which
    // timed out under heavy CPU load); the next tick sees the offer expired.
    await act(() => {
      jest.setSystemTime(NOW + 72 * 3_600_000);
      jest.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId('starter-pack-banner')).toBeNull();
  });

  it('hides the starter pack when bought', async () => {
    setProgress({ level: 9, starterPackPurchased: true });
    await render(<HomeScreen />);
    expect(screen.queryByTestId('starter-pack-banner')).toBeNull();
    expect(useProgressStore.getState().starterPackExpiresAt).toBeNull();
  });
});
