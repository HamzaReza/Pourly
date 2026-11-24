import {
  Group,
  Picture,
  Skia,
  type SkPicture,
  type Transforms3d,
} from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import type { Tube } from '@/game/types';

import { shakeOffset } from './anim/effects';
import { isOwned } from './inputQueue';
import { SELECTION_LIFT } from './layout';
import { recordLiquid, type GlassPictures, type LiquidPaints, type TubePaths } from './scene';

/** UI-thread motion state shared by every resting tube. */
export interface LiftState {
  /** Selected tube index, or -1. */
  readonly upIndex: SharedValue<number>;
  /** 0 → 1 lift of the selected tube (springs past 1 briefly). */
  readonly upProgress: SharedValue<number>;
  /** Tube that is settling after a deselect, or -1. */
  readonly downIndex: SharedValue<number>;
  readonly downProgress: SharedValue<number>;
  /** Tube shaking after an invalid move, or -1. */
  readonly shakeIndex: SharedValue<number>;
  /** 0 → 1 over the shake. */
  readonly shakeProgress: SharedValue<number>;
}

/** Vertical lift (dp) and horizontal shake (dp) of tube `index`. */
export const tubeOffset = (lift: LiftState, index: number): { x: number; y: number } => {
  'worklet';
  const rising = lift.upIndex.get() === index ? lift.upProgress.get() : 0;
  const settling = lift.downIndex.get() === index ? lift.downProgress.get() : 0;
  const shake = lift.shakeIndex.get() === index ? shakeOffset(lift.shakeProgress.get()) : 0;
  return { x: shake, y: -(rising + settling) * SELECTION_LIFT };
};

export interface TubeLayerProps {
  index: number;
  tube: Tube;
  x: number;
  y: number;
  paths: TubePaths;
  glass: GlassPictures;
  paints: LiquidPaints;
  colorBlind: boolean;
  lift: LiftState;
  /** Tubes drawn by the pour layer instead (bit per tube); this layer then draws nothing. */
  ownedMask: SharedValue<number>;
  empty: SkPicture;
}

/**
 * One resting tube: glass back, the cached liquid picture, glass front. The liquid picture is
 * re-recorded only when this tube's segments change (boards share untouched tubes), the layout
 * changes, or color-blind mode toggles. While a pour animates this tube, the tube is hidden here
 * (the pictures switch to an empty one, recomputed only when ownership changes).
 */
const TubeLayerComponent = ({
  index,
  tube,
  x,
  y,
  paths,
  glass,
  paints,
  colorBlind,
  lift,
  ownedMask,
  empty,
}: TubeLayerProps) => {
  const liquid = useMemo(
    () => recordLiquid(Skia, tube, paths, paints, colorBlind),
    [tube, paths, paints, colorBlind],
  );
  const transform = useDerivedValue<Transforms3d>(() => {
    const offset = tubeOffset(lift, index);
    return [{ translateX: x + offset.x }, { translateY: y + offset.y }];
  }, [index, x, y]);
  const back = useDerivedValue(
    () => (isOwned(ownedMask.get(), index) ? empty : glass.back),
    [index, glass, empty],
  );
  const content = useDerivedValue(
    () => (isOwned(ownedMask.get(), index) ? empty : liquid),
    [index, liquid, empty],
  );
  const front = useDerivedValue(
    () => (isOwned(ownedMask.get(), index) ? empty : glass.front),
    [index, glass, empty],
  );

  return (
    <Group transform={transform}>
      <Picture picture={back} />
      <Picture picture={content} />
      <Picture picture={front} />
    </Group>
  );
};

export const TubeLayer = memo(TubeLayerComponent);
