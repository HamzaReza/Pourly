/**
 * Local notification planner (spec §14). Pure: the caller passes the progress state, the clock and
 * (optionally) the time zone, and gets back the exact notifications to schedule.
 *
 * Kinds and slots (local wall-clock time):
 * - `streak_risk` 20:00 on a day whose daily is not done while the streak is ≥ 2 and still alive
 *   (`currentStreak`).
 * - `daily_ready` 10:30 on a day whose daily is not done.
 * - `gift_ready` 18:00 on a day whose gift is unclaimed.
 * - `comeback` series from `lastOpenAt`: +1, +3, +7 and +14 calendar days at the same local time,
 *   with escalating copy, then nothing more. A step already in the past is never planned.
 *
 * Days after today assume the daily is not done and the gift is unclaimed. `streak_risk` is planned
 * on every day of the 7-day horizon where the streak would still be alive. `daily_ready` and
 * `gift_ready` are planned for the first `ROUTINE_DAYS` local days only: after that the comeback
 * series speaks to an absent player (with this priority order, a routine reminder on every day
 * would make every comeback step lose its day). Comeback steps are planned past the 7-day horizon:
 * no app code runs while the player is away, so the +7 d and +14 d steps must be scheduled now.
 *
 * Caps: at most one notification per local day (streak_risk > daily_ready > gift_ready >
 * comeback; the others that day are dropped); never 22:00–08:00 local (a comeback step landing
 * there moves to 08:00 that morning, or the next morning when it falls after 22:00); never in the
 * past (at least `MIN_LEAD_MS` ahead). `dailyEnabled` covers daily_ready, gift_ready and the
 * comeback series; `streakEnabled` covers streak_risk. Nothing is planned without permission.
 *
 * Wall-clock times are built from local year/month/day/hour/minute through the `LocalZone`, so a
 * DST day still fires at 20:00 local. The default zone is the device's (JavaScript `Date` local
 * time); tests either run under a `TZ` environment variable or inject their own zone.
 */
import { currentStreak, isDailyDone } from '@/game/daily';
import { canClaimGift, giftCycleIndex } from '@/game/gifts';
import type { TranslationKey, TranslationParams } from '@/i18n/keys';
import type { ProgressState } from '@/state/progressModel';

export type NotificationKind = 'streak_risk' | 'daily_ready' | 'gift_ready' | 'comeback';

/** Deep links carried by a notification (`pourly://` is the app scheme). */
export type NotificationDeepLink = 'pourly://daily' | 'pourly://';

/** Screens a notification tap opens: Daily for daily/streak/gift reminders, Home for comebacks. */
export type NotificationRoute = '/daily' | '/';

/** The screen a notification's deep link opens; null for anything that is not one of ours. */
export const routeForDeepLink = (url: unknown): NotificationRoute | null => {
  if (url === 'pourly://daily') return '/daily';
  if (url === 'pourly://') return '/';
  return null;
};

export interface PlannedNotification {
  /** Stable per kind and day (or comeback step); used as the scheduled notification identifier. */
  readonly id: string;
  readonly kind: NotificationKind;
  readonly fireAt: Date;
  readonly titleKey: TranslationKey;
  readonly bodyKey: TranslationKey;
  /** Interpolation values (`{{n}}`). */
  readonly params: TranslationParams;
  readonly deepLink: NotificationDeepLink;
}

/** The progress fields the planner reads. */
export type PlannerState = Pick<
  ProgressState,
  | 'streak'
  | 'bestStreak'
  | 'lastDailyDate'
  | 'dailyHistory'
  | 'lastGiftDate'
  | 'giftDayIndex'
  | 'lastOpenAt'
  | 'level'
  | 'notifications'
  | 'entitlements'
>;

/** Local wall-clock fields; `month` is 1–12. */
export interface LocalDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/** A time zone: converts between instants (epoch ms) and local wall-clock fields. */
export interface LocalZone {
  readonly toLocal: (epochMs: number) => LocalDateTime;
  /** The instant of a local time. Fields may overflow (day 32 → next month), as with `Date`. */
  readonly fromLocal: (
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
  ) => number;
}

/** The device's time zone, through `Date`'s local-time fields (follows `TZ` under Node). */
export const deviceZone: LocalZone = {
  toLocal: (epochMs) => {
    const date = new Date(epochMs);
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    };
  },
  fromLocal: (year, month, day, hour, minute) =>
    new Date(year, month - 1, day, hour, minute).getTime(),
};

/** Local days planned for streak_risk: today and the six days after it. */
export const PLAN_DAYS = 7;
/** Local days planned for daily_ready and gift_ready (today only); see the module comment. */
export const ROUTINE_DAYS = 1;
/** Quiet hours: nothing fires from 22:00 to 08:00 local. */
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 8;
/** A notification must be at least this far in the future. */
export const MIN_LEAD_MS = 60_000;

interface Slot {
  readonly hour: number;
  readonly minute: number;
}

export const STREAK_RISK_AT: Slot = { hour: 20, minute: 0 };
export const DAILY_READY_AT: Slot = { hour: 10, minute: 30 };
export const GIFT_READY_AT: Slot = { hour: 18, minute: 0 };

interface ComebackStep {
  /** Calendar days after the last open, at the same local time. */
  readonly days: number;
  readonly titleKey: TranslationKey;
  readonly bodyKey: TranslationKey;
}

