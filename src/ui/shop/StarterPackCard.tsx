import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { STARTER_PACK_CONTENTS } from '@/config/products';
import { countdownParts, starterPackRemainingMs } from '@/game/starterPack';
import { formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import { useProgressStore } from '@/state/progressStore';
import { alphas, colors, radii, spacing, typography, withAlpha } from '@/ui/tokens';

import { Card } from '@/ui/Card';
import { Tag } from '@/ui/Tag';

import { PriceButton, type PriceState } from './PriceButton';
import { Text } from '@/ui/Text';

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
    <Card ui={ui} tone="selected" style={styles.card} testID="shop-starter-pack">
      <View style={styles.header}>
        <View style={[styles.iconTile, { backgroundColor: withAlpha(ui.text, alphas.subtle) }]}>
          <Ionicons name="gift" size={22} color={colors.coin} />
        </View>
        <View style={styles.headerTexts}>
          <Tag ui={ui} label={t('shop.starterPack.oneTime')} />
          <Text accessibilityRole="header" style={[styles.title, { color: ui.text }]}>
            {name}
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
        <View style={styles.timerWrap}>
          <Ionicons name="time-outline" size={15} color={ui.accent} />
          <Text
            style={[styles.timer, { color: ui.text }]}
            accessibilityLabel={t('starterPack.endsInA11y', {
              hours: formatNumber(hours),
              minutes: formatNumber(minutes),
            })}
          >
            {t('starterPack.endsIn', { time })}
          </Text>
        </View>
        <PriceButton
          ui={ui}
          name={name}
          price={price}
          disabled={disabled}
          onBuy={onBuy}
          testID="buy-starter_pack"
        />
      </View>
    </Card>
  );
};

export const StarterPackCard = memo(StarterPackCardComponent);

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: {
    flex: 1,
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  title: {
    ...typography.cardTitle,
  },
  description: {
    ...typography.cardBody,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  timerWrap: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timer: {
    flexShrink: 1,
    ...typography.link,
    fontVariant: ['tabular-nums'],
  },
});
