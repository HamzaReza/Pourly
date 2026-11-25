import { dailyDateOf, isDailyDone } from '@/game/daily';
import {
  addMonths,
  compareMonths,
  daysInMonth,
  MONDAY,
  monthGrid,
  monthOf,
  referenceDateFor,
  weekdayOrder,
  weekStartFromLocale,
} from '@/utils/calendar';
import { parseLocalDate } from '@/utils/date';

describe('calendar maths', () => {
  it('monthOf, addMonths across years, compareMonths, daysInMonth', () => {
    expect(monthOf('2026-11-24')).toEqual({ year: 2026, month: 11 });
    expect(monthOf('2026-02-30')).toBeNull();
    expect(addMonths({ year: 2026, month: 11 }, 2)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 5 }, -17)).toEqual({ year: 2024, month: 12 });
    expect(compareMonths({ year: 2026, month: 1 }, { year: 2025, month: 12 })).toBeGreaterThan(0);
    expect(compareMonths({ year: 2026, month: 3 }, { year: 2026, month: 3 })).toBe(0);
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31);
  });

  it('February 2026 starting on a Sunday fits four Sunday-first rows, five Monday-first', () => {
    const sunday = monthGrid({ year: 2026, month: 2 }, 0);
    expect(sunday).toHaveLength(4);
    expect(sunday[0]?.[0]).toBe('2026-02-01');
    expect(sunday[3]?.[6]).toBe('2026-02-28');
    const monday = monthGrid({ year: 2026, month: 2 }, MONDAY);
    expect(monday).toHaveLength(5);
    expect(monday[0]?.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(monday[0]?.[6]).toBe('2026-02-01');
  });

  it('every grid has whole weeks, every day once, padding as null', () => {
    for (const weekStart of [0, 1, 6] as const) {
      for (let month = 1; month <= 12; month += 1) {
        const grid = monthGrid({ year: 2028, month }, weekStart);
        expect(grid.length).toBeGreaterThanOrEqual(4);
        expect(grid.length).toBeLessThanOrEqual(6);
        for (const week of grid) expect(week).toHaveLength(7);
        const days = grid.flat().filter((cell) => cell !== null);
        expect(days).toHaveLength(daysInMonth({ year: 2028, month }));
        const first = days[0];
        const date = first === undefined ? null : parseLocalDate(first);
        const column = grid[0]?.indexOf(first ?? '') ?? -1;
        expect(weekdayOrder(weekStart)[column]).toBe(date?.getDay());
      }
    }
  });

  it('week start comes from the locale; unknown values give Monday', () => {
    expect(weekStartFromLocale(1)).toBe(0);
    expect(weekStartFromLocale(2)).toBe(1);
    expect(weekStartFromLocale(7)).toBe(6);
    expect(weekStartFromLocale(null)).toBe(MONDAY);
    expect(weekStartFromLocale(undefined)).toBe(MONDAY);
    expect(weekStartFromLocale(0)).toBe(MONDAY);
    expect(weekStartFromLocale(8)).toBe(MONDAY);
    expect(weekStartFromLocale(1.5)).toBe(MONDAY);
    expect(weekdayOrder(6)).toEqual([6, 0, 1, 2, 3, 4, 5]);
    for (let day = 0; day < 7; day += 1) {
      expect(referenceDateFor(day as 0).getUTCDay()).toBe(day);
    }
  });

  it('parses local dates and daily ids', () => {
    const date = parseLocalDate('2026-11-24');
    expect([date?.getFullYear(), date?.getMonth(), date?.getDate(), date?.getHours()]).toEqual([
      2026, 10, 24, 0,
    ]);
    expect(parseLocalDate('2026-13-01')).toBeNull();
    expect(dailyDateOf('daily-2026-11-24')).toBe('2026-11-24');
    expect(dailyDateOf('daily-2026-02-31')).toBeNull();
    expect(dailyDateOf('level-4')).toBeNull();
    expect(isDailyDone({ lastDailyDate: '2026-11-24', dailyHistory: {} }, '2026-11-24')).toBe(true);
    expect(
      isDailyDone(
        { lastDailyDate: null, dailyHistory: { '2026-11-24': { stars: 1, moves: 9 } } },
        '2026-11-24',
      ),
    ).toBe(true);
    expect(isDailyDone({ lastDailyDate: '2026-11-23', dailyHistory: {} }, '2026-11-24')).toBe(
      false,
    );
  });
});
