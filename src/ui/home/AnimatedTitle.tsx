import { memo, useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { brandTitleFont } from '@/ui/brandFont';
import { fontSizes } from '@/ui/tokens';
import { Text } from '@/ui/Text';

const SWAY_MS = 1600;
/** Letters at the end of the wordmark drawn in the accent ("Pour" + "ly"). */
const ACCENT_LETTERS = 2;

export interface AnimatedTitleProps {
  text: string;
  color: string;
  /** Tints the last letters of the wordmark; the whole title uses `color` when omitted. */
  accent?: string;
  /** False when Home is not focused or motion is reduced: the title rests. */
  animate: boolean;
  /** Font size in dp; see `titleSizeFor`. */
  size?: number;
}

/** Wordmark size for a window width: ~19% of it, clamped to 56–84 dp (≈ 68 dp at 360 dp). */
export const titleSizeFor = (windowWidth: number): number =>
  Math.round(Math.min(84, Math.max(56, windowWidth * 0.19)));

/**
 * The game's wordmark (brand font, falling back to the system font) with a gentle bob and tilt
 * on the UI thread. Read as one word by screen readers.
 */
const AnimatedTitleComponent = ({
  text,
  color,
  accent,
  animate,
  size = fontSizes.display + 4,
}: AnimatedTitleProps) => {
  const phase = useSharedValue(0);
  const font = brandTitleFont();

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

  const split = accent !== undefined && text.length > ACCENT_LETTERS + 1;
  const head = split ? text.slice(0, -ACCENT_LETTERS) : text;
  const tail = split ? text.slice(-ACCENT_LETTERS) : '';

  return (
    <Animated.View style={style}>
      <Text
        accessibilityRole="header"
        accessibilityLabel={text}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[styles.title, font, { color, fontSize: size, lineHeight: Math.round(size * 1.15) }]}
        testID="home-title"
      >
        {head}
        {split ? <Text style={{ color: accent }}>{tail}</Text> : null}
      </Text>
    </Animated.View>
  );
};

export const AnimatedTitle = memo(AnimatedTitleComponent);

const styles = StyleSheet.create({
  title: {
    textAlign: 'center',
  },
});