export const COMEBACK_STEPS: readonly ComebackStep[] = [
  { days: 1, titleKey: 'notifications.comeback1Title', bodyKey: 'notifications.comeback1Body' },
  { days: 3, titleKey: 'notifications.comeback2Title', bodyKey: 'notifications.comeback2Body' },
  { days: 7, titleKey: 'notifications.comeback3Title', bodyKey: 'notifications.comeback3Body' },
  { days: 14, titleKey: 'notifications.comeback4Title', bodyKey: 'notifications.comeback4Body' },
];

/** Lower wins when two notifications fall on the same local day. */
export const KIND_PRIORITY: Readonly<Record<NotificationKind, number>> = {
  streak_risk: 0,
  daily_ready: 1,
  gift_ready: 2,
  comeback: 3,
};

const pad2 = (value: number): string => (value < 10 ? `0${value}` : String(value));

const dateKey = ({ year, month, day }: LocalDateTime): string =>
  `${year}-${pad2(month)}-${pad2(day)}`;

/** The local date `offset` days after `base`, read at noon (no DST transition happens then). */
const dayAfter = (zone: LocalZone, base: LocalDateTime, offset: number): LocalDateTime =>
  zone.toLocal(zone.fromLocal(base.year, base.month, base.day + offset, 12, 0));

const at = (zone: LocalZone, day: LocalDateTime, slot: Slot): Date =>
  new Date(zone.fromLocal(day.year, day.month, day.day, slot.hour, slot.minute));

const isQuiet = (hour: number): boolean => hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;

/** Moves an instant in quiet hours to 08:00 the same morning, or the next one after 22:00. */
const outOfQuietHours = (zone: LocalZone, epochMs: number): number => {
  const local = zone.toLocal(epochMs);
  if (!isQuiet(local.hour)) return epochMs;
  const day = local.hour >= QUIET_START_HOUR ? local.day + 1 : local.day;
  return zone.fromLocal(local.year, local.month, day, QUIET_END_HOUR, 0);
};

const recurringFor = (
  state: PlannerState,
  zone: LocalZone,
  today: LocalDateTime,
  offset: number,
): PlannedNotification[] => {
  const day = dayAfter(zone, today, offset);
  const date = dateKey(day);
  const out: PlannedNotification[] = [];
  const { dailyEnabled, streakEnabled } = state.notifications;
  const dailyDone = isDailyDone(state, date);
  if (streakEnabled && !dailyDone) {
    const streak = currentStreak(state, date);
    if (streak >= 2) {
      out.push({
        id: `streak_risk-${date}`,
        kind: 'streak_risk',
        fireAt: at(zone, day, STREAK_RISK_AT),
        titleKey: 'notifications.streakRiskTitle',
        bodyKey: 'notifications.streakRiskBody',
        params: { n: streak },
        deepLink: 'pourly://daily',
      });
    }
  }
  if (dailyEnabled && offset < ROUTINE_DAYS) {
    if (!dailyDone) {
      out.push({
        id: `daily_ready-${date}`,
        kind: 'daily_ready',
        fireAt: at(zone, day, DAILY_READY_AT),
        titleKey: 'notifications.dailyReadyTitle',
        bodyKey: 'notifications.dailyReadyBody',
        params: {},
        deepLink: 'pourly://daily',
      });
    }
    if (canClaimGift(state, date)) {
      out.push({
        id: `gift_ready-${date}`,
        kind: 'gift_ready',
        fireAt: at(zone, day, GIFT_READY_AT),
        titleKey: 'notifications.giftReadyTitle',
        bodyKey: 'notifications.giftReadyBody',
        params: { n: giftCycleIndex(state.giftDayIndex) + 1 },
        deepLink: 'pourly://daily',
      });
    }
  }
  return out;
};

const comebackSeries = (state: PlannerState, zone: LocalZone): PlannedNotification[] => {
  if (!state.notifications.dailyEnabled || !Number.isFinite(state.lastOpenAt)) return [];
  const open = zone.toLocal(state.lastOpenAt);
  return COMEBACK_STEPS.map((step) => {
    const target = zone.fromLocal(
      open.year,
      open.month,
      open.day + step.days,
      open.hour,
      open.minute,
    );
    return {
      id: `comeback-${step.days}d`,
      kind: 'comeback',
      fireAt: new Date(outOfQuietHours(zone, target)),
      titleKey: step.titleKey,
      bodyKey: step.bodyKey,
      params: { n: state.level },
      deepLink: 'pourly://',
    };
  });
};

const byPriorityThenTime = (a: PlannedNotification, b: PlannedNotification): number =>
  KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.fireAt.getTime() - b.fireAt.getTime();

/**
 * The notifications to schedule from `now`: at most one per local day, outside quiet hours,
 * never in the past, sorted by fire time. Empty without notification permission.
 */
export const planNotifications = (
  state: PlannerState,
  now: number,
  zone: LocalZone = deviceZone,
): PlannedNotification[] => {
  if (!state.notifications.granted) return [];
  const today = zone.toLocal(now);
  const candidates: PlannedNotification[] = [];
  for (let offset = 0; offset < PLAN_DAYS; offset += 1) {
    candidates.push(...recurringFor(state, zone, today, offset));
  }
  candidates.push(...comebackSeries(state, zone));

  const perDay = new Map<string, PlannedNotification>();
  for (const candidate of candidates) {
    const time = candidate.fireAt.getTime();
    if (!Number.isFinite(time) || time < now + MIN_LEAD_MS) continue;
    const local = zone.toLocal(time);
    if (isQuiet(local.hour)) continue;
    const key = dateKey(local);
    const kept = perDay.get(key);
    if (kept === undefined || byPriorityThenTime(candidate, kept) < 0) perDay.set(key, candidate);
  }
  return [...perDay.values()].sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
};
