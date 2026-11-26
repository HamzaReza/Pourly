import { memo, useEffect } from 'react';
import { StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useUiFontActive, withUiFont } from './fonts';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface AnimatedCountProps {
  value: number;
  /** Starting value of the first count-up (defaults to `value`: no animation on mount). */
  from?: number;
  /** Count-up length in ms. */
  duration?: number;
  /** Shown before the number, e.g. "+". */
  prefix?: string;
  reducedMotion: boolean;
  style?: StyleProp<TextStyle>;
}

/**
 * A number that counts up to `value` on the UI thread (the text is a read-only TextInput updated
 * through animated props), so a count-up never re-renders React while the board animates.
 * Screen readers ignore it; the parent carries the accessible label.
 */
const AnimatedCountComponent = ({
  value,
  from,
  duration = 700,
  prefix = '',
  reducedMotion,
  style,
}: AnimatedCountProps) => {
  const shown = useSharedValue(from ?? value);
  const uiFont = useUiFontActive();
  const textStyle = uiFont
    ? withUiFont(StyleSheet.flatten([styles.text, style]) as TextStyle, true)
    : [styles.text, style];

  useEffect(() => {
    shown.set(
      reducedMotion ? value : withTiming(value, { duration, easing: Easing.out(Easing.cubic) }),
    );
  }, [value, duration, reducedMotion, shown]);

  const animatedProps = useAnimatedProps(() => {
    const text = `${prefix}${Math.round(shown.get())}`;
    return { text, defaultValue: text };
  });

  return (
    <AnimatedTextInput
      editable={false}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={`${prefix}${from ?? value}`}
      animatedProps={animatedProps}
      style={textStyle}
    />
  );
};

export const AnimatedCount = memo(AnimatedCountComponent);

const styles = StyleSheet.create({
  text: {
    padding: 0,
    margin: 0,
    includeFontPadding: false,
  },
});
