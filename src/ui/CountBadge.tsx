import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { IconName } from './IconButton';
import { colors, fontSizes, fontWeights, radii, spacing } from './tokens';

export interface CountBadgeProps {
  /** Number shown in the badge; ignored when `icon` is set. */
  count?: number;
  /** Icon instead of a number (e.g. `play` when the action would use a rewarded ad). */
  icon?: IconName;
  /** Small coin glyph before the number (a coin price). */
  coin?: boolean;
}

/**
 * Small pill pinned to the top-end corner of an action button. Decorative: the button's
 * accessibility label states the same information.
 */
const CountBadgeComponent = ({ count, icon, coin = false }: CountBadgeProps) => (
  <View
    pointerEvents="none"
    accessible={false}
    importantForAccessibility="no-hide-descendants"
    style={[styles.badge, coin && styles.coinBadge]}
  >
    {coin ? <View style={styles.coin} /> : null}
    {icon !== undefined ? (
      <Ionicons name={icon} size={11} color={colors.onBadge} />
    ) : (
      <Text style={[styles.text, coin && styles.coinText]}>{count ?? 0}</Text>
    )}
  </View>
);

export const CountBadge = memo(CountBadgeComponent);

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -spacing.xs,
    end: -spacing.xs,
    minWidth: 20,
    height: 20,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.badge,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  coinBadge: {
    backgroundColor: colors.surface,
  },
  coin: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.coin,
    borderWidth: 1,
    borderColor: colors.coinRim,
  },
  text: {
    color: colors.onBadge,
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.bold,
  },
  coinText: {
    color: colors.text,
  },
});
