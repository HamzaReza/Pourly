import { ECONOMY } from '@/config/economy';
import { dailyChallengeReward, scaleReward, streakBonus } from '@/game/economy';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';
import { applyDailyComplete } from '@/state/progressReducers';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const TODAY = '2026-11-24';

const progress = (overrides: Partial<ProgressState> = {}): ProgressState => ({
  ...createDefaultProgress(NOW),
  lastSeenAt: NOW - 1000,
  ...overrides,
});

const complete = (state: ProgressState, date = TODAY, today = TODAY, now = NOW) =>
  applyDailyComplete(state, { date, today, now, stars: 3, moves: 21 });

describe('daily reward maths', () => {
  it('streak bonus grows 2 per day and caps at 20; bad input counts as 0', () => {
    expect(streakBonus(0)).toBe(0);
    expect(streakBonus(1)).toBe(2);
    expect(streakBonus(10)).toBe(20);
    expect(streakBonus(11)).toBe(ECONOMY.streakBonusCap);
    expect(streakBonus(-3)).toBe(0);
    expect(streakBonus(2.9)).toBe(4);
    expect(streakBonus(Number.NaN)).toBe(0);
  });

  it('daily coins are base + bonus, doubled for VIP', () => {
    expect(dailyChallengeReward({ streak: 1, isVip: false })).toBe(42);
    expect(dailyChallengeReward({ streak: 30, isVip: false })).toBe(60);
    expect(dailyChallengeReward({ streak: 3, isVip: true })).toBe(92);
  });

  it('scaleReward multiplies present items and keeps missing ones absent', () => {
    expect(scaleReward({ coins: 20 }, 2)).toEqual({ coins: 40 });
    expect(scaleReward({ coins: 150, hints: 3, extraTubes: 3 }, 2)).toEqual({
      coins: 300,
      hints: 6,
      extraTubes: 6,
    });
    expect(scaleReward({ undos: 2 }, -1)).toEqual({ undos: 0 });
  });
});

describe('applyDailyComplete', () => {
  it('first completion: streak 1, coins, history, best streak and lastSeenAt', () => {
    const result = complete(progress());
    expect(result.outcome).toBe('first');
    expect(result.coins).toBe(42);
    expect(result.streak).toBe(1);
    expect(result.state).toMatchObject({
      coins: 142,
      streak: 1,
      bestStreak: 1,
      lastDailyDate: TODAY,
      lastSeenAt: NOW,
      updatedAt: NOW,
    });
    expect(result.state.dailyHistory[TODAY]).toEqual({ stars: 3, moves: 21 });
  });

  it('consecutive day extends the streak and its bonus', () => {
    const result = complete(progress({ streak: 4, bestStreak: 4, lastDailyDate: '2026-11-23' }));
    expect(result.outcome).toBe('consecutive');
    expect(result.streak).toBe(5);
    expect(result.coins).toBe(50);
    expect(result.state.bestStreak).toBe(5);
  });

  it('a VIP who missed one day starts over (no freeze) but still gets double coins', () => {
    const result = complete(
      progress({
        streak: 4,
        bestStreak: 9,
        lastDailyDate: '2026-11-22',
        entitlements: { noAds: false, vip: true },
      }),
    );
    expect(result.outcome).toBe('reset');
    expect(result.streak).toBe(1);
    expect(result.coins).toBe((40 + 2) * 2);
    expect(result.state.bestStreak).toBe(9);
    expect(result.state).not.toHaveProperty('streakFreezeWeek');
  });

  it('a gap resets to 1', () => {
    const result = complete(progress({ streak: 7, bestStreak: 7, lastDailyDate: '2026-11-20' }));
    expect(result.outcome).toBe('reset');
    expect(result.streak).toBe(1);
    expect(result.state.bestStreak).toBe(7);
  });

  it('same-day replay grants nothing and keeps history', () => {
    const first = complete(progress());
    const again = applyDailyComplete(first.state, {
      date: TODAY,
      today: TODAY,
      now: NOW + 60_000,
      stars: 1,
      moves: 90,
    });
    expect(again.outcome).toBe('sameDay');
    expect(again.coins).toBe(0);
    expect(again.state).toBe(first.state);
    expect(again.streak).toBe(1);
  });

  it('credits a board finished after midnight to its own day', () => {
    const result = complete(
      progress({ lastDailyDate: '2026-11-22', streak: 2 }),
      TODAY,
      '2026-11-25',
    );
    expect(result.outcome).toBe('reset');
    expect(result.state.lastDailyDate).toBe(TODAY);
    expect(result.state.dailyHistory[TODAY]).toBeDefined();
  });

  it('stale boards, future dates and clock rollback grant nothing', () => {
    const state = progress();
    expect(complete(state, '2026-11-20')).toMatchObject({ outcome: 'stale', coins: 0, state });
    expect(complete(state, '2026-11-25')).toMatchObject({
      outcome: 'clockRollback',
      coins: 0,
      state,
    });
    const rolled = complete(progress({ lastSeenAt: NOW + 5000 }));
    expect(rolled.outcome).toBe('clockRollback');
    expect(rolled.coins).toBe(0);
    expect(complete(state, 'garbage').outcome).toBe('clockRollback');
  });

  it('never moves lastSeenAt backwards', () => {
    const state = progress({ lastSeenAt: NOW - 10 });
    expect(complete(state, TODAY, TODAY, NOW - 5).state.lastSeenAt).toBe(NOW - 5);
  });
});
