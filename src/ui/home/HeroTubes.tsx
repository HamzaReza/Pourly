import {
  Canvas,
  Group,
  Picture,
  Skia,
  type SkImage,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  cancelAnimation,
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import type { PourPlan } from '@/render/anim/pour';
import { buildHeroScene, heroPhase, type HeroScene } from '@/render/hero';
import type { PourPictureSet } from '@/render/pourPictures';
import { PourSlot, type PourSlotState } from '@/render/PourLayer';
import type { Theme } from '@/render/themes';

export interface HeroTubesProps {
  theme: Theme;
  colorBlind: boolean;
  /** False while Home is not focused, under reduced motion or in low quality: a still frame. */
  animate: boolean;
}

interface HeroTubeProps {
  scene: HeroScene;
  index: number;
  clock: SharedValue<number>;
}

/** One resting tube; hidden while the pour slot draws it, its liquid following the loop. */
const HeroTubeComponent = ({ scene, index, clock }: HeroTubeProps) => {
  const rect = scene.layout.tubes[index]?.drawn;
  const { starts, totals, pours, states, glass, empty } = scene;
  const froms = useMemo(() => pours.map((pour) => pour.plan.from), [pours]);
  const tos = useMemo(() => pours.map((pour) => pour.plan.to), [pours]);
  const owned = useDerivedValue(() => {
    const phase = heroPhase(starts, totals, clock.get());
    return phase.pour >= 0 && (froms[phase.pour] === index || tos[phase.pour] === index);
  });
  const liquid = useDerivedValue(() => {
    if (owned.get()) return empty;
    const phase = heroPhase(starts, totals, clock.get());
    return states[phase.done]?.[index] ?? empty;
  });
  const back = useDerivedValue(() => (owned.get() ? empty : glass.back));
  const front = useDerivedValue(() => (owned.get() ? empty : glass.front));
  if (rect === undefined) return null;
  const transform: Transforms3d = [{ translateX: rect.x }, { translateY: rect.y }];
  return (
    <Group transform={transform}>
      <Picture picture={back} />
      <Picture picture={liquid} />
      <Picture picture={front} />
    </Group>
  );
};

const HeroTube = memo(HeroTubeComponent);

const NO_SPRITE = Skia.XYWHRect(0, 0, 0, 0);

/**
 * Home hero: three tubes pouring in a loop on a small, separate canvas. The board's pictures and
 * pour layer are reused; one UI-thread clock drives everything, so React never re-renders while
 * it plays. The clock stops (holding its frame) whenever `animate` is false.
 */
const HeroTubesComponent = ({ theme, colorBlind, animate }: HeroTubesProps) => {
  const scene = useMemo(() => buildHeroScene(Skia, theme, colorBlind), [theme, colorBlind]);
  const clock = useSharedValue(0);
  const plan = useSharedValue<PourPlan | null>(null);
  const pictures = useSharedValue<PourPictureSet | null>(null);
  const pourClock = useSharedValue(0);
  const texture = useSharedValue<SkImage | null>(null);
  const slot = useMemo<PourSlotState>(
    () => ({ plan, pictures, clock: pourClock }),
    [plan, pictures, pourClock],
  );
  const plans = useMemo(() => scene.pours.map((pour) => pour.plan), [scene]);
  const pourPictures = useMemo(() => scene.pours.map((pour) => pour.pictures), [scene]);
  const { starts, totals, cycleMs } = scene;

  useAnimatedReaction(
    () => heroPhase(starts, totals, clock.get()),
    (phase, previous) => {
      if (phase.pour >= 0) {
        if (previous === null || previous.pour !== phase.pour) {
          plan.set(plans[phase.pour] ?? null);
          pictures.set(pourPictures[phase.pour] ?? null);
        }
        pourClock.set(clock.get() - (starts[phase.pour] ?? 0));
      } else if (previous !== null && previous.pour >= 0) {
        plan.set(null);
        pictures.set(null);
      }
    },
    [starts, totals, plans, pourPictures],
  );

  useEffect(() => {
    if (!animate) {
      cancelAnimation(clock);
      return;
    }
    const from = clock.get() % cycleMs;
    clock.set(from);
    clock.set(
      withSequence(
        withTiming(cycleMs, { duration: cycleMs - from, easing: Easing.linear }),
        withRepeat(
          withSequence(
            withTiming(0, { duration: 0 }),
            withTiming(cycleMs, { duration: cycleMs, easing: Easing.linear }),
          ),
          -1,
        ),
      ),
    );
    return () => cancelAnimation(clock);
  }, [animate, clock, cycleMs]);

  return (
    <View
      style={[styles.canvas, { width: scene.size.width, height: scene.size.height }]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Canvas style={styles.fill}>
        {scene.layout.tubes.map((_, index) => (
          <HeroTube key={index} scene={scene} index={index} clock={clock} />
        ))}
        <PourSlot
          slot={slot}
          paths={scene.paths}
          glass={scene.glass}
          empty={scene.empty}
          texture={texture}
          sparkleSprite={NO_SPRITE}
          sparkles={0}
        />
      </Canvas>
    </View>
  );
};

export const HeroTubes = memo(HeroTubesComponent);

const styles = StyleSheet.create({
  canvas: {
    alignSelf: 'center',
    direction: 'ltr',
  },
  fill: {
    flex: 1,
  },
});
