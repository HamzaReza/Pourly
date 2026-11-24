import { Picture, Skia } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';

import type { Tube } from '@/game/types';

import { recordLiquid, type LiquidPaints, type TubePaths } from './scene';

export interface LiquidProps {
  tube: Tube;
  paths: TubePaths;
  paints: LiquidPaints;
  colorBlind: boolean;
}

/**
 * The liquid of one tube as a cached picture. It is re-recorded only when this tube's segments
 * change (boards share untouched tubes), the layout changes, or color-blind mode toggles.
 */
const LiquidComponent = ({ tube, paths, paints, colorBlind }: LiquidProps) => {
  const picture = useMemo(
    () => recordLiquid(Skia, tube, paths, paints, colorBlind),
    [tube, paths, paints, colorBlind],
  );
  return <Picture picture={picture} />;
};

export const Liquid = memo(LiquidComponent);
