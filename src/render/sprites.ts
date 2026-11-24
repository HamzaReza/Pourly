/**
 * One sprite sheet for every particle effect (confetti, sparkles, bubbles), recorded once as a
 * picture and turned into a texture. Particles are drawn with Skia's atlas from preallocated
 * transforms, so effects allocate nothing per frame. Pure: takes the Skia API object.
 */
import { BlurStyle, PaintStyle } from '@shopify/react-native-skia';
import type { SkPicture, SkRect } from '@shopify/react-native-skia';

import { PALETTE_SIZE } from '@/config/game';

import { LIQUID_COLORS } from './palette';
import type { SkiaApi } from './skiaApi';

/** Texture pixels per dp; particles draw at `1 / SPRITE_SCALE` so they stay sharp. */
export const SPRITE_SCALE = 3;

/** Sprite sizes in dp. */
export const CONFETTI_SIZE = { width: 7, height: 11 } as const;
export const SPARKLE_SIZE = 14;
export const BUBBLE_SIZE = 26;

const GAP = 2;

export interface SpriteSheet {
  readonly picture: SkPicture;
  /** Texture size in pixels. */
  readonly width: number;
  readonly height: number;
  /** Source rects in texture pixels. */
  readonly confetti: readonly SkRect[];
  readonly sparkle: SkRect;
  readonly bubble: SkRect;
}

const sparklePath = (skia: SkiaApi, cx: number, cy: number, radius: number) => {
  const inner = radius * 0.28;
  const builder = skia.PathBuilder.Make();
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI / 4) * i - Math.PI / 2;
    const r = i % 2 === 0 ? radius : inner;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) builder.moveTo(x, y);
    else builder.lineTo(x, y);
  }
  return builder.close().build();
};

export const recordSprites = (skia: SkiaApi): SpriteSheet => {
  const s = SPRITE_SCALE;
  const confettiW = CONFETTI_SIZE.width * s;
  const confettiH = CONFETTI_SIZE.height * s;
  const gap = GAP * s;
  const sparkle = SPARKLE_SIZE * s;
  const bubble = BUBBLE_SIZE * s;
  const rowWidth = PALETTE_SIZE * (confettiW + gap);
  const width = Math.ceil(Math.max(rowWidth, sparkle + gap + bubble));
  const height = Math.ceil(confettiH + gap + Math.max(sparkle, bubble));

  const confetti: SkRect[] = [];
  const sparkleRect = skia.XYWHRect(0, confettiH + gap, sparkle, sparkle);
  const bubbleRect = skia.XYWHRect(sparkle + gap, confettiH + gap, bubble, bubble);

  const recorder = skia.PictureRecorder();
  const canvas = recorder.beginRecording(skia.XYWHRect(0, 0, width, height));
  const paint = skia.Paint();
  paint.setAntiAlias(true);

  LIQUID_COLORS.forEach((color, index) => {
    const x = index * (confettiW + gap);
    paint.setColor(skia.Color(color.base));
    canvas.drawRRect(
      skia.RRectXY(skia.XYWHRect(x, 0, confettiW, confettiH), 1.5 * s, 1.5 * s),
      paint,
    );
    confetti.push(skia.XYWHRect(x, 0, confettiW, confettiH));
  });

  const glow = skia.Paint();
  glow.setAntiAlias(true);
  glow.setColor(skia.Color('#FFF3B0'));
  glow.setAlphaf(0.55);
  glow.setMaskFilter(skia.MaskFilter.MakeBlur(BlurStyle.Normal, 1.2 * s, true));
  const centerX = sparkle / 2;
  const centerY = confettiH + gap + sparkle / 2;
  canvas.drawPath(sparklePath(skia, centerX, centerY, sparkle * 0.46), glow);
  paint.setColor(skia.Color('#FFFFFF'));
  canvas.drawPath(sparklePath(skia, centerX, centerY, sparkle * 0.4), paint);

  const bubbleCx = sparkle + gap + bubble / 2;
  const bubbleCy = confettiH + gap + bubble / 2;
  const radius = bubble / 2 - s;
  paint.setColor(skia.Color('#FFFFFF'));
  paint.setAlphaf(0.07);
  canvas.drawCircle(bubbleCx, bubbleCy, radius, paint);
  const rim = skia.Paint();
  rim.setAntiAlias(true);
  rim.setStyle(PaintStyle.Stroke);
  rim.setStrokeWidth(1.2 * s);
  rim.setColor(skia.Color('#FFFFFF'));
  rim.setAlphaf(0.28);
  canvas.drawCircle(bubbleCx, bubbleCy, radius, rim);
  paint.setAlphaf(0.4);
  canvas.drawCircle(bubbleCx - radius * 0.38, bubbleCy - radius * 0.38, radius * 0.18, paint);

  return {
    picture: recorder.finishRecordingAsPicture(),
    width,
    height,
    confetti,
    sparkle: sparkleRect,
    bubble: bubbleRect,
  };
};
