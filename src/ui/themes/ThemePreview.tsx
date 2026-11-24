import { Canvas, Picture, Skia } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';

import { recordThemePreview } from '@/render/themePreview';
import type { Theme } from '@/render/themes';

export interface ThemePreviewProps {
  theme: Theme;
  width: number;
  height: number;
}

/** A theme's gradient with three mini tubes: one recorded picture on a small canvas. */
const ThemePreviewComponent = ({ theme, width, height }: ThemePreviewProps) => {
  const picture = useMemo(
    () => recordThemePreview(Skia, theme, { width, height }),
    [theme, width, height],
  );
  return (
    <Canvas style={[styles.canvas, { width, height }]} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
};

export const ThemePreview = memo(ThemePreviewComponent);

const styles = StyleSheet.create({
  canvas: {
    direction: 'ltr',
  },
});
