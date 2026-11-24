/**
 * Minimal `react-native-reanimated` stand-in for component tests. Reanimated 4.7 cannot
 * initialize under jest-expo (DECISIONS P5.22), so tests opt in with:
 *
 *   jest.mock('react-native-reanimated', () => require('../test-utils/reanimatedStub'));
 *
 * Animations resolve to their target values immediately; layout animation builders chain.
 */
import { View } from 'react-native';

type Builder = { [method: string]: () => Builder };

const builder: Builder = {};
for (const method of ['duration', 'delay', 'springify', 'withInitialValues', 'reduceMotion']) {
  builder[method] = () => builder;
}

const identity = (value: number): number => value;
const easing = (): ((value: number) => number) => identity;

const sharedValue = <T,>(initial: T | (() => T)) => {
  let value = typeof initial === 'function' ? (initial as () => T)() : initial;
  return {
    get: () => value,
    set: (next: T) => {
      value = next;
    },
  };
};

export const useSharedValue = sharedValue;
export const useDerivedValue = <T,>(compute: () => T) => sharedValue(compute());
export const useAnimatedProps = () => ({});
export const useAnimatedStyle = () => ({});
export const useAnimatedReaction = () => undefined;
export const useReducedMotion = () => false;
export const withTiming = <T,>(value: T) => value;
export const withSpring = <T,>(value: T) => value;
export const withRepeat = <T,>(value: T) => value;
export const withSequence = <T,>(...values: T[]) => values[values.length - 1];
export const cancelAnimation = () => undefined;
export const Easing = {
  linear: identity,
  quad: identity,
  cubic: identity,
  in: easing,
  out: easing,
  inOut: easing,
};
export const FadeIn = builder;
export const FadeOut = builder;
export const FadeInDown = builder;
export const ZoomIn = builder;
export const SlideInDown = builder;
export const SlideOutDown = builder;

const Animated = {
  View,
  createAnimatedComponent: <C,>(component: C): C => component,
};

export default Animated;
