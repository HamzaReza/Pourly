import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BackHandler } from 'react-native';

import GameScreen from '../app/game';
import { initI18n } from '@/i18n';
import { setNotificationsModuleLoader, syncNotificationPermission } from '@/services/notifications';
import {
  REVIEW_AD_QUIET_MS,
  REVIEW_SPACING_MS,
  requestReviewIfDue,
  reviewVerdict,
  setStoreReviewLoader,
  type ReviewInput,
  type ReviewVerdict,
} from '@/services/review';
import { useGameStore } from '@/state/gameStore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { logger } from '@/utils/logger';

import { almostWon, levelOf } from '../test-utils/boards';
import { createFakeNotifications, createFakeStoreReview } from '../test-utils/fakeNotifications';
import { boardProps } from '../test-utils/gameScreenMocks';

jest.mock('react-native-reanimated', () => jest.requireActual('../test-utils/reanimatedStub'));
jest.mock('@/render/Board', () =>
  jest.requireActual('../test-utils/gameScreenMocks').boardModule(),
);
jest.mock('@/render/useRenderSettings', () =>
  jest.requireActual('../test-utils/gameScreenMocks').renderSettingsModule(),
);
jest.mock('@/render/useHint', () =>
  jest.requireActual('../test-utils/gameScreenMocks').hintModule(),
);
jest.mock('@/services/audio', () =>
  jest.requireActual('../test-utils/gameScreenMocks').audioModule(),
);
jest.mock('expo-router', () => jest.requireActual('../test-utils/gameScreenMocks').routerModule());
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('../test-utils/gameScreenMocks').safeAreaModule(),
);
jest.mock('@/ui/game/Crown', () => ({ Crown: () => null }));
jest.mock('@/ui/FpsOverlay', () => ({ FpsOverlay: () => null }));
jest.mock('@/ui/splash', () => ({ revealApp: jest.fn() }));
jest.mock('@/services/analytics', () => ({ track: jest.fn() }));
jest.mock('@/services/ads', () => ({
  ads: {
    showRewarded: jest.fn(),
    isRewardedReady: jest.fn(),
    showInterstitial: jest.fn(() => Promise.resolve(false)),
    preload: jest.fn(),
  },
}));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const DAY = 86_400_000;

