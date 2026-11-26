import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import type { ThemeUi } from '@/render/themes';

import type { IconName } from './IconButton';
import {
  alphas,
  colors,
  COMPACT_CONTROL,
  controlHeights,
  fontSizes,
  fontWeights,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  withAlpha,
} from './tokens';
import { Text } from '@/ui/Text';

/**
 * `primary`: accent fill, one per surface. `secondary`: tonal fill (a soft wash of the text
 * color), for alternatives. `ghost`: text only, for dismissive actions (Cancel, Close, Not now).
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/**
 * `lg` (default, 48 dp) is the main action of a dialog or screen; `md` (40 dp) and `sm` (34 dp)
 * are compact pills sized to their content for lists and cards. `sm` keeps a 44 dp touch target
 * through `hitSlop`.
 */
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /** Screen-reader label when it should differ from the visible text. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Theme colors; the neutral chrome palette is used when omitted. */
  ui?: ThemeUi;
  /** Icon drawn after the label (for example `play` for "watch an ad"). */
  icon?: IconName;
  /** Decoration drawn before the label (for example the hard-level crown). */
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const NEUTRAL_UI: ThemeUi = {
  text: colors.text,
  textMuted: colors.textMuted,
  accent: colors.accent,
  onAccent: colors.onAccent,
  surface: colors.surface,
};

const ButtonComponent = ({
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  variant = 'secondary',
  size = 'lg',
  disabled = false,
  ui = NEUTRAL_UI,
  icon,
  leading,
  style,
  testID,
}: ButtonProps) => {
  const primary = variant === 'primary';
  const ghost = variant === 'ghost';
  const background = primary
    ? ui.accent
    : ghost
      ? 'transparent'
      : withAlpha(ui.text, alphas.subtle + 0.02);
  const foreground = primary ? ui.onAccent : ghost ? ui.accent : ui.text;
  const compact = size !== 'lg';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={
        size === 'sm'
          ? (MIN_TOUCH_TARGET - COMPACT_CONTROL) / 2
          : ghost && size === 'lg'
            ? (MIN_TOUCH_TARGET - controlHeights.md) / 2
            : undefined
      }
      style={({ pressed }) => [
        styles.base,
        size === 'md' && styles.md,
        size === 'sm' && styles.sm,
        ghost && size === 'lg' && styles.ghostLg,
        { backgroundColor: background },
        pressed &&
          (ghost ? { backgroundColor: withAlpha(ui.accent, alphas.subtle) } : styles.pressed),
        disabled && styles.disabled,
        style,
      ]}
    >
      {leading}
      <Text
        numberOfLines={compact ? 1 : undefined}
        adjustsFontSizeToFit={compact}
        minimumFontScale={0.8}
        style={[
          styles.label,
          compact && styles.compactLabel,
          ghost && styles.ghostLabel,
          size === 'sm' && styles.smallLabel,
          { color: foreground },
        ]}
      >
        {label}
      </Text>
      {icon !== undefined ? (
        <Ionicons name={icon} size={compact ? 15 : 18} color={foreground} />
      ) : null}
    </Pressable>
  );
};

export const Button = memo(ButtonComponent);

const styles = StyleSheet.create({
  base: {
    minHeight: controlHeights.lg,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + spacing.xs,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  md: {
    minHeight: controlHeights.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  /** A text action needs no 48 dp body; hitSlop keeps its 44 dp target. */
  ghostLg: {
    minHeight: controlHeights.md,
    paddingVertical: spacing.sm,
  },
  sm: {
    minHeight: COMPACT_CONTROL,
    minWidth: 64,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  ghostLabel: {
    fontWeight: fontWeights.semibold,
  },
  compactLabel: {
    fontSize: fontSizes.callout,
  },
  smallLabel: {
    fontSize: fontSizes.small,
    fontWeight: fontWeights.heavy,
  },
});
