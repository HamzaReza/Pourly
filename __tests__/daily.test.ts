import {
  applyDailyCompletion,
  currentStreak,
  dailyConfig,
  dailySeed,
  generateDaily,
  type StreakState,
} from '@/game/daily';
import { encodeLevel } from '@/game/levelCodec';
import { localDateString } from '@/utils/date';

const state = (overrides: Partial<StreakState> = {}): StreakState => ({
  streak: 0,
  bestStreak: 0,
  lastDailyDate: null,
  streakFreezeWeek: null,
  lastSeenAt: 0,
  ...overrides,
});

describe('daily board', () => {
  it('same date gives the same board; different dates give different seeds', () => {
    expect(encodeLevel(generateDaily('2026-11-24'))).toBe(encodeLevel(generateDaily('2026-11-24')));
    expect(generateDaily('2026-11-24').id).toBe('daily-2026-11-24');
    expect(dailySeed('2026-11-24')).not.toBe(dailySeed('2026-11-25'));
  });

  it('config stays mid-high with mystery on; invalid dates throw', () => {
    for (let day = 1; day <= 28; day += 1) {
      const config = dailyConfig(`2026-02-${String(day).padStart(2, '0')}`);
      expect(config.colors).toBeGreaterThanOrEqual(8);
      expect(config.colors).toBeLessThanOrEqual(10);
      expect(config.hiddenRatio).toBeGreaterThan(0);
      expect(config.emptyTubes).toBe(2);
      expect(config.hard).toBe(false);
    }
    expect(() => dailySeed('2026-13-01')).toThrow();
    expect(() => dailyConfig('24/11/2026')).toThrow();
  });
});

describe('daily streak', () => {
  it('first completion, same day again, then the next day', () => {
    const first = applyDailyCompletion(state(), { today: '2026-11-24', now: 10, isVip: false });
    expect(first).toMatchObject({ rewardGranted: true, outcome: 'first' });
    expect(first.state).toEqual({
      streak: 1,
      bestStreak: 1,
      lastDailyDate: '2026-11-24',
      streakFreezeWeek: null,
    });
    const again = applyDailyCompletion(
      { ...first.state, lastSeenAt: 10 },
      { today: '2026-11-24', now: 20, isVip: false },
    );
    expect(again).toMatchObject({ rewardGranted: false, outcome: 'sameDay' });
    expect(again.state).toEqual(first.state);
    const next = applyDailyCompletion(
      { ...first.state, lastSeenAt: 20 },
      { today: '2026-11-25', now: 30, isVip: false },
    );
    expect(next).toMatchObject({ rewardGranted: true, outcome: 'consecutive' });
    expect(next.state.streak).toBe(2);
    expect(next.state.bestStreak).toBe(2);
  });

  it('a missed day resets to 1 and keeps bestStreak', () => {
    const result = applyDailyCompletion(
      state({ streak: 5, bestStreak: 7, lastDailyDate: '2026-11-20' }),
      { today: '2026-11-22', now: 1, isVip: false },
    );
    expect(result).toMatchObject({ rewardGranted: true, outcome: 'reset' });
    expect(result.state.streak).toBe(1);
    expect(result.state.bestStreak).toBe(7);
  });

  it('a VIP freeze covers exactly one missed day, once per ISO week', () => {
    const base = state({ streak: 4, bestStreak: 4, lastDailyDate: '2026-11-23' });
    const frozen = applyDailyCompletion(base, { today: '2026-11-25', now: 1, isVip: true });
    expect(frozen.outcome).toBe('freeze');
    expect(frozen.state.streak).toBe(5);
    expect(frozen.state.streakFreezeWeek).toBe('2026-W48');

    const secondThisWeek = applyDailyCompletion(
      { ...frozen.state, lastSeenAt: 1 },
      { today: '2026-11-27', now: 2, isVip: true },
    );
    expect(secondThisWeek.outcome).toBe('reset');
    expect(secondThisWeek.state.streak).toBe(1);

    const nextWeek = applyDailyCompletion(
      { ...frozen.state, lastDailyDate: '2026-11-28', lastSeenAt: 1 },
      { today: '2026-11-30', now: 2, isVip: true },
    );
    expect(nextWeek.outcome).toBe('freeze');
    expect(nextWeek.state.streakFreezeWeek).toBe('2026-W49');

    const twoMissed = applyDailyCompletion(base, { today: '2026-11-26', now: 1, isVip: true });
    expect(twoMissed.outcome).toBe('reset');
    const notVip = applyDailyCompletion(base, { today: '2026-11-25', now: 1, isVip: false });
    expect(notVip.outcome).toBe('reset');
  });

  it('clock rollback grants nothing and keeps state', () => {
    const current = state({
      streak: 3,
      bestStreak: 3,
      lastDailyDate: '2026-11-24',
      streakFreezeWeek: '2026-W47',
      lastSeenAt: 1_000,
    });
    const kept = {
      streak: 3,
      bestStreak: 3,
      lastDailyDate: '2026-11-24',
      streakFreezeWeek: '2026-W47',
    };
    const backwardsNow = applyDailyCompletion(current, {
      today: '2026-11-25',
      now: 500,
      isVip: false,
    });
    expect(backwardsNow).toEqual({ state: kept, rewardGranted: false, outcome: 'clockRollback' });
    const backwardsDate = applyDailyCompletion(current, {
      today: '2026-11-20',
      now: 2_000,
      isVip: false,
    });
    expect(backwardsDate).toEqual({ state: kept, rewardGranted: false, outcome: 'clockRollback' });
  });

  it('timezone changes only matter through the local date string', () => {
    const completed = state({ streak: 2, bestStreak: 2, lastDailyDate: '2026-11-24' });
    // Flying west late on the 24th: the local date is still the 24th, so it is the same day.
    const westward = localDateString(new Date(2026, 10, 24, 23, 0, 0));
    expect(applyDailyCompletion(completed, { today: westward, now: 1, isVip: false }).outcome).toBe(
      'sameDay',
    );
    // Flying east past midnight: the local date becomes the 25th, so it is the next day.
    const eastward = localDateString(new Date(2026, 10, 25, 0, 30, 0));
    const next = applyDailyCompletion(completed, { today: eastward, now: 1, isVip: false });
    expect(next.outcome).toBe('consecutive');
    expect(next.state.streak).toBe(3);
  });

  it('currentStreak drops to 0 after a missed day unless a VIP freeze can save it', () => {
    const completed = state({ streak: 6, bestStreak: 6, lastDailyDate: '2026-11-24' });
    expect(currentStreak(completed, '2026-11-24')).toBe(6);
    expect(currentStreak(completed, '2026-11-25')).toBe(6);
    expect(currentStreak(completed, '2026-11-26')).toBe(0);
    expect(currentStreak(completed, '2026-11-26', true)).toBe(6);
    expect(currentStreak({ ...completed, streakFreezeWeek: '2026-W48' }, '2026-11-26', true)).toBe(
      0,
    );
    expect(currentStreak(completed, '2026-11-27', true)).toBe(0);
    expect(currentStreak(state(), '2026-11-24')).toBe(0);
  });
});