const ELIGIBLE: ReviewInput = {
  mode: 'level',
  level: 12,
  skipped: false,
  doubled: false,
  review: { lastPromptAt: 0, promptCount: 0, threeStarStreak: 3 },
  ads: { lastRewardedAt: 0, lastInterstitialAt: 0 },
};

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeAll(async () => {
  await initI18n('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
  useGameStore.setState({ session: null, parked: null, hint: null });
  useProgressStore.setState(createDefaultProgress(NOW));
});

describe('reviewVerdict', () => {
  it.each<[string, Partial<ReviewInput>, ReviewVerdict]>([
    ['level 12, third 3★ win in a row, never asked', {}, 'allowed'],
    ['level 10 is the first eligible level', { level: 10 }, 'allowed'],
    ['level 9', { level: 9 }, 'belowLevel'],
    ['the daily', { mode: 'daily' }, 'notLevelWin'],
    ['a skipped level', { skipped: true }, 'notLevelWin'],
    [
      'only two 3★ wins in a row',
      { review: { ...ELIGIBLE.review, threeStarStreak: 2 } },
      'noStreak',
    ],
    ['three prompts already', { review: { ...ELIGIBLE.review, promptCount: 3 } }, 'maxPrompts'],
    [
      'asked 59 days ago',
      { review: { ...ELIGIBLE.review, promptCount: 1, lastPromptAt: NOW - 59 * DAY } },
      'tooSoon',
    ],
    [
      'asked 60 days ago',
      { review: { ...ELIGIBLE.review, promptCount: 1, lastPromptAt: NOW - REVIEW_SPACING_MS } },
      'allowed',
    ],
    [
      'clock turned back (last prompt in the future)',
      { review: { ...ELIGIBLE.review, promptCount: 1, lastPromptAt: NOW + DAY } },
      'tooSoon',
    ],
    [
      'rewarded ad 30 s ago',
      { ads: { lastRewardedAt: NOW - 30_000, lastInterstitialAt: 0 } },
      'afterAd',
    ],
    [
      'rewarded ad 60 s ago',
      { ads: { lastRewardedAt: NOW - REVIEW_AD_QUIET_MS, lastInterstitialAt: 0 } },
      'allowed',
    ],
    [
      'interstitial 59 s ago',
      { ads: { lastRewardedAt: 0, lastInterstitialAt: NOW - 59_000 } },
      'afterAd',
    ],
    ['coins doubled with an ad', { doubled: true }, 'afterAd'],
  ])('%s', (_label, overrides, expected) => {
    expect(reviewVerdict({ ...ELIGIBLE, ...overrides }, NOW)).toBe(expected);
  });
});

describe('requestReviewIfDue', () => {
  it('requests and records when allowed and available', async () => {
    const review = createFakeStoreReview(true);
    setStoreReviewLoader(review.loader);
    await expect(requestReviewIfDue(ELIGIBLE, NOW)).resolves.toBe(true);
    expect(review.fake.requestReview).toHaveBeenCalledTimes(1);
    expect(useProgressStore.getState().review).toMatchObject({ lastPromptAt: NOW, promptCount: 1 });
  });

  it('does nothing when the store review is unavailable', async () => {
    const review = createFakeStoreReview(false);
    setStoreReviewLoader(review.loader);
    await expect(requestReviewIfDue(ELIGIBLE, NOW)).resolves.toBe(false);
    expect(review.fake.requestReview).not.toHaveBeenCalled();
    expect(useProgressStore.getState().review.promptCount).toBe(0);
  });

  it('does not load the module when the rules say no', async () => {
    const loader = jest.fn(createFakeStoreReview(true).loader);
    setStoreReviewLoader(loader);
    await expect(requestReviewIfDue({ ...ELIGIBLE, level: 3 }, NOW)).resolves.toBe(false);
    await expect(requestReviewIfDue(null, NOW)).resolves.toBe(false);
    expect(loader).not.toHaveBeenCalled();
  });

  it('never throws', async () => {
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    setStoreReviewLoader(() => Promise.reject(new Error('missing')));
    await expect(requestReviewIfDue(ELIGIBLE, NOW)).resolves.toBe(false);
  });
});

describe('review after the Win overlay', () => {
  /** Wins `level` as the third 3★ win in a row, with notifications already allowed. */
  const winThirdThreeStar = async (level: number, overrides: Partial<ProgressState> = {}) => {
    const notifications = createFakeNotifications({ granted: true, canAskAgain: true });
    setNotificationsModuleLoader(notifications.loader);
    await syncNotificationPermission();
    useProgressStore.setState({
      tutorialDone: true,
      level,
      review: { lastPromptAt: 0, promptCount: 0, threeStarStreak: 2 },
      ...overrides,
    });
    useGameStore.getState().loadLevel(levelOf(level, almostWon()), 'level', NOW);
    await render(<GameScreen />);
    const root = screen.root;
    if (root === null) throw new Error('nothing rendered');
    await fireEvent(root, 'layout', { nativeEvent: { layout: { width: 400, height: 800 } } });
    await act(() => {
      boardProps.current?.onPour?.(1, 0);
    });
    await act(() => {
      boardProps.current?.onWinSequenceEnd?.();
    });
    expect(useProgressStore.getState().review.threeStarStreak).toBe(3);
  };

  it('Next hides the Win overlay, requests the review, then starts the next level', async () => {
    let finish: () => void = () => undefined;
    const review = createFakeStoreReview(true);
    review.fake.requestReview.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    setStoreReviewLoader(review.loader);
    await winThirdThreeStar(12);
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    await settle();
    expect(review.fake.requestReview).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Level complete!')).toBeNull();
    expect(useGameStore.getState().session?.levelNumber).toBe(12);
    await act(async () => {
      finish();
    });
    await settle();
    expect(useGameStore.getState().session?.levelNumber).toBe(13);
    expect(useProgressStore.getState().review.promptCount).toBe(1);
  });

  it('no review below level 10; Next continues at once', async () => {
    const review = createFakeStoreReview(true);
    setStoreReviewLoader(review.loader);
    await winThirdThreeStar(9);
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    await settle();
    expect(review.fake.isAvailableAsync).not.toHaveBeenCalled();
    expect(useGameStore.getState().session?.levelNumber).toBe(10);
  });

  it('no review right after a rewarded ad', async () => {
    const review = createFakeStoreReview(true);
    setStoreReviewLoader(review.loader);
    await winThirdThreeStar(12, {
      ads: { ...createDefaultProgress(NOW).ads, lastRewardedAt: Date.now() - 10_000 },
    });
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    await settle();
    expect(review.fake.requestReview).not.toHaveBeenCalled();
    expect(useGameStore.getState().session?.levelNumber).toBe(13);
  });

  it('the notification soft-prompt takes the turn; no review together with it', async () => {
    const review = createFakeStoreReview(true);
    setStoreReviewLoader(review.loader);
    const notifications = createFakeNotifications({ granted: false, canAskAgain: true });
    await winThirdThreeStar(12);
    setNotificationsModuleLoader(notifications.loader);
    await syncNotificationPermission();
    useProgressStore.setState({ notifications: createDefaultProgress(NOW).notifications });
    await fireEvent.press(screen.getByLabelText('Play the next level'));
    expect(screen.getByTestId('notification-prompt')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Not now, no reminders'));
    await settle();
    expect(review.fake.requestReview).not.toHaveBeenCalled();
    expect(useGameStore.getState().session?.levelNumber).toBe(13);
  });
});
