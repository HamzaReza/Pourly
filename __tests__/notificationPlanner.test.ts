import {
  deviceZone,
  KIND_PRIORITY,
  planNotifications,
  QUIET_END_HOUR,
  QUIET_START_HOUR,
  routeForDeepLink,
  type LocalZone,
  type PlannedNotification,
  type PlannerState,
} from '@/services/notificationPlanner';
import { createDefaultProgress } from '@/state/progressModel';

import { fixedZone, ianaZone } from '../test-utils/zones';

const UTC = fixedZone(0);
const NEW_YORK = ianaZone('America/New_York');
const HOUR = 3_600_000;

/** Instant of a wall-clock time in `zone`. */
const at = (zone: LocalZone, y: number, m: number, d: number, h: number, min = 0): number =>
  zone.fromLocal(y, m, d, h, min);

const stamp = (zone: LocalZone, date: Date): string => {
  const l = zone.toLocal(date.getTime());
  const p = (n: number) => String(n).padStart(2, '0');
  return `${l.year}-${p(l.month)}-${p(l.day)} ${p(l.hour)}:${p(l.minute)}`;
};

const summary = (plan: PlannedNotification[], zone: LocalZone = UTC): string[] =>
  plan.map((item) => `${stamp(zone, item.fireAt)} ${item.id}`);

const state = (now: number, overrides: Partial<PlannerState> = {}): PlannerState => {
  const base = createDefaultProgress(now);
  return {
    ...base,
    lastOpenAt: now,
    notifications: { ...base.notifications, granted: true },
    ...overrides,
  };
};

const toggles = (dailyEnabled: boolean, streakEnabled: boolean): PlannerState['notifications'] => ({
  asked: true,
  askedCount: 1,
  granted: true,
  dailyEnabled,
  streakEnabled,
});

// Wednesday 2026-11-25 in the test zone.
const WED_0915 = at(UTC, 2026, 11, 25, 9, 15);
const WED_1400 = at(UTC, 2026, 11, 25, 14);

