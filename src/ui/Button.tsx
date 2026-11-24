import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import type { ThemeUi } from '@/render/themes';

import type { IconName } from './IconButton';
import { colors, fontSizes, fontWeights, MIN_TOUCH_TARGET, radii, spacing } from './tokens';

export type ButtonVariant = 'primary' | 'secondary';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /** Screen-reader label when it should differ from the visible text. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Theme colors; the neutral chrome palette is used when omitted. */
  ui?: ThemeUi;
  /** Icon drawn after the label (for example `play` for "watch an ad"). */
  icon?: IconName;
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
  disabled = false,
  ui = NEUTRAL_UI,
  icon,
  style,
  testID,
}: ButtonProps) => {
  const primary = variant === 'primary';
  const background = primary ? ui.accent : ui.surface;
  const foreground = primary ? ui.onAccent : ui.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background },
        !primary && { borderColor: ui.textMuted },
        !primary && styles.outlined,
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, primary && styles.primaryLabel, { color: foreground }]}>
        {label}
      </Text>
      {icon !== undefined ? <Ionicons name={icon} size={18} color={foreground} /> : null}
    </Pressable>
  );
};

export const Button = memo(ButtonComponent);

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlined: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  primaryLabel: {
    fontSize: fontSizes.title,
  },
});
