import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { countdownParts, starterPackRemainingMs } from '@/game/starterPack';
import { formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import { useProgressStore } from '@/state/progressStore';
import { Button } from '@/ui/Button';
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
import { Text } from '@/ui/Text';

const TICK_MS = 1000;

export interface StarterPackBannerProps {
  ui: ThemeUi;
  onView: () => void;
}

/**
 * Starter Pack offer with its persisted 72-hour countdown (hh:mm:ss). Only this banner re-renders
 * once per second; it disappears when the offer expires or is bought.
 */
const StarterPackBannerComponent = ({ ui, onView }: StarterPackBannerProps) => {
  const { t } = useTranslation();
  const level = useProgressStore((state) => state.level);
  const starterPackExpiresAt = useProgressStore((state) => state.starterPackExpiresAt);
  const starterPackPurchased = useProgressStore((state) => state.starterPackPurchased);
  const lastSeenAt = useProgressStore((state) => state.lastSeenAt);
  const [now, setNow] = useState(() => Date.now());
  const remaining = starterPackRemainingMs(
    { level, starterPackExpiresAt, starterPackPurchased, lastSeenAt },
    now,
  );
  const visible = remaining > 0;

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [visible]);

  if (!visible) return null;
  const { hours, minutes, seconds } = countdownParts(remaining);
  const time = t('starterPack.countdown', {
    h: formatNumber(hours, 2),
    m: formatNumber(minutes, 2),
    s: formatNumber(seconds, 2),
  });

  return (
    <View
      style={[styles.banner, { backgroundColor: ui.surface, borderColor: ui.accent }]}
      testID="starter-pack-banner"
    >
      <View style={[styles.iconTile, { backgroundColor: withAlpha(ui.text, alphas.subtle) }]}>
        <Ionicons name="gift" size={20} color={colors.coin} />
      </View>
      <View
        style={styles.texts}
        accessible
        accessibilityLabel={t('starterPack.endsInA11y', {
          hours: formatNumber(hours),
          minutes: formatNumber(minutes),
        })}
      >
        <Text style={[styles.title, { color: ui.text }]}>{t('starterPack.title')}</Text>
        <Text style={[styles.subtitle, { color: ui.textMuted }]} numberOfLines={2}>
          {t('starterPack.subtitle')}
        </Text>
        <Text style={[styles.timer, { color: ui.text }]}>{t('starterPack.endsIn', { time })}</Text>
      </View>
      <Button
        variant="primary"
        size="sm"
        label={t('starterPack.view')}
        accessibilityLabel={t('starterPack.viewA11y')}
        onPress={onView}
        ui={ui}
      />
    </View>
  );
};

export const StarterPackBanner = memo(StarterPackBannerComponent);

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    ...typography.rowTitleStrong,
  },
  subtitle: {
    ...typography.fine,
  },
  timer: {
    fontSize: fontSizes.footnote,
    fontWeight: fontWeights.semibold,
    fontVariant: ['tabular-nums'],
  },
});
