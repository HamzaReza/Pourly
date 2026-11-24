import { Group, Picture, type Transforms3d } from '@shopify/react-native-skia';
import { memo } from 'react';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import type { Tube } from '@/game/types';

import { SELECTION_LIFT } from './layout';
import { Liquid } from './Liquid';
import type { GlassPictures, LiquidPaints, TubePaths } from './scene';

/** UI-thread lift state shared by every tube: one tube rising, one settling back down. */
export interface LiftState {
  /** Selected tube index, or -1. */
  readonly upIndex: SharedValue<number>;
  /** 0 → 1 lift of the selected tube (springs past 1 briefly). */
  readonly upProgress: SharedValue<number>;
  /** Tube that is settling after a deselect, or -1. */
  readonly downIndex: SharedValue<number>;
  readonly downProgress: SharedValue<number>;
}

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
}

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
}: TubeLayerProps) => {
  const { upIndex, upProgress, downIndex, downProgress } = lift;
  const transform = useDerivedValue<Transforms3d>(() => {
    const rising = upIndex.get() === index ? upProgress.get() : 0;
    const settling = downIndex.get() === index ? downProgress.get() : 0;
    return [{ translateX: x }, { translateY: y - (rising + settling) * SELECTION_LIFT }];
  }, [index, x, y]);

  return (
    <Group transform={transform}>
      <Picture picture={glass.back} />
      <Liquid tube={tube} paths={paths} paints={paints} colorBlind={colorBlind} />
      <Picture picture={glass.front} />
    </Group>
  );
};

export const TubeLayer = memo(TubeLayerComponent);
