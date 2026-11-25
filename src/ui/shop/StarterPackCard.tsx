import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { STARTER_PACK_CONTENTS } from '@/config/products';
import { countdownParts, starterPackRemainingMs } from '@/game/starterPack';
import { formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import { useProgressStore } from '@/state/progressStore';
import { colors, fontSizes, fontWeights, radii, spacing } from '@/ui/tokens';

import { PriceButton, type PriceState } from './PriceButton';

const TICK_MS = 1000;

export interface StarterPackCardProps {
  ui: ThemeUi;
  price: PriceState;
  disabled: boolean;
  onBuy: () => void;
}

/**
 * The Starter Pack offer with its persisted 72-hour countdown. Hidden before the offer opens,
 * once it expires and once it was bought.
 */
const StarterPackCardComponent = ({ ui, price, disabled, onBuy }: StarterPackCardProps) => {
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
  const name = t('shop.names.starter_pack');

  return (
    <View
      style={[styles.card, { backgroundColor: ui.surface, borderColor: ui.accent }]}
      testID="shop-starter-pack"
    >
      <View style={styles.header}>
        <Ionicons name="gift" size={28} color={colors.coin} />
        <Text accessibilityRole="header" style={[styles.title, { color: ui.text }]}>
          {name}
        </Text>
        <View style={[styles.pill, { backgroundColor: ui.accent }]}>
          <Text style={[styles.pillText, { color: ui.onAccent }]}>
            {t('shop.starterPack.oneTime')}
          </Text>
        </View>
      </View>
      <Text style={[styles.description, { color: ui.textMuted }]}>
        {t('shop.starterPack.description', {
          coins: formatNumber(STARTER_PACK_CONTENTS.coins),
          hints: formatNumber(STARTER_PACK_CONTENTS.hints),
          undos: formatNumber(STARTER_PACK_CONTENTS.undos),
        })}
      </Text>
      <View style={styles.footer}>
        <Text
          style={[styles.timer, { color: ui.text }]}
          accessibilityLabel={t('starterPack.endsInA11y', {
            hours: formatNumber(hours),
            minutes: formatNumber(minutes),
          })}
        >
          {t('starterPack.endsIn', { time })}
        </Text>
        <PriceButton
          ui={ui}
          name={name}
          price={price}
          disabled={disabled}
          onBuy={onBuy}
          testID="buy-starter_pack"
        />
      </View>
    </View>
  );
};

export const StarterPackCard = memo(StarterPackCardComponent);

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1.5,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
  },
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
  },
  pillText: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
  },
  description: {
    fontSize: fontSizes.small,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  timer: {
    flexShrink: 1,
    fontSize: fontSizes.small,
    fontWeight: fontWeights.semibold,
    fontVariant: ['tabular-nums'],
  },
});
