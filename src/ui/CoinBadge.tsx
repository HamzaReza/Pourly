import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { track } from '@/services/analytics';
import { useProgressStore } from '@/state/progressStore';

import { AnimatedCount } from './AnimatedCount';
import { useReducedMotionPref, useThemeUi } from './theme';
import { colors, fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from './tokens';

export interface CoinBadgeProps {
  /** Where the badge sits, for the `shop_opened` event. */
  source: string;
  /** False inside the Shop itself: the balance is shown but does not open the Shop again. */
  interactive?: boolean;
}

/** Coin glyph drawn with views (no image). */
export const CoinGlyph = memo(({ size = 18 }: { size?: number }) => (
  <View
    accessible={false}
    style={[styles.coin, { width: size, height: size, borderRadius: size / 2 }]}
  >
    <View
      style={[
        styles.coinInner,
        { width: size * 0.56, height: size * 0.56, borderRadius: size * 0.28 },
      ]}
    />
  </View>
));
CoinGlyph.displayName = 'CoinGlyph';

/** Coin balance that counts up on the UI thread when coins arrive; tap opens the Shop. */
const CoinBadgeComponent = ({ source, interactive = true }: CoinBadgeProps) => {
  const { t } = useTranslation();
  const ui = useThemeUi();
  const reducedMotion = useReducedMotionPref();
  const coins = useProgressStore((state) => state.coins);

  const openShop = useCallback(() => {
    track('shop_opened', { from: source });
    router.push('/shop');
  }, [source]);

  const content = (
    <>
      <CoinGlyph />
      <AnimatedCount
        value={coins}
        reducedMotion={reducedMotion}
        style={[styles.count, { color: ui.text }]}
      />
    </>
  );

  if (!interactive) {
    return (
      <View
        accessible
        accessibilityLabel={t('coins.balanceA11y', { count: coins })}
        style={[styles.badge, { backgroundColor: ui.surface }]}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('coins.badgeA11y', { count: coins })}
      onPress={openShop}
      hitSlop={4}
      style={({ pressed }) => [
        styles.badge,
        { backgroundColor: ui.surface },
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  );
};

export const CoinBadge = memo(CoinBadgeComponent);

const styles = StyleSheet.create({
  badge: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.8,
  },
  coin: {
    backgroundColor: colors.coin,
    borderWidth: 1.5,
    borderColor: colors.coinRim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinInner: {
    borderWidth: 1.5,
    borderColor: colors.coinRim,
  },
  count: {
    minWidth: 32,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
});
