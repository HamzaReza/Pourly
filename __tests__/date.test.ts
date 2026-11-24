import { daysBetween, isoWeekKey, localDateString } from '@/utils/date';

describe('localDateString', () => {
  it('uses the local calendar date with zero padding', () => {
    expect(localDateString(new Date(2026, 0, 5, 0, 0, 0))).toBe('2026-01-05');
    expect(localDateString(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });
});

describe('daysBetween', () => {
  it('counts whole calendar days in both directions', () => {
    expect(daysBetween('2026-11-24', '2026-11-25')).toBe(1);
    expect(daysBetween('2026-11-25', '2026-11-24')).toBe(-1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('is unaffected by daylight-saving transitions', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('returns NaN for malformed or impossible dates', () => {
    expect(daysBetween('2026-02-30', '2026-03-01')).toBeNaN();
    expect(daysBetween('today', '2026-03-01')).toBeNaN();
  });
});

describe('isoWeekKey', () => {
  it('handles ISO year boundaries', () => {
    expect(isoWeekKey(new Date(2026, 10, 24))).toBe('2026-W48');
    expect(isoWeekKey(new Date(2027, 0, 1))).toBe('2026-W53');
    expect(isoWeekKey(new Date(2024, 11, 30))).toBe('2025-W01');
  });
});
