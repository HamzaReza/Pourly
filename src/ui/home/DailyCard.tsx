import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { currentStreak, isDailyDone } from '@/game/daily';
import { formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import { useProgressStore } from '@/state/progressStore';
import { Button } from '@/ui/Button';
import { colors, fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from '@/ui/tokens';

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
    <View style={[styles.card, { backgroundColor: ui.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          done ? t('dailyCard.doneA11y') : t('dailyCard.openA11y', { streak: streakText })
        }
        onPress={onOpen}
        style={({ pressed }) => [styles.info, pressed && styles.pressed]}
      >
        <Ionicons name="flame" size={30} color={streak > 0 ? colors.flame : ui.textMuted} />
        <View style={styles.texts}>
          <Text style={[styles.title, { color: ui.text }]}>{t('dailyCard.title')}</Text>
          <Text style={[styles.streak, { color: ui.textMuted }]}>{streakText}</Text>
        </View>
        <Ionicons
          name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
          size={18}
          color={ui.textMuted}
        />
      </Pressable>
      {done ? (
        <View style={styles.done}>
          <Text style={[styles.doneText, { color: ui.text }]}>{t('dailyCard.done')}</Text>
        </View>
      ) : (
        <Button
          variant="primary"
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
    padding: spacing.sm,
    paddingEnd: spacing.md,
    borderRadius: radii.lg,
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
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  streak: {
    fontSize: fontSizes.small,
  },
  done: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  doneText: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
});
