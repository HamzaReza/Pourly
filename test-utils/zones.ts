/**
 * `LocalZone`s for planner tests that must not depend on the machine's `TZ`: a fixed UTC offset,
 * and a named IANA zone (with real DST rules) through `Intl.DateTimeFormat`.
 */
import type { LocalDateTime, LocalZone } from '@/services/notificationPlanner';

const MINUTE = 60_000;

/** A zone with a constant offset from UTC, in minutes (e.g. 330 for India). */
export const fixedZone = (offsetMinutes: number): LocalZone => ({
  toLocal: (epochMs) => {
    const shifted = new Date(epochMs + offsetMinutes * MINUTE);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
    };
  },
  fromLocal: (year, month, day, hour, minute) =>
    Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * MINUTE,
});

/** An IANA zone such as `America/New_York`, DST included. */
export const ianaZone = (timeZone: string): LocalZone => {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  const toLocal = (epochMs: number): LocalDateTime => {
    const parts = Object.fromEntries(
      format.formatToParts(new Date(epochMs)).map((part) => [part.type, Number(part.value)]),
    );
    return {
      year: parts.year ?? 0,
      month: parts.month ?? 0,
      day: parts.day ?? 0,
      hour: parts.hour ?? 0,
      minute: parts.minute ?? 0,
    };
  };
  return {
    toLocal,
    fromLocal: (year, month, day, hour, minute) => {
      const wanted = Date.UTC(year, month - 1, day, hour, minute);
      let guess = wanted;
      for (let i = 0; i < 3; i += 1) {
        const local = toLocal(guess);
        guess +=
          wanted - Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
      }
      return guess;
    },
  };
};
