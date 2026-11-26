import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { currentStreak, isDailyDone } from '@/game/daily';
import { formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import { useProgressStore } from '@/state/progressStore';
import { Button } from '@/ui/Button';
import { surfaceColors } from '@/ui/theme';
import {
  alphas,
  colors,
  controlHeights,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  typography,
  withAlpha,
} from '@/ui/tokens';
import { Text } from '@/ui/Text';

export interface DailyCardProps {
  ui: ThemeUi;
  /** Player's local date. */
  today: string;
  onPlay: () => void;
  onOpen: () => void;
}

/** Daily Challenge card: flame and current streak (opens the calendar), and Play or Done ✓. */
const DailyCardComponent = ({ ui, today, onPlay, onOpen }: DailyCardProps) => {
  const { t } = useTranslation();
  const streak = useProgressStore((state) => currentStreak(state, today, state.entitlements.vip));
  const done = useProgressStore((state) => isDailyDone(state, today));
  const streakText =
    streak > 0
      ? t('dailyCard.streak', { count: streak, value: formatNumber(streak) })
      : t('dailyCard.noStreak');

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: ui.surface, borderColor: surfaceColors(ui).hairline },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          done ? t('dailyCard.doneA11y') : t('dailyCard.openA11y', { streak: streakText })
        }
        onPress={onOpen}
        style={({ pressed }) => [styles.info, pressed && styles.pressed]}
      >
        <View
          style={[
            styles.iconTile,
            {
              backgroundColor: withAlpha(streak > 0 ? colors.flame : ui.textMuted, alphas.tint),
            },
          ]}
        >
          <Ionicons
            name={streak > 0 ? 'flame' : 'flame-outline'}
            size={20}
            color={streak > 0 ? colors.flame : ui.textMuted}
          />
        </View>
        <View style={styles.texts}>
          <Text style={[styles.title, { color: ui.text }]}>{t('dailyCard.title')}</Text>
          <Text style={[styles.streak, { color: ui.textMuted }]}>{streakText}</Text>
        </View>
      </Pressable>
      {done ? (
        <View style={[styles.done, { backgroundColor: withAlpha(colors.success, alphas.tint) }]}>
          <Text style={[styles.doneText, { color: colors.success }]}>{t('dailyCard.done')}</Text>
        </View>
      ) : (
        <Button
          variant="primary"
          size="md"
          label={t('dailyCard.play')}
          accessibilityLabel={t('dailyCard.playA11y')}
          onPress={onPlay}
          ui={ui}
          testID="daily-card-play"
        />
      )}
    </View>
  );
};

export const DailyCard = memo(DailyCardComponent);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xs,
    paddingEnd: spacing.md,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  pressed: {
    opacity: 0.75,
  },
  texts: {
    flex: 1,
  },
  title: {
    ...typography.rowTitleStrong,
  },
  streak: {
    ...typography.rowHint,
  },
  done: {
    minHeight: controlHeights.sm,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  doneText: {
    ...typography.control,
  },
});
