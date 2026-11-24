/**
 * Theme preview for the Themes screen: the theme's background gradient with three mini tubes,
 * recorded into one picture with the board's own builders. Pure (takes the Skia API object), so
 * the headless renderer draws identical cards.
 */
import type { SkPicture } from '@shopify/react-native-skia';

import type { Board, Tube } from '@/game/types';

import { computeBoardLayout } from './layout';
import {
  buildTubePaths,
  createLiquidPaints,
  geometryOf,
  recordBackground,
  recordGlass,
  recordLiquid,
  type CanvasSize,
} from './scene';
import type { SkiaApi } from './skiaApi';
import type { Theme } from './themes';

const PREVIEW_CAPACITY = 4;

const segments = (...colors: number[]): Tube => colors.map((color) => ({ color, hidden: false }));

/** Two mixed tubes and one completed (capped) tube. */
export const PREVIEW_BOARD: Board = {
  tubes: [segments(5, 0, 0), segments(0, 5, 3), segments(3, 3, 3, 3)],
  capacity: PREVIEW_CAPACITY,
};

export const recordThemePreview = (
  skia: SkiaApi,
  theme: Theme,
  size: CanvasSize,
  colorBlind = false,
): SkPicture => {
  const layout = computeBoardLayout({
    area: {
      x: size.width * 0.14,
      y: size.height * 0.04,
      width: size.width * 0.72,
      height: size.height * 0.92,
    },
    tubeCount: PREVIEW_BOARD.tubes.length,
    capacity: PREVIEW_CAPACITY,
  });
  const geometry = geometryOf(layout, PREVIEW_CAPACITY);
  const paths = buildTubePaths(skia, geometry);
  const glass = recordGlass(skia, paths, theme.tube);
  const paints = createLiquidPaints(skia, geometry);
  const background = recordBackground(skia, size, theme, layout);
  const recorder = skia.PictureRecorder();
  const canvas = recorder.beginRecording(skia.XYWHRect(0, 0, size.width, size.height));
  canvas.drawPicture(background);
  PREVIEW_BOARD.tubes.forEach((tube, index) => {
    const rect = layout.tubes[index]?.drawn;
    if (rect === undefined) return;
    canvas.save();
    canvas.translate(rect.x, rect.y);
    canvas.drawPicture(glass.back);
    canvas.drawPicture(recordLiquid(skia, tube, paths, paints, colorBlind));
    canvas.drawPicture(glass.front);
    canvas.restore();
  });
  return recorder.finishRecordingAsPicture();
};
