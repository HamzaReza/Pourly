import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import {
  applyCompleteLevel,
  applyConsume,
  applyGrant,
  applyMarkTutorialDone,
  applyRewardedShown,
  applySkipLevel,
  applySpendCoins,
} from '@/state/progressReducers';
import { useProgressStore } from '@/state/progressStore';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const LATER = NOW + 1000;
const base = (overrides: Partial<ProgressState> = {}): ProgressState => ({
  ...createDefaultProgress(NOW),
  ...overrides,
});

describe('applyCompleteLevel', () => {
  it('advances the level, grants coins, bumps counters and stamps updatedAt', () => {
    const next = applyCompleteLevel(
      base({ level: 4, coins: 100 }),
      { level: 4, stars: 3, coins: 16 },
      LATER,
    );
    expect(next.level).toBe(5);
    expect(next.coins).toBe(116);
    expect(next.stars[4]).toBe(3);
    expect(next.review.threeStarStreak).toBe(1);
    expect(next.ads.levelsSinceInterstitial).toBe(1);
    expect(next.updatedAt).toBe(LATER);
  });

  it('keeps the best stars and never moves the level back on a replay', () => {
    const state = base({
      level: 10,
      stars: { 3: 3 },
      review: { lastPromptAt: 0, promptCount: 0, threeStarStreak: 4 },
    });
    const next = applyCompleteLevel(state, { level: 3, stars: 1, coins: 10 }, LATER);
    expect(next.stars[3]).toBe(3);
    expect(next.level).toBe(10);
    expect(next.review.threeStarStreak).toBe(0);
  });

  it('ignores negative coin amounts', () => {
    expect(
      applyCompleteLevel(base({ coins: 5 }), { level: 1, stars: 2, coins: -50 }, LATER).coins,
    ).toBe(5);
  });
});

describe('applySkipLevel', () => {
  it('gives 1 star without coins and resets the 3-star streak', () => {
    const state = base({
      level: 7,
      coins: 50,
      review: { lastPromptAt: 0, promptCount: 0, threeStarStreak: 2 },
    });
    const next = applySkipLevel(state, 7, LATER);
    expect(next.stars[7]).toBe(1);
    expect(next.level).toBe(8);
    expect(next.coins).toBe(50);
    expect(next.review.threeStarStreak).toBe(0);
    expect(next.ads.levelsSinceInterstitial).toBe(0);
  });

  it('keeps better stars already earned', () => {
    expect(applySkipLevel(base({ stars: { 2: 2 } }), 2, LATER).stars[2]).toBe(2);
  });
});

describe('spend, grant and consume', () => {
  it('spends only when affordable and valid', () => {
    expect(applySpendCoins(base({ coins: 10 }), 10, LATER)?.coins).toBe(0);
    expect(applySpendCoins(base({ coins: 9 }), 10, LATER)).toBeNull();
    expect(applySpendCoins(base({ coins: 9 }), -1, LATER)).toBeNull();
    expect(applySpendCoins(base({ coins: 9 }), 1.5, LATER)).toBeNull();
  });

  it('grants whole non-negative amounts only', () => {
    const next = applyGrant(
      base({ coins: 0, hints: 0, undos: 0, extraTubes: 0 }),
      { coins: 5.7, hints: -2, undos: 2, extraTubes: 1 },
      LATER,
    );
    expect([next.coins, next.hints, next.undos, next.extraTubes]).toEqual([5, 0, 2, 1]);
  });

  it('consumes one item, refusing at zero', () => {
    expect(applyConsume(base({ hints: 1 }), 'hints', LATER)?.hints).toBe(0);
    expect(applyConsume(base({ undos: 0 }), 'undos', LATER)).toBeNull();
  });

  it('marks the tutorial done once and records rewarded ads', () => {
    const done = applyMarkTutorialDone(base(), LATER);
    expect(done.tutorialDone).toBe(true);
    expect(applyMarkTutorialDone(done, LATER + 5)).toBe(done);
    expect(applyRewardedShown(base(), LATER).ads.lastRewardedAt).toBe(LATER);
  });
});

describe('progress store actions', () => {
  beforeEach(() => useProgressStore.setState(createDefaultProgress(NOW)));

  it('returns false and changes nothing when a spend or consume fails', () => {
    const store = useProgressStore.getState();
    expect(store.spendCoins(1000, LATER)).toBe(false);
    expect(useProgressStore.getState().coins).toBe(100);
    expect(store.spendCoins(40, LATER)).toBe(true);
    expect(useProgressStore.getState().coins).toBe(60);
    expect(store.consume('undos', LATER)).toBe(false);
    expect(store.consume('hints', LATER)).toBe(true);
    expect(useProgressStore.getState().hints).toBe(2);
  });

  it('completes and skips levels through the reducers', () => {
    useProgressStore.getState().completeLevel({ level: 1, stars: 2, coins: 13 }, LATER);
    useProgressStore.getState().skipLevel(2, LATER);
    const state = useProgressStore.getState();
    expect(state.level).toBe(3);
    expect(state.stars).toEqual({ 1: 2, 2: 1 });
    expect(state.coins).toBe(113);
  });
});
