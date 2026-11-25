import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ECONOMY } from '@/config/economy';
import { VIP_PRODUCT_IDS, type ProductId } from '@/config/products';
import { formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import type { BillingPeriod } from '@/services/iapTypes';
import { Button } from '@/ui/Button';
import type { IconName } from '@/ui/IconButton';
import { fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from '@/ui/tokens';

import { PriceButton, type PriceState } from './PriceButton';

type BenefitKey = 'noInterstitials' | 'giftX2' | 'dailyBonus' | 'gold' | 'badge' | 'freeze';

const BENEFITS: readonly { icon: IconName; key: BenefitKey }[] = [
  { icon: 'ban', key: 'noInterstitials' },
  { icon: 'gift', key: 'giftX2' },
  { icon: 'sunny', key: 'dailyBonus' },
  { icon: 'color-palette', key: 'gold' },
  { icon: 'diamond', key: 'badge' },
  { icon: 'snow', key: 'freeze' },
];

export interface VipCardProps {
  ui: ThemeUi;
  active: boolean;
  priceOf: (productId: ProductId) => PriceState;
  disabled: boolean;
  onBuy: (productId: ProductId) => void;
  onManage: () => void;
  onTerms: () => void;
  onPrivacy: () => void;
}

/**
 * VIP: benefits, then either "Active" with Manage subscription, or one row per plan with its store
 * price and billing period. The auto-renewal note and the Terms and Privacy links sit under the
 * plans, as subscription offers require.
 */
const VipCardComponent = ({
  ui,
  active,
  priceOf,
  disabled,
  onBuy,
  onManage,
  onTerms,
  onPrivacy,
}: VipCardProps) => {
  const { t } = useTranslation();

  const benefitText = (key: BenefitKey): string => {
    switch (key) {
      case 'noInterstitials':
        return t('shop.vip.benefits.noInterstitials');
      case 'giftX2':
        return t('shop.vip.benefits.giftX2');
      case 'dailyBonus':
        return t('shop.vip.benefits.dailyBonus', {
          coins: formatNumber(ECONOMY.vipDailyCoins),
          hints: formatNumber(ECONOMY.vipDailyHints),
        });
      case 'gold':
        return t('shop.vip.benefits.gold');
      case 'badge':
        return t('shop.vip.benefits.badge');
      case 'freeze':
        return t('shop.vip.benefits.freeze');
    }
  };

  const periodText = (period: BillingPeriod | null): string =>
    period === null ? '' : t(`shop.vip.period.${period.unit}`, { count: period.count });

  return (
    <View style={[styles.card, { backgroundColor: ui.surface }]} testID="shop-vip">
      <View style={styles.header}>
        <Ionicons name="diamond" size={26} color={ui.accent} />
        <View style={styles.headerTexts}>
          <Text accessibilityRole="header" style={[styles.title, { color: ui.text }]}>
            {t('shop.sections.vip')}
          </Text>
          <Text style={[styles.subtitle, { color: ui.textMuted }]}>{t('shop.vip.subtitle')}</Text>
        </View>
        {active ? (
          <View
            style={[styles.activePill, { backgroundColor: ui.accent }]}
            accessible
            accessibilityLabel={t('shop.vip.activeA11y')}
            testID="vip-active"
          >
            <Text style={[styles.activeText, { color: ui.onAccent }]}>{t('shop.vip.active')}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.benefits}>
        {BENEFITS.map((benefit) => (
          <View key={benefit.key} style={styles.benefit}>
            <Ionicons name={benefit.icon} size={18} color={ui.accent} />
            <Text style={[styles.benefitText, { color: ui.text }]}>{benefitText(benefit.key)}</Text>
          </View>
        ))}
      </View>
      {active ? (
        <Button label={t('shop.manage')} icon="open-outline" onPress={onManage} ui={ui} />
      ) : (
        VIP_PRODUCT_IDS.map((productId) => {
          const price = priceOf(productId);
          const name = t(`shop.names.${productId}`);
          const ready = price.kind === 'ready' ? price.product : null;
          const period = ready === null ? '' : periodText(ready.billingPeriod);
          const planPrice =
            ready === null
              ? null
              : period.length > 0
                ? t('shop.vip.planPrice', { price: ready.priceString, period })
                : ready.priceString;
          return (
            <View key={productId} style={styles.plan} testID={`vip-plan-${productId}`}>
              <View style={styles.planTexts}>
                <Text style={[styles.planName, { color: ui.text }]}>{name}</Text>
                {planPrice !== null ? (
                  <Text style={[styles.planPrice, { color: ui.textMuted }]}>{planPrice}</Text>
                ) : null}
              </View>
              <PriceButton
                ui={ui}
                name={name}
                price={price}
                label={t('shop.vip.subscribe')}
                accessibilityLabel={
                  ready === null
                    ? undefined
                    : t('shop.vip.subscribeA11y', { name, price: ready.priceString, period })
                }
                disabled={disabled}
                onBuy={() => onBuy(productId)}
                testID={`buy-${productId}`}
              />
            </View>
          );
        })
      )}
      <Text style={[styles.note, { color: ui.textMuted }]}>{t('shop.vip.renewNote')}</Text>
      <View style={styles.links}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('shop.terms')}
          onPress={onTerms}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <Text style={[styles.linkText, { color: ui.accent }]}>{t('shop.terms')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('shop.privacy')}
          onPress={onPrivacy}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <Text style={[styles.linkText, { color: ui.accent }]}>{t('shop.privacy')}</Text>
        </Pressable>
      </View>
    </View>
  );
};

export const VipCard = memo(VipCardComponent);

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTexts: {
    flex: 1,
  },
  title: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    fontSize: fontSizes.small,
  },
  activePill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  activeText: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.heavy,
  },
  benefits: {
    gap: spacing.sm,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  benefitText: {
    flex: 1,
    fontSize: fontSizes.small,
  },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  planTexts: {
    flex: 1,
  },
  planName: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  planPrice: {
    fontSize: fontSizes.small,
  },
  note: {
    fontSize: fontSizes.caption,
  },
  links: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  link: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  linkText: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.semibold,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.7,
  },
});
