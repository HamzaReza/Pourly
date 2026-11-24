/**
 * Month-calendar arithmetic for the Daily screen. Pure and timezone-free: dates are local
 * `YYYY-MM-DD` strings and months are `{ year, month }` with `month` 1–12.
 */
import { daysBetween } from './date';

export interface YearMonth {
  readonly year: number;
  /** 1–12. */
  readonly month: number;
}

/** JavaScript weekday number: 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const MONDAY: Weekday = 1;

const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value));

/** The month of a `YYYY-MM-DD` date, or null when the date is malformed. */
export const monthOf = (localDate: string): YearMonth | null => {
  if (Number.isNaN(daysBetween(localDate, localDate))) return null;
  const [year, month] = localDate.split('-').map(Number) as [number, number];
  return { year, month };
};

export const addMonths = ({ year, month }: YearMonth, delta: number): YearMonth => {
  const index = year * 12 + (month - 1) + Math.trunc(delta);
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

/** Negative when `a` is before `b`, 0 for the same month. */
export const compareMonths = (a: YearMonth, b: YearMonth): number =>
  a.year * 12 + a.month - (b.year * 12 + b.month);

export const daysInMonth = ({ year, month }: YearMonth): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export const dateInMonth = ({ year, month }: YearMonth, day: number): string =>
  `${year}-${pad2(month)}-${pad2(day)}`;

/** Weekday of the first day of the month. */
const firstWeekday = ({ year, month }: YearMonth): Weekday =>
  new Date(Date.UTC(year, month - 1, 1)).getUTCDay() as Weekday;

/** The seven weekdays in display order, starting at `weekStart`. */
export const weekdayOrder = (weekStart: Weekday): readonly Weekday[] =>
  Array.from({ length: 7 }, (_, index) => ((weekStart + index) % 7) as Weekday);

/**
 * Weeks of the month as rows of seven cells, starting on `weekStart`; cells outside the month are
 * null. Always 4–6 rows.
 */
export const monthGrid = (month: YearMonth, weekStart: Weekday): (string | null)[][] => {
  const lead = (firstWeekday(month) - weekStart + 7) % 7;
  const days = daysInMonth(month);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, index) => dateInMonth(month, index + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return weeks;
};

/**
 * First day of the week from `expo-localization`'s `firstWeekday` (1 = Sunday … 7 = Saturday).
 * Unknown values fall back to Monday.
 */
export const weekStartFromLocale = (firstWeekdayOfLocale: number | null | undefined): Weekday => {
  if (
    firstWeekdayOfLocale === null ||
    firstWeekdayOfLocale === undefined ||
    !Number.isInteger(firstWeekdayOfLocale) ||
    firstWeekdayOfLocale < 1 ||
    firstWeekdayOfLocale > 7
  ) {
    return MONDAY;
  }
  return (firstWeekdayOfLocale - 1) as Weekday;
};

/** A UTC date that falls on `weekday` (for formatting weekday names). */
export const referenceDateFor = (weekday: Weekday): Date =>
  // 2023-01-01 was a Sunday.
  new Date(Date.UTC(2023, 0, 1 + weekday, 12));
