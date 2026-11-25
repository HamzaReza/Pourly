import { AppState, type AppStateStatus } from 'react-native';

import { getLevel } from '@/game/generator';
import { setAdShowing } from '@/services/adPresence';
import { ads } from '@/services/ads';
import { track } from '@/services/analytics';
import { initGameLifecycle, onNextPressed } from '@/state/gameFlow';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';

jest.mock('@/services/audio', () => ({
  pauseAll: jest.fn(),
  resumeAll: jest.fn(),
  play: jest.fn(),
}));
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/ads', () => ({
  ads: {
    showRewarded: jest.fn(),
    isRewardedReady: jest.fn(),
    showInterstitial: jest.fn(),
    preload: jest.fn(),
  },
}));
jest.mock('@/state/gameStore', () => ({
  ...jest.requireActual('@/state/gameStore'),
  flushGameSnapshot: jest.fn(() => Promise.resolve()),
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const showInterstitial = ads.showInterstitial as jest.Mock;

const DEFAULT_ADS = createDefaultProgress(NOW).ads;

/** Progress where the scheduler allows an interstitial after level 9. */
const setProgress = (overrides: Partial<ProgressState> = {}) =>
  useProgressStore.setState({
    ...createDefaultProgress(NOW),
    level: 10,
    sessionCount: 3,
    firstSessionStartedAt: NOW - 86_400_000,
    ads: { ...DEFAULT_ADS, levelsSinceInterstitial: 3 },
    ...overrides,
  });

const winLevel = (level: number, skipped = false) => {
  useGameStore.getState().loadLevel(getLevel(level), 'level', NOW);
  useGameStore.setState((state) => ({
    session:
      state.session === null
        ? null
        : {
            ...state.session,
            status: 'won',
            result: { stars: skipped ? 1 : 3, coins: skipped ? 0 : 10, skipped, doubled: false },
          },
  }));
};

beforeEach(() => {
  jest.clearAllMocks();
  useGameStore.setState({ session: null, parked: null, hint: null });
  setProgress();
});

describe('onNextPressed', () => {
  it('shows an interstitial when allowed, records it, then starts the next level', async () => {
    showInterstitial.mockResolvedValueOnce(true);
    winLevel(9);
    const pending = onNextPressed(NOW);
    expect(pending).not.toBeNull();
    expect(useGameStore.getState().session?.levelNumber).toBe(9);
    await pending;
    expect(showInterstitial).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('ad_interstitial_shown', { level: 9 });
    const { ads: pacing } = useProgressStore.getState();
    expect(pacing.levelsSinceInterstitial).toBe(0);
    expect(pacing.lastInterstitialAt).toBeGreaterThan(0);
    expect(useGameStore.getState().session).toMatchObject({ levelNumber: 10, status: 'playing' });
  });

  it('just continues when no interstitial is loaded', async () => {
    showInterstitial.mockResolvedValueOnce(false);
    winLevel(9);
    await onNextPressed(NOW);
    expect(track).not.toHaveBeenCalledWith('ad_interstitial_shown', expect.anything());
    expect(useProgressStore.getState().ads.levelsSinceInterstitial).toBe(3);
    expect(useGameStore.getState().session?.levelNumber).toBe(10);
  });

  it('starts the level synchronously when the scheduler says no', () => {
    const blocked: [string, () => void][] = [
      ['vip', () => setProgress({ entitlements: { noAds: false, vip: true } })],
      ['no_ads', () => setProgress({ entitlements: { noAds: true, vip: false } })],
      ['first session', () => setProgress({ sessionCount: 1, firstSessionStartedAt: NOW })],
      ['cadence', () => setProgress({ ads: { ...DEFAULT_ADS, levelsSinceInterstitial: 2 } })],
      [
        'recent',
        () =>
          setProgress({
            ads: { ...DEFAULT_ADS, levelsSinceInterstitial: 5, lastInterstitialAt: NOW - 60_000 },
          }),
      ],
    ];
    for (const [, arrange] of blocked) {
      arrange();
      winLevel(9);
      expect(onNextPressed(NOW)).toBeNull();
      expect(useGameStore.getState().session?.levelNumber).toBe(10);
    }
    setProgress({ level: 6 });
    winLevel(5);
    expect(onNextPressed(NOW)).toBeNull();
    setProgress();
    winLevel(9, true);
    expect(onNextPressed(NOW)).toBeNull();
    expect(showInterstitial).not.toHaveBeenCalled();
  });

  it('ignores a second Next while the interstitial is up', async () => {
    let close: (shown: boolean) => void = () => undefined;
    showInterstitial.mockImplementationOnce(() => new Promise((resolve) => (close = resolve)));
    winLevel(9);
    const first = onNextPressed(NOW);
    expect(onNextPressed(NOW)).toBeNull();
    expect(useGameStore.getState().session?.levelNumber).toBe(9);
    close(true);
    await first;
    expect(showInterstitial).toHaveBeenCalledTimes(1);
    expect(useGameStore.getState().session?.levelNumber).toBe(10);
  });
});

describe('app lifecycle', () => {
  it('pauses on background, except while a full-screen ad is showing', () => {
    let onChange: (state: AppStateStatus) => void = () => undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      onChange = handler as (state: AppStateStatus) => void;
      return { remove: jest.fn() };
    });
    const stop = initGameLifecycle();
    useGameStore.getState().loadLevel(getLevel(3), 'level', NOW);
    setAdShowing(true);
    onChange('background');
    expect(useGameStore.getState().session?.status).toBe('playing');
    setAdShowing(false);
    onChange('background');
    expect(useGameStore.getState().session?.status).toBe('paused');
    stop();
  });
});