describe('planNotifications', () => {
  it('plans nothing without permission', () => {
    const s = state(WED_0915);
    expect(
      planNotifications(
        { ...s, notifications: { ...s.notifications, granted: false } },
        WED_0915,
        UTC,
      ),
    ).toEqual([]);
  });

  it('fresh install: daily_ready today, then the four comeback steps at the open time', () => {
    const plan = planNotifications(state(WED_0915), WED_0915, UTC);
    expect(summary(plan)).toEqual([
      '2026-11-25 10:30 daily_ready-2026-11-25',
      '2026-11-26 09:15 comeback-1d',
      '2026-11-28 09:15 comeback-3d',
      '2026-12-02 09:15 comeback-7d',
      '2026-12-09 09:15 comeback-14d',
    ]);
    expect(plan.map((item) => item.titleKey)).toEqual([
      'notifications.dailyReadyTitle',
      'notifications.comeback1Title',
      'notifications.comeback2Title',
      'notifications.comeback3Title',
      'notifications.comeback4Title',
    ]);
    expect(plan.map((item) => item.deepLink)).toEqual([
      'pourly://daily',
      'pourly://',
      'pourly://',
      'pourly://',
      'pourly://',
    ]);
    expect(plan[1]?.params).toEqual({ n: 1 });
  });

  it('keeps at most one notification per local day, by priority', () => {
    const plan = planNotifications(
      state(WED_1400, { streak: 5, lastDailyDate: '2026-11-24', level: 30 }),
      WED_1400,
      UTC,
    );
    // Today: streak_risk (20:00) beats gift_ready (18:00).
    expect(summary(plan)).toEqual([
      '2026-11-25 20:00 streak_risk-2026-11-25',
      '2026-11-26 14:00 comeback-1d',
      '2026-11-28 14:00 comeback-3d',
      '2026-12-02 14:00 comeback-7d',
      '2026-12-09 14:00 comeback-14d',
    ]);
    expect(plan[0]?.params).toEqual({ n: 5 });
    const days = plan.map((item) => stamp(UTC, item.fireAt).slice(0, 10));
    expect(new Set(days).size).toBe(days.length);
  });

  it('streak_risk tomorrow wins over the +1 day comeback; gift_ready fills today', () => {
    const now = at(UTC, 2026, 11, 25, 13);
    const plan = planNotifications(
      state(now, { streak: 3, lastDailyDate: '2026-11-25', giftDayIndex: 4 }),
      now,
      UTC,
    );
    expect(summary(plan).slice(0, 3)).toEqual([
      '2026-11-25 18:00 gift_ready-2026-11-25',
      '2026-11-26 20:00 streak_risk-2026-11-26',
      '2026-11-28 13:00 comeback-3d',
    ]);
    expect(plan[0]?.params).toEqual({ n: 5 });
    expect(plan.some((item) => item.id === 'comeback-1d')).toBe(false);
  });

  it('orders priorities streak_risk > daily_ready > gift_ready > comeback', () => {
    expect(
      Object.entries(KIND_PRIORITY)
        .sort((a, b) => a[1] - b[1])
        .map(([kind]) => kind),
    ).toEqual(['streak_risk', 'daily_ready', 'gift_ready', 'comeback']);
  });

  it('plans daily_ready and gift_ready for today only (routine days)', () => {
    const now = at(UTC, 2026, 11, 25, 8);
    const plan = planNotifications(state(now), now, UTC);
    expect(plan.filter((item) => item.kind === 'daily_ready').map((item) => item.id)).toEqual([
      'daily_ready-2026-11-25',
    ]);
    expect(plan.some((item) => item.kind === 'gift_ready')).toBe(false);
  });

  it('streak_risk only while the streak is alive', () => {
    const now = WED_1400;
    const dead = planNotifications(
      state(now, { streak: 5, lastDailyDate: '2026-11-23' }),
      now,
      UTC,
    );
    expect(dead.some((item) => item.kind === 'streak_risk')).toBe(false);

    const short = planNotifications(
      state(now, { streak: 1, lastDailyDate: '2026-11-24' }),
      now,
      UTC,
    );
    expect(short.some((item) => item.kind === 'streak_risk')).toBe(false);

    const doneToday = planNotifications(
      state(now, { streak: 5, lastDailyDate: '2026-11-25' }),
      now,
      UTC,
    );
    expect(doneToday.filter((item) => item.kind === 'streak_risk').map((item) => item.id)).toEqual([
      'streak_risk-2026-11-26',
    ]);
  });

  it('a VIP with an unused freeze keeps streak_risk one more day', () => {
    const plan = planNotifications(
      state(WED_1400, {
        streak: 5,
        lastDailyDate: '2026-11-24',
        entitlements: { vip: true, noAds: false },
      }),
      WED_1400,
      UTC,
    );
    expect(plan.filter((item) => item.kind === 'streak_risk').map((item) => item.id)).toEqual([
      'streak_risk-2026-11-25',
      'streak_risk-2026-11-26',
    ]);
  });

  it('moves a comeback step out of quiet hours to 08:00', () => {
    const late = at(UTC, 2026, 11, 25, 23, 30);
    expect(summary(planNotifications(state(late), late, UTC)).slice(0, 2)).toEqual([
      '2026-11-27 08:00 comeback-1d',
      '2026-11-29 08:00 comeback-3d',
    ]);
    const early = at(UTC, 2026, 11, 25, 2);
    expect(summary(planNotifications(state(early), early, UTC)).slice(0, 2)).toEqual([
      '2026-11-25 10:30 daily_ready-2026-11-25',
      '2026-11-26 08:00 comeback-1d',
    ]);
  });

  it('never plans anything in quiet hours', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const now = at(UTC, 2026, 11, 25, hour, 40);
      for (const item of planNotifications(
        state(now, { streak: 4, lastDailyDate: '2026-11-24' }),
        now,
        UTC,
      )) {
        const local = UTC.toLocal(item.fireAt.getTime());
        expect(local.hour >= QUIET_END_HOUR && local.hour < QUIET_START_HOUR).toBe(true);
      }
    }
  });

  it('never repeats a comeback step that is already past', () => {
    const now = at(UTC, 2026, 11, 25, 16);
    const plan = planNotifications(
      state(now, {
        lastOpenAt: at(UTC, 2026, 11, 22, 23, 30),
        level: 42,
        lastGiftDate: '2026-11-22',
        lastDailyDate: '2026-11-22',
        streak: 4,
      }),
      now,
      UTC,
    );
    expect(summary(plan)).toEqual([
      '2026-11-25 18:00 gift_ready-2026-11-25',
      '2026-11-26 08:00 comeback-3d',
      '2026-11-30 08:00 comeback-7d',
      '2026-12-07 08:00 comeback-14d',
    ]);
    expect(plan[1]?.params).toEqual({ n: 42 });
  });

  it('drops anything less than a minute ahead', () => {
    const now = at(UTC, 2026, 11, 25, 20) - 30_000;
    const plan = planNotifications(
      state(now, { streak: 4, lastDailyDate: '2026-11-24' }),
      now,
      UTC,
    );
    expect(plan.some((item) => item.id === 'streak_risk-2026-11-25')).toBe(false);
    expect(plan.every((item) => item.fireAt.getTime() >= now + 60_000)).toBe(true);
  });

  it('respects the toggles', () => {
    const base = { streak: 5, lastDailyDate: '2026-11-24' };
    const kinds = (dailyEnabled: boolean, streakEnabled: boolean) =>
      planNotifications(
        state(WED_0915, { ...base, notifications: toggles(dailyEnabled, streakEnabled) }),
        WED_0915,
        UTC,
      ).map((item) => item.kind);
    expect(kinds(false, false)).toEqual([]);
    expect(kinds(false, true)).toEqual(['streak_risk']);
    expect(kinds(true, false)).not.toContain('streak_risk');
    expect(kinds(true, false)).toContain('daily_ready');
    expect(kinds(true, false)).toContain('comeback');
  });

  it('returns the plan sorted by fire time', () => {
    const plan = planNotifications(
      state(WED_0915, { streak: 3, lastDailyDate: '2026-11-24' }),
      WED_0915,
      UTC,
    );
    const times = plan.map((item) => item.fireAt.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  describe('DST (America/New_York)', () => {
    it('spring forward: streak_risk at 20:00 EDT and comebacks keep their wall-clock time', () => {
      const now = at(NEW_YORK, 2026, 3, 7, 21, 30);
      const plan = planNotifications(
        state(now, { streak: 6, lastDailyDate: '2026-03-07', lastGiftDate: '2026-03-07' }),
        now,
        NEW_YORK,
      );
      expect(summary(plan, NEW_YORK)).toEqual([
        '2026-03-08 20:00 streak_risk-2026-03-08',
        '2026-03-10 21:30 comeback-3d',
        '2026-03-14 21:30 comeback-7d',
        '2026-03-21 21:30 comeback-14d',
      ]);
      // 20:00 EDT is 00:00 UTC, one hour earlier than 20:00 EST would be.
      expect(plan[0]?.fireAt.toISOString()).toBe('2026-03-09T00:00:00.000Z');
      // 3 calendar days are not 72 hours across the change.
      expect((plan[1]?.fireAt.getTime() ?? 0) - now).toBe(72 * HOUR - HOUR);
    });

    it('fall back: streak_risk at 20:00 EST; a late comeback moves to 08:00', () => {
      const now = at(NEW_YORK, 2026, 10, 31, 23, 10);
      const plan = planNotifications(
        state(now, { streak: 6, lastDailyDate: '2026-10-31', lastGiftDate: '2026-10-31' }),
        now,
        NEW_YORK,
      );
      expect(summary(plan, NEW_YORK)).toEqual([
        '2026-11-01 20:00 streak_risk-2026-11-01',
        '2026-11-02 08:00 comeback-1d',
        '2026-11-04 08:00 comeback-3d',
        '2026-11-08 08:00 comeback-7d',
        '2026-11-15 08:00 comeback-14d',
      ]);
      expect(plan[0]?.fireAt.toISOString()).toBe('2026-11-02T01:00:00.000Z');
    });

    it('on the spring-forward day itself, plans 20:00 local', () => {
      const now = at(NEW_YORK, 2026, 3, 8, 7);
      const plan = planNotifications(
        state(now, { streak: 2, lastDailyDate: '2026-03-07' }),
        now,
        NEW_YORK,
      );
      expect(summary(plan, NEW_YORK)[0]).toBe('2026-03-08 20:00 streak_risk-2026-03-08');
    });
  });

  it('the device zone builds local wall-clock times', () => {
    const now = new Date(2026, 10, 25, 9, 0).getTime();
    const plan = planNotifications(state(now, { streak: 4, lastDailyDate: '2026-11-24' }), now);
    const risk = plan.find((item) => item.kind === 'streak_risk');
    expect(risk?.fireAt.getHours()).toBe(20);
    expect(risk?.fireAt.getMinutes()).toBe(0);
    expect(deviceZone.toLocal(now)).toMatchObject({ year: 2026, month: 11, day: 25, hour: 9 });
  });
});

describe('routeForDeepLink', () => {
  it('maps our deep links and rejects anything else', () => {
    expect(routeForDeepLink('pourly://daily')).toBe('/daily');
    expect(routeForDeepLink('pourly://')).toBe('/');
    expect(routeForDeepLink('https://example.com')).toBeNull();
    expect(routeForDeepLink(undefined)).toBeNull();
  });
});
