import { memo, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { ThemeUi } from '@/render/themes';

import { surfaceColors } from './theme';
import { alphas, colors, fill, radii, spacing, withAlpha } from './tokens';

/**
 * `plain`: surface with a hairline outline. `accent`: accent outline with a faint accent wash
 * (featured offers). `gold`: gold outline (VIP). `selected`: solid accent outline.
 */
export type CardTone = 'plain' | 'accent' | 'gold' | 'selected';

export interface CardProps {
  ui: ThemeUi;
  tone?: CardTone;
  /** Inner padding; `none` for cards whose rows bring their own. */
  padding?: 'none' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}

/** The one card surface for every screen: rounded, outlined, flat. */
const CardComponent = ({
  ui,
  tone = 'plain',
  padding = 'lg',
  style,
  children,
  testID,
}: CardProps) => {
  const surfaces = surfaceColors(ui);
  const borderColor =
    tone === 'accent'
      ? surfaces.accentBorder
      : tone === 'gold'
        ? withAlpha(colors.coin, alphas.border)
        : tone === 'selected'
          ? ui.accent
          : surfaces.hairline;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: surfaces.card, borderColor },
        tone !== 'plain' && styles.emphasized,
        padding === 'md' && styles.paddingMd,
        padding === 'lg' && styles.paddingLg,
        style,
      ]}
      testID={testID}
    >
      {tone === 'accent' || tone === 'gold' ? (
        <View
          pointerEvents="none"
          style={[styles.wash, { backgroundColor: withAlpha(ui.accent, alphas.wash) }]}
        />
      ) : null}
      {children}
    </View>
  );
};

export const Card = memo(CardComponent);

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  emphasized: {
    borderWidth: 1,
  },
  paddingMd: {
    padding: spacing.md,
  },
  paddingLg: {
    padding: spacing.lg,
  },
  wash: {
    ...fill,
  },
});
