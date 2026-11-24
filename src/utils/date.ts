const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value));

/** Local calendar date of `date` as `YYYY-MM-DD`. */
export const localDateString = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses `YYYY-MM-DD` into a UTC day number. Returns null for malformed or impossible dates. */
const toUtcDayNumber = (value: string): number | null => {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.round(ms / 86_400_000);
};

/**
 * Whole calendar days from `from` to `to` (both `YYYY-MM-DD`). Positive when `to` is later.
 * Uses calendar arithmetic, so DST shifts never produce fractional days. Returns NaN on bad input.
 */
export const daysBetween = (from: string, to: string): number => {
  const a = toUtcDayNumber(from);
  const b = toUtcDayNumber(to);
  if (a === null || b === null) return Number.NaN;
  return b - a;
};

/** ISO-8601 week key of the local date of `date`, e.g. `2026-W48`. */
export const isoWeekKey = (date: Date): string => {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const isoDay = utc.getUTCDay() === 0 ? 7 : utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() + 4 - isoDay);
  const isoYear = utc.getUTCFullYear();
  const yearStart = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((utc.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${pad2(week)}`;
};

/** Local midnight of a `YYYY-MM-DD` date, or null for malformed or impossible dates. */
export const parseLocalDate = (value: string): Date | null => {
  if (Number.isNaN(daysBetween(value, value))) return null;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
};
