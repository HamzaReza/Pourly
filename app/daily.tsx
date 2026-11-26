import Ionicons from '@expo/vector-icons/Ionicons';
import { getCalendars } from 'expo-localization';
import { router, useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { currentStreak, isDailyDone } from '@/game/daily';
import { CHEST_INDEX, giftCycleIndex } from '@/game/gifts';
import { formatDate, formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import { prepareDaily } from '@/state/dailyLoader';
import { localToday } from '@/state/gameFlow';
import { useProgressStore } from '@/state/progressStore';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { Screen } from '@/ui/Screen';
import { surfaceColors, useThemeUi } from '@/ui/theme';
import {
  alphas,
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
  typography,
  withAlpha,
} from '@/ui/tokens';
import {
  addMonths,
  compareMonths,
  MONDAY,
  monthGrid,
  monthOf,
  referenceDateFor,
  weekdayOrder,
  weekStartFromLocale,
  type Weekday,
  type YearMonth,
} from '@/utils/calendar';
import { parseLocalDate } from '@/utils/date';
import { Text } from '@/ui/Text';

const GIFT_DAYS = CHEST_INDEX + 1;

const openDaily = (): void => {
  router.push({ pathname: '/game', params: { mode: 'daily' } });
};

/** First day of the week from the device calendar settings, Monday when unknown. */
const deviceWeekStart = (): Weekday => {
  try {
    return weekStartFromLocale(getCalendars()[0]?.firstWeekday);
  } catch {
    return MONDAY;
  }
};

/** Diameter of a calendar day. */
const DAY_SIZE = 36;

interface MonthCalendarProps {
  ui: ThemeUi;
  month: YearMonth;
  today: string;
  weekStart: Weekday;
}

/** One month grid; rows lay out start → end, so the grid mirrors in RTL. */
const MonthCalendarComponent = ({ ui, month, today, weekStart }: MonthCalendarProps) => {
  const { t } = useTranslation();
  const history = useProgressStore((state) => state.dailyHistory);
  const weeks = useMemo(() => monthGrid(month, weekStart), [month, weekStart]);
  const weekdays = weekdayOrder(weekStart);

  return (
    <View style={styles.calendar}>
      <View style={styles.week} importantForAccessibility="no-hide-descendants">
        {weekdays.map((weekday) => (
          <Text key={weekday} style={[styles.weekday, { color: ui.textMuted }]}>
            {formatDate(referenceDateFor(weekday), { weekday: 'narrow', timeZone: 'UTC' })}
          </Text>
        ))}
      </View>
      {weeks.map((week, row) => (
        <View key={row} style={styles.week}>
          {week.map((date, column) => {
            if (date === null) return <View key={column} style={styles.cell} />;
            const day = parseLocalDate(date);
            const done = history[date] !== undefined;
            const isToday = date === today;
            const label = day === null ? date : formatDate(day, { month: 'long', day: 'numeric' });
            const a11yKey = isToday
              ? done
                ? 'daily.todayDoneA11y'
                : 'daily.todayA11y'
              : done
                ? 'daily.dayDoneA11y'
                : 'daily.dayA11y';
            return (
              <View
                key={column}
                accessible
                accessibilityLabel={t(a11yKey, { date: label })}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.day,
                    done && { backgroundColor: ui.accent },
                    isToday && { borderColor: ui.accent, borderWidth: 1.5 },
                  ]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      { color: done ? ui.onAccent : ui.text },
                      (done || isToday) && styles.dayTextStrong,
                    ]}
                  >
                    {formatNumber(day?.getDate() ?? 0)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const MonthCalendar = memo(MonthCalendarComponent);

interface StatProps {
  ui: ThemeUi;
  label: string;
  value: number;
  icon: 'flame' | 'trophy';
}

const Stat = ({ ui, label, value, icon }: StatProps) => {
  const { t } = useTranslation();
  const text = t('daily.days', { count: value, value: formatNumber(value) });
  const tint = icon === 'flame' ? colors.flame : colors.coin;
  return (
    <View
      accessible
      accessibilityLabel={t('daily.streakA11y', {
        label,
        count: value,
        value: formatNumber(value),
      })}
      style={[
        styles.stat,
        { backgroundColor: ui.surface, borderColor: surfaceColors(ui).hairline },
      ]}
    >
      <View style={[styles.statIcon, { backgroundColor: withAlpha(tint, alphas.tint) }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.statTexts}>
        <Text style={[styles.statValue, { color: ui.text }]} numberOfLines={1}>
          {text}
        </Text>
        <Text style={[styles.statLabel, { color: ui.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </View>
  );
};

export default function DailyScreen() {
  const { t } = useTranslation();
  const ui = useThemeUi();
  const [today, setToday] = useState(() => localToday());
  const [weekStart] = useState(deviceWeekStart);
  const installDate = useProgressStore((state) => state.installDate);
  const streak = useProgressStore((state) => currentStreak(state, today, state.entitlements.vip));
  const bestStreak = useProgressStore((state) => state.bestStreak);
  const done = useProgressStore((state) => isDailyDone(state, today));
  const giftDay = useProgressStore((state) => giftCycleIndex(state.giftDayIndex));

  const currentMonth = useMemo<YearMonth>(() => {
    const now = new Date();
    return monthOf(today) ?? { year: now.getFullYear(), month: now.getMonth() + 1 };
  }, [today]);
  const firstMonth = useMemo<YearMonth>(() => {
    const install = monthOf(installDate);
    return install === null || compareMonths(install, currentMonth) > 0 ? currentMonth : install;
  }, [installDate, currentMonth]);
  /** Months back from the current one (0 = this month). */
  const [monthsBack, setMonthsBack] = useState(0);
  const shown = useMemo(() => addMonths(currentMonth, -monthsBack), [currentMonth, monthsBack]);

  useFocusEffect(
    useCallback(() => {
      setToday(localToday());
    }, []),
  );

  useEffect(() => {
    if (!done) void prepareDaily(today);
  }, [done, today]);

  const canPrev = compareMonths(shown, firstMonth) > 0;
  const canNext = compareMonths(shown, currentMonth) < 0;
  const monthTitle = formatDate(new Date(shown.year, shown.month - 1, 1), {
    month: 'long',
    year: 'numeric',
  });
  const backIcon = I18nManager.isRTL ? 'chevron-forward' : 'chevron-back';
  const forwardIcon = I18nManager.isRTL ? 'chevron-back' : 'chevron-forward';

  return (
    <Screen title={t('daily.title')} scroll>
      <View style={styles.stats}>
        <Stat ui={ui} label={t('daily.currentStreak')} value={streak} icon="flame" />
        <Stat ui={ui} label={t('daily.bestStreak')} value={bestStreak} icon="trophy" />
      </View>
      <View
        style={[
          styles.card,
          { backgroundColor: ui.surface, borderColor: surfaceColors(ui).hairline },
        ]}
      >
        <View style={styles.monthRow}>
          {canPrev ? (
            <IconButton
              icon={backIcon}
              accessibilityLabel={t('daily.prevMonth')}
              onPress={() => setMonthsBack((back) => back + 1)}
              color={ui.text}
            />
          ) : (
            <View style={styles.navSpacer} />
          )}
          <Text accessibilityRole="header" style={[styles.monthTitle, { color: ui.text }]}>
            {monthTitle}
          </Text>
          {canNext ? (
            <IconButton
              icon={forwardIcon}
              accessibilityLabel={t('daily.nextMonth')}
              onPress={() => setMonthsBack((back) => Math.max(0, back - 1))}
              color={ui.text}
            />
          ) : (
            <View style={styles.navSpacer} />
          )}
        </View>
        <MonthCalendar ui={ui} month={shown} today={today} weekStart={weekStart} />
      </View>
      {done ? (
        <View style={styles.doneBox}>
          <Text style={[styles.doneTitle, { color: ui.text }]}>{t('daily.done')}</Text>
          <Text style={[styles.doneMessage, { color: ui.textMuted }]}>
            {t('daily.doneMessage')}
          </Text>
          <Button
            size="md"
            label={t('daily.playAgain')}
            accessibilityLabel={t('daily.playAgainA11y')}
            onPress={openDaily}
            ui={ui}
          />
        </View>
      ) : (
        <Button variant="primary" label={t('daily.play')} onPress={openDaily} ui={ui} icon="play" />
      )}
      <View
        accessible
        accessibilityLabel={t('daily.chestA11y', { day: formatNumber(giftDay) })}
        style={[
          styles.card,
          { backgroundColor: ui.surface, borderColor: surfaceColors(ui).hairline },
        ]}
      >
        <Text style={[styles.chestTitle, { color: ui.text }]}>{t('daily.chestTitle')}</Text>
        <View style={styles.chestRow}>
          {Array.from({ length: GIFT_DAYS }, (_, index) => {
            const reached = index < giftDay;
            const next = index === giftDay;
            const chest = index === CHEST_INDEX;
            return (
              <View
                key={index}
                style={[
                  styles.step,
                  { borderColor: next ? ui.accent : surfaceColors(ui).hairline },
                  chest && !reached && { backgroundColor: withAlpha(colors.coin, alphas.subtle) },
                  reached && { backgroundColor: ui.accent, borderColor: ui.accent },
                ]}
              >
                <Ionicons
                  name={chest ? 'cube' : reached ? 'checkmark' : 'gift-outline'}
                  size={chest ? 18 : 15}
                  color={reached ? ui.onAccent : chest ? colors.coin : ui.textMuted}
                />
              </View>
            );
          })}
        </View>
        <Text style={[styles.chestProgress, { color: ui.textMuted }]}>
          {t('daily.chestProgress', { day: formatNumber(giftDay) })}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTexts: {
    flex: 1,
  },
  statValue: {
    fontSize: fontSizes.body + 1,
    fontWeight: fontWeights.heavy,
  },
  statLabel: {
    ...typography.fine,
  },
  card: {
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navSpacer: {
    width: 44,
  },
  monthTitle: {
    flex: 1,
    textAlign: 'center',
    ...typography.rowTitleStrong,
  },
  calendar: {
    gap: spacing.xs,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    ...typography.sectionLabel,
    letterSpacing: 0,
  },
  cell: {
    flex: 1,
    height: DAY_SIZE + spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: DAY_SIZE,
    height: DAY_SIZE,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.medium,
    fontVariant: ['tabular-nums'],
  },
  dayTextStrong: {
    fontWeight: fontWeights.bold,
  },
  doneBox: {
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  doneTitle: {
    ...typography.cardTitle,
    textAlign: 'center',
  },
  doneMessage: {
    ...typography.dialogBody,
  },
  chestTitle: {
    ...typography.rowTitleStrong,
  },
  chestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  step: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chestProgress: {
    ...typography.rowHint,
  },
});
