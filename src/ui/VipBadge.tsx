import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useProgressStore } from '@/state/progressStore';

import { useThemeUi } from './theme';
import { fontSizes, fontWeights, radii, spacing } from './tokens';

/** Small "VIP" pill shown on Home and in the game HUD while the VIP entitlement is active. */
const VipBadgeComponent = () => {
  const { t } = useTranslation();
  const ui = useThemeUi();
  const vip = useProgressStore((state) => state.entitlements.vip);
  if (!vip) return null;
  return (
    <View
      accessible
      accessibilityLabel={t('vipBadge.a11y')}
      style={[styles.badge, { backgroundColor: ui.accent }]}
      testID="vip-badge"
    >
      <Ionicons name="diamond" size={12} color={ui.onAccent} />
      <Text style={[styles.label, { color: ui.onAccent }]}>{t('vipBadge.label')}</Text>
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
  },
  label: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.heavy,
  },
});
