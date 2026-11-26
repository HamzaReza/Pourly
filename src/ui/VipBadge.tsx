import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useProgressStore } from '@/state/progressStore';

import { alphas, colors, fontSizes, radii, spacing, typography, withAlpha } from './tokens';
import { Text } from '@/ui/Text';

/** Small "VIP" pill shown on Home and in the game HUD while the VIP entitlement is active. */
const VipBadgeComponent = () => {
  const { t } = useTranslation();
  const vip = useProgressStore((state) => state.entitlements.vip);
  if (!vip) return null;
  return (
    <View
      accessible
      accessibilityLabel={t('vipBadge.a11y')}
      style={[
        styles.badge,
        {
          backgroundColor: withAlpha(colors.coin, alphas.tint),
          borderColor: withAlpha(colors.coin, alphas.border),
        },
      ]}
      testID="vip-badge"
    >
      <Ionicons name="diamond" size={12} color={colors.coin} />
      <Text style={[styles.label, { color: colors.coin }]}>{t('vipBadge.label')}</Text>
    </View>
  );
};

export const VipBadge = memo(VipBadgeComponent);

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    ...typography.tag,
    fontSize: fontSizes.caption - 1,
  },
});
