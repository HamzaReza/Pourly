import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, type ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import type { ThemeUi } from '@/render/themes';

import { alphas, colors, MIN_TOUCH_TARGET, radii, withAlpha } from './tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Visual size of a `filled` icon button; `hitSlop` keeps the 44 dp target. */
const FILLED_SIZE = 40;

export interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  size?: number;
  /** Icon color; defaults to the neutral chrome text color. */
  color?: string;
  /**
   * `plain` (default): just the glyph. `filled`: a 40 dp surface circle with a hairline outline
   * (HUD controls); needs `ui`.
   */
  tone?: 'plain' | 'filled';
  ui?: ThemeUi;
}

const IconButtonComponent = ({
  icon,
  accessibilityLabel,
  onPress,
  size = 24,
  color = colors.text,
  tone = 'plain',
  ui,
}: IconButtonProps) => {
  const filled = tone === 'filled';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={filled ? (MIN_TOUCH_TARGET - FILLED_SIZE) / 2 + 4 : 4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        filled && [
          styles.filled,
          {
            backgroundColor: ui?.surface ?? colors.surface,
            borderColor: withAlpha(ui?.textMuted ?? colors.textMuted, alphas.hairline),
          },
        ],
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={filled ? Math.min(size, 20) : size} color={color} />
    </Pressable>
  );
};

export const IconButton = memo(IconButtonComponent);

const styles = StyleSheet.create({
  base: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filled: {
    width: FILLED_SIZE,
    height: FILLED_SIZE,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
});
