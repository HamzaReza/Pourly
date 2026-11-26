import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ThemeUi } from '@/render/themes';
import { alphas, MIN_TOUCH_TARGET, radii, spacing, typography, withAlpha } from '@/ui/tokens';
import { Text } from '@/ui/Text';

const TILE = 40;

export interface ProductRowProps {
  ui: ThemeUi;
  /** Decoration at the start (coin glyph, icon), drawn on a tinted tile. */
  leading: ReactNode;
  /** Tile tint; the theme accent when omitted. */
  tint?: string;
  title: string;
  subtitle?: string;
  /** Accessible version of the subtitle when it differs (for example a countdown). */
  subtitleA11y?: string;
  /** The price button or owned state. */
  trailing: ReactNode;
  testID?: string;
}

/** One product inside a Shop card: what it is, then how to buy it. */
const ProductRowComponent = ({
  ui,
  leading,
  tint,
  title,
  subtitle,
  subtitleA11y,
  trailing,
  testID,
}: ProductRowProps) => (
  <View style={styles.row} testID={testID}>
    <View style={[styles.tile, { backgroundColor: withAlpha(tint ?? ui.accent, alphas.tint) }]}>
      {leading}
    </View>
    <View style={styles.texts}>
      <Text style={[styles.title, { color: ui.text }]} numberOfLines={2}>
        {title}
      </Text>
      {subtitle !== undefined ? (
        <Text style={[styles.subtitle, { color: ui.textMuted }]} accessibilityLabel={subtitleA11y}>
          {subtitle}
        </Text>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    ...typography.rowTitleStrong,
  },
  subtitle: {
    ...typography.cardBody,
  },
});
