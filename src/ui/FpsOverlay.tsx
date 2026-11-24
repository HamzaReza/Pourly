import { Canvas, matchFont, RoundedRect, Text } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';

import { useFrameRate } from '@/utils/perf';

const WIDTH = 76;
const HEIGHT = 24;

/**
 * Dev-only frame-rate readout (spec §8.5.9). Drawn with Skia from a UI-thread shared value, so it
 * never re-renders React while measuring. Render it only when `__DEV__`.
 */
const FpsOverlayComponent = () => {
  const fps = useFrameRate(true);
  const font = useMemo(() => matchFont({ fontFamily: 'monospace', fontSize: 13 }), []);
  const label = useDerivedValue(() => `${Math.round(fps.get())} fps`);
  const color = useDerivedValue(() => {
    const value = fps.get();
    if (value >= 55) return '#7ED957';
    if (value >= 45) return '#FFD60A';
    return '#FF4D6D';
  });
  return (
    <Canvas style={styles.canvas} pointerEvents="none">
      <RoundedRect x={0} y={0} width={WIDTH} height={HEIGHT} r={6} color="rgba(0,0,0,0.6)" />
      <Text x={8} y={17} text={label} font={font} color={color} />
    </Canvas>
  );
};

export const FpsOverlay = memo(FpsOverlayComponent);

const styles = StyleSheet.create({
  canvas: {
    width: WIDTH,
    height: HEIGHT,
  },
});
