import Ionicons from '@expo/vector-icons/Ionicons';
import { memo, type ComponentProps } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radii } from './tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  size?: number;
}

const IconButtonComponent = ({ icon, accessibilityLabel, onPress, size = 24 }: IconButtonProps) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    hitSlop={4}
    onPress={onPress}
    style={({ pressed }) => [styles.base, pressed && styles.pressed]}
  >
    <Ionicons name={icon} size={size} color={colors.text} />
  </Pressable>
);

export const IconButton = memo(IconButtonComponent);

const styles = StyleSheet.create({
  base: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.surfacePressed,
  },
});
