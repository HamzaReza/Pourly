import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ThemeUi } from '@/render/themes';
import type { StoreProduct } from '@/services/iapTypes';
import { Button } from '@/ui/Button';
import {
  alphas,
  COMPACT_CONTROL,
  fontSizes,
  fontWeights,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  withAlpha,
} from '@/ui/tokens';
import { Text } from '@/ui/Text';

/** What the Shop knows about a product's price right now. */
export type PriceState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'owned' }
  | { readonly kind: 'ready'; readonly product: StoreProduct };

export interface PriceButtonProps {
  ui: ThemeUi;
  /** Localized product name (for the accessible label). */
  name: string;
  price: PriceState;
  /** Visible label when it should differ from the price (for example "Subscribe"). */
  label?: string;
  /** Accessible label when it should differ from "Buy {name} for {price}". */
  accessibilityLabel?: string;
  disabled: boolean;
  onBuy: () => void;
  /** Stretches the pill to the parent's width (coin pack tiles). */
  fill?: boolean;
  testID?: string;
}

/**
 * The trailing part of a product row: the store price as a buy button, a spinner while prices
 * load, "Owned" for owned products, or a disabled "Not available".
 */
const PriceButtonComponent = ({
  ui,
  name,
  price,
  label,
  accessibilityLabel,
  disabled,
  onBuy,
  fill,
  testID,
}: PriceButtonProps) => {
  const { t } = useTranslation();
  switch (price.kind) {
    case 'loading':
      return (
        <View style={styles.status} accessible accessibilityLabel={t('shop.loading')}>
          <ActivityIndicator size="small" color={ui.accent} />
        </View>
      );
    case 'owned':
      return (
        <View
          style={[styles.owned, { backgroundColor: withAlpha(ui.accent, alphas.tint) }]}
          accessible
          accessibilityLabel={t('shop.ownedA11y', { name })}
        >
          <Ionicons name="checkmark-circle" size={16} color={ui.accent} />
          <Text style={[styles.ownedText, { color: ui.text }]}>{t('shop.owned')}</Text>
        </View>
      );
    case 'unavailable':
      return (
        <Button
          size="sm"
          label={t('shop.notOffered')}
          accessibilityLabel={t('shop.notOfferedA11y', { name })}
          onPress={onBuy}
          disabled
          ui={ui}
          style={fill === true ? styles.fill : undefined}
          testID={testID}
        />
      );
    case 'ready':
      return (
        <Button
          variant="primary"
          size="sm"
          label={label ?? price.product.priceString}
          accessibilityLabel={
            accessibilityLabel ?? t('shop.buyA11y', { name, price: price.product.priceString })
          }
          onPress={onBuy}
          disabled={disabled}
          ui={ui}
          style={fill === true ? styles.fill : undefined}
          testID={testID}
        />
      );
  }
};

export const PriceButton = memo(PriceButtonComponent);

const styles = StyleSheet.create({
  status: {
    minHeight: COMPACT_CONTROL,
    minWidth: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  owned: {
    minHeight: COMPACT_CONTROL,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  ownedText: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.bold,
  },
  fill: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.sm,
  },
});
