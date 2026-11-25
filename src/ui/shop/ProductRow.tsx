import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ThemeUi } from '@/render/themes';
import { fontSizes, fontWeights, MIN_TOUCH_TARGET, spacing } from '@/ui/tokens';

export interface ProductRowProps {
  ui: ThemeUi;
  /** Decoration at the start (coin glyph, icon). */
  leading: ReactNode;
  title: string;
  subtitle?: string;
  /** The price button or owned state. */
  trailing: ReactNode;
  testID?: string;
}

/** One product inside a Shop section: what it is, then how to buy it. */
const ProductRowComponent = ({
  ui,
  leading,
  title,
  subtitle,
  trailing,
  testID,
}: ProductRowProps) => (
  <View style={styles.row} testID={testID}>
    <View style={styles.leading}>{leading}</View>
    <View style={styles.texts}>
      <Text style={[styles.title, { color: ui.text }]}>{title}</Text>
      {subtitle !== undefined ? (
        <Text style={[styles.subtitle, { color: ui.textMuted }]}>{subtitle}</Text>
      ) : null}
    </View>
    {trailing}
  </View>
);

export const ProductRow = memo(ProductRowComponent);

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH_TARGET + spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  leading: {
    width: 32,
    alignItems: 'center',
  },
  texts: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  subtitle: {
    fontSize: fontSizes.small,
  },
});
