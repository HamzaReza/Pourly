import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ThemeUi } from '@/render/themes';

import type { IconName } from './IconButton';
import { colors, fontSizes, fontWeights, radii, spacing } from './tokens';
import { Text } from '@/ui/Text';

export interface CountBadgeProps {
  /** Number shown in the badge; ignored when `icon` is set. */
  count?: number;
  /** Icon instead of a number (e.g. `play` when the action would use a rewarded ad). */
  icon?: IconName;
  /** Small coin glyph before the number (a coin price). */
  coin?: boolean;
  /** Theme colors: the badge uses the accent; the neutral palette when omitted. */
  ui?: ThemeUi;
  /** Color of the ring that separates the badge from what it sits on. */
  ringColor?: string;
}

/**
 * Small pill pinned to the top-end corner of an action button: accent for counts and ads, a
 * neutral pill with a coin for prices. Decorative: the button's accessibility label states the
 * same information.
 */
const CountBadgeComponent = ({ count, icon, coin = false, ui, ringColor }: CountBadgeProps) => {
  const accent = ui?.accent ?? colors.accent;
  const onAccent = ui?.onAccent ?? colors.onAccent;
  const surface = ui?.surface ?? colors.surface;
  const text = ui?.text ?? colors.text;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.badge,
        { backgroundColor: coin ? surface : accent, borderColor: ringColor ?? surface },
      ]}
    >
      {coin ? <View style={styles.coin} /> : null}
      {icon !== undefined ? (
        <Ionicons name={icon} size={10} color={onAccent} />
      ) : (
        <Text style={[styles.text, { color: coin ? text : onAccent }]}>{count ?? 0}</Text>
      )}
    </View>
  );
};

export const CountBadge = memo(CountBadgeComponent);

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -spacing.sm + spacing.xxs,
    end: -spacing.sm + spacing.xxs,
    minWidth: 20,
    height: 20,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  coin: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.coin,
    borderWidth: 1,
    borderColor: colors.coinRim,
  },
  text: {
    fontSize: fontSizes.micro + 1,
    fontWeight: fontWeights.heavy,
    fontVariant: ['tabular-nums'],
  },
});
