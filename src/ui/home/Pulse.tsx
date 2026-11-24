import { memo, useEffect, type ReactNode } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const PULSE_MS = 700;

export interface PulseProps {
  /** Pulses while true; rests at normal size otherwise (and always under reduced motion). */
  active: boolean;
  children: ReactNode;
}

/** Breathing scale on the UI thread, used to draw attention to a claimable reward. */
const PulseComponent = ({ active, children }: PulseProps) => {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!active) {
      cancelAnimation(scale);
      scale.set(1);
      return;
    }
    scale.set(
      withRepeat(
        withTiming(1.08, { duration: PULSE_MS, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(scale);
  }, [active, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
};

export const Pulse = memo(PulseComponent);
