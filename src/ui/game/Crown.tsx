import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { colors } from '@/ui/tokens';

const CROWN_SVG = 'M1 13 L3 3 L7.5 8 L11 1 L14.5 8 L19 3 L21 13 Z';

/** Crown badge for hard levels, drawn with Skia (decorative; the title label says "hard"). */
const CrownComponent = () => {
  const path = useMemo(() => Skia.Path.MakeFromSVGString(CROWN_SVG), []);
  if (path === null) return null;
  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      <Path path={path} color={colors.coin} />
      <Path path={path} color={colors.coinRim} style="stroke" strokeWidth={1.2} />
    </Canvas>
  );
};

export const Crown = memo(CrownComponent);

const styles = StyleSheet.create({
  canvas: {
    width: 22,
    height: 14,
  },
});
