import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ECONOMY } from '@/config/economy';
import { VIP_PRODUCT_IDS, type ProductId } from '@/config/products';
import { formatNumber } from '@/i18n/format';
import type { ThemeUi } from '@/render/themes';
import type { BillingPeriod } from '@/services/iapTypes';
import { Button } from '@/ui/Button';
import type { IconName } from '@/ui/IconButton';
import {
  alphas,
  colors,
  fontSizes,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  typography,
  withAlpha,
} from '@/ui/tokens';

import { Card } from '@/ui/Card';
import { Tag } from '@/ui/Tag';

import { PriceButton, type PriceState } from './PriceButton';
import { Text } from '@/ui/Text';

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

  const gold = colors.coin;

  return (
    <Card ui={ui} tone="gold" style={styles.card} testID="shop-vip">
      <View style={styles.header}>
        <View style={[styles.iconTile, { backgroundColor: withAlpha(ui.text, alphas.subtle) }]}>
          <Ionicons name="diamond" size={22} color={gold} />
        </View>
        <View style={styles.headerTexts}>
          <Text accessibilityRole="header" style={[styles.title, { color: ui.text }]}>
            {t('shop.sections.vip')}
          </Text>
          <Text style={[styles.subtitle, { color: ui.textMuted }]}>{t('shop.vip.subtitle')}</Text>
        </View>
        {active ? (
          <Tag
            ui={ui}
            icon="checkmark"
            label={t('shop.vip.active')}
            accessibilityLabel={t('shop.vip.activeA11y')}
            testID="vip-active"
          />
        ) : null}
      </View>
      <View style={styles.benefits}>
        {BENEFITS.map((benefit) => (
          <View key={benefit.key} style={styles.benefit}>
            <View
              style={[styles.benefitIcon, { backgroundColor: withAlpha(ui.accent, alphas.tint) }]}
            >
              <Ionicons name={benefit.icon} size={13} color={ui.accent} />
            </View>
            <Text style={[styles.benefitText, { color: ui.text }]}>{benefitText(benefit.key)}</Text>
          </View>
        ))}
      </View>
      {active ? (
        <Button size="md" label={t('shop.manage')} icon="open-outline" onPress={onManage} ui={ui} />
      ) : (
        <View style={styles.plans}>
          {VIP_PRODUCT_IDS.map((productId) => {
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
              <View
                key={productId}
                style={[
                  styles.plan,
                  {
                    backgroundColor: withAlpha(ui.text, alphas.wash),
                    borderColor: withAlpha(ui.textMuted, alphas.hairline),
                  },
                ]}
                testID={`vip-plan-${productId}`}
              >
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
          })}
        </View>
      )}
      <Text style={[styles.note, { color: ui.textMuted }]}>{t('shop.vip.renewNote')}</Text>
      <View style={styles.links}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('shop.terms')}
          onPress={onTerms}
          hitSlop={LINK_SLOP}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <Text style={[styles.linkText, { color: ui.accent }]}>{t('shop.terms')}</Text>
        </Pressable>
        <Text style={[styles.dot, { color: ui.textMuted }]}>·</Text>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('shop.privacy')}
          onPress={onPrivacy}
          hitSlop={LINK_SLOP}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        >
          <Text style={[styles.linkText, { color: ui.accent }]}>{t('shop.privacy')}</Text>
        </Pressable>
      </View>
    </Card>
  );
};

export const VipCard = memo(VipCardComponent);

const LINK_HEIGHT = 28;
/** Grows the 28 dp links to a 44 dp touch target. */
const LINK_SLOP = {
  top: (MIN_TOUCH_TARGET - LINK_HEIGHT) / 2,
  bottom: (MIN_TOUCH_TARGET - LINK_HEIGHT) / 2,
};

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
    gap: spacing.xxs,
  },
  title: {
    ...typography.cardTitle,
  },
  subtitle: {
    fontSize: fontSizes.footnote,
  },
  benefits: {
    gap: spacing.sm,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  benefitIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: fontSizes.footnote,
  },
  plans: {
    gap: spacing.sm,
  },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingStart: spacing.md,
    paddingEnd: spacing.md,
    paddingVertical: spacing.md,
  },
  planTexts: {
    flex: 1,
    gap: 1,
  },
  planName: {
    ...typography.rowTitleStrong,
  },
  planPrice: {
    fontSize: fontSizes.footnote,
  },
  note: {
    ...typography.fine,
  },
  links: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  link: {
    minHeight: LINK_HEIGHT,
    justifyContent: 'center',
  },
  dot: {
    fontSize: fontSizes.small,
  },
  linkText: {
    ...typography.link,
  },
  pressed: {
    opacity: 0.7,
  },
});
