import { memo, useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { fontSizes, fontWeights } from '@/ui/tokens';

const SWAY_MS = 1600;

export interface AnimatedTitleProps {
  text: string;
  color: string;
  /** False when Home is not focused or motion is reduced: the title rests. */
  animate: boolean;
}

/** The game title with a gentle bob and tilt on the UI thread. */
const AnimatedTitleComponent = ({ text, color, animate }: AnimatedTitleProps) => {
  const phase = useSharedValue(0);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(phase);
      phase.set(withTiming(0, { duration: 200 }));
      return;
    }
    phase.set(
      withRepeat(withTiming(1, { duration: SWAY_MS, easing: Easing.inOut(Easing.quad) }), -1, true),
    );
    return () => cancelAnimation(phase);
  }, [animate, phase]);

  const style = useAnimatedStyle(() => {
    const t = phase.get();
    return {
      transform: [{ translateY: -4 * t }, { rotate: `${-2 + 4 * t}deg` }, { scale: 1 + 0.03 * t }],
    };
  });

  return (
    <Animated.View style={style}>
      <Text accessibilityRole="header" style={[styles.title, { color }]}>
        {text}
      </Text>
    </Animated.View>
  );
};

export const AnimatedTitle = memo(AnimatedTitleComponent);

const styles = StyleSheet.create({
  title: {
    fontSize: fontSizes.display,
    fontWeight: fontWeights.heavy,
    textAlign: 'center',
  },
});
