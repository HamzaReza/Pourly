import { memo } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

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
  style?: StyleProp<ViewStyle>;
}

const ButtonComponent = ({
  label,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  variant = 'secondary',
  disabled = false,
  style,
}: ButtonProps) => {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, primary ? styles.primaryLabel : styles.secondaryLabel]}>
        {label}
      </Text>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: colors.accent,
  },
  primaryPressed: {
    opacity: 0.85,
  },
  secondary: {
    backgroundColor: colors.surface,
  },
  secondaryPressed: {
    backgroundColor: colors.surfacePressed,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.bold,
  },
  primaryLabel: {
    color: colors.onAccent,
    fontSize: fontSizes.title,
  },
  secondaryLabel: {
    color: colors.text,
  },
});
