/**
 * Pure Skia builders for the board (spec §8.3, §8.5). Every function takes the Skia API object as
 * a parameter, so the same code runs in the app and in a headless CanvasKit script. Paths, paints,
 * shaders and pictures are built here once per layout/theme and never per frame.
 *
 * Coordinates: tube-local pictures are drawn with the tube's top-left corner at (0, 0); segment
 * paths are local to one segment (top edge at y = 0).
 */
import { BlurStyle, ClipOp, PaintStyle, PathOp, TileMode } from '@shopify/react-native-skia';
import type { SkCanvas, SkPaint, SkPath, SkPicture, SkRect } from '@shopify/react-native-skia';

import { isComplete } from '@/game/rules';
import type { Tube } from '@/game/types';

import { tubeLip, type BoardLayout } from './layout';
import { HIDDEN_COLORS, LIQUID_COLORS, liquidColor } from './palette';
import type { SkiaApi } from './skiaApi';
import { getQuestionMarkPath, getSymbolPath, SYMBOL_OPACITY } from './symbols';
import type { Theme, TubeStyle } from './themes';

export interface TubeGeometry {
  readonly width: number;
  readonly height: number;
  readonly segmentHeight: number;
  readonly wall: number;
  readonly capacity: number;
}

export interface TubePaths {
  readonly geometry: TubeGeometry;
  /** Outer glass silhouette: open top, rounded bottom. */
  readonly outline: SkPath;
  /** Liquid interior: the outline inset by the wall. */
  readonly interior: SkPath;
  /** Glass wall (outline minus interior). */
  readonly glass: SkPath;
  readonly lip: SkPath;
  readonly highlight: SkPath;
  /** Segment-local rounded rect used for every segment but the bottom one. */
  readonly segment: SkPath;
  /** Segment-local bottom segment, following the rounded bottom. */
  readonly bottomSegment: SkPath;
  readonly surface: SkRect;
  readonly cap: SkPath;
  readonly capShine: SkPath;
  readonly bounds: SkRect;
}

export interface GlassPictures {
  /** Drawn behind the liquid: glass tint. */
  readonly back: SkPicture;
  /** Drawn over the liquid: inner shadow, wall, rim, highlight strip, lip. */
  readonly front: SkPicture;
}

export interface LiquidPaints {
  readonly fills: readonly SkPaint[];
  readonly strokes: readonly SkPaint[];
  readonly caps: readonly SkPaint[];
  readonly hiddenFill: SkPaint;
  readonly hiddenStroke: SkPaint;
  readonly glyph: SkPaint;
  readonly symbols: readonly SkPaint[];
  readonly surface: SkPaint;
  readonly shine: SkPaint;
}

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

/** Stroke width and blur sigma of the selection glow ring. */
export const GLOW_STROKE = 5;
export const GLOW_BLUR = 6;
const SEGMENT_STROKE_ALPHA = 0.6;
/** Opacity of the white surface highlight on the top segment. */
export const SURFACE_ALPHA = 0.28;

export const geometryOf = (layout: BoardLayout, capacity: number): TubeGeometry => ({
  width: layout.tubeWidth,
  height: layout.tubeHeight,
  segmentHeight: layout.segmentHeight,
  wall: layout.wall,
  capacity,
});

const fill = (skia: SkiaApi, color: string, alpha = 1): SkPaint => {
  const paint = skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(skia.Color(color));
  paint.setAlphaf(alpha);
  return paint;
};

const stroke = (skia: SkiaApi, color: string, width: number, alpha = 1): SkPaint => {
  const paint = fill(skia, color, alpha);
  paint.setStyle(PaintStyle.Stroke);
  paint.setStrokeWidth(width);
  return paint;
};

const record = (skia: SkiaApi, bounds: SkRect, draw: (canvas: SkCanvas) => void): SkPicture => {
  const recorder = skia.PictureRecorder();
  draw(recorder.beginRecording(bounds));
  return recorder.finishRecordingAsPicture();
};

/** Open-top tube with a semicircular bottom, top-left at (x, y). */
const tubeShape = (skia: SkiaApi, x: number, y: number, width: number, height: number): SkPath => {
  const radius = width / 2;
  return skia.PathBuilder.Make()
    .moveTo(x, y)
    .lineTo(x, y + height - radius)
    .arcToOval(skia.XYWHRect(x, y + height - 2 * radius, width, 2 * radius), 180, -180, false)
    .lineTo(x + width, y)
    .close()
    .build();
};

const roundedRect = (
  skia: SkiaApi,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): SkPath => skia.Path.RRect(skia.RRectXY(skia.XYWHRect(x, y, width, height), radius, radius));

const offsetPath = (skia: SkiaApi, path: SkPath, dx: number, dy: number): SkPath =>
  skia.PathBuilder.MakeFromPath(path).offset(dx, dy).build();

export const buildTubePaths = (skia: SkiaApi, geometry: TubeGeometry): TubePaths => {
  const { width, height, segmentHeight, wall } = geometry;
  const innerWidth = width - 2 * wall;
  const outline = tubeShape(skia, 0, 0, width, height);
  const interior = tubeShape(skia, wall, 0, innerWidth, height - wall);
  const glass = skia.Path.MakeFromOp(outline, interior, PathOp.Difference) ?? outline;
  const { overhang, rise, height: lipHeight } = tubeLip(wall);
  const lip = roundedRect(skia, -overhang, -rise, width + overhang * 2, lipHeight, lipHeight / 2);
  const highlightWidth = Math.max(2, innerWidth * 0.12);
  const highlight = roundedRect(
    skia,
    wall + innerWidth * 0.1,
    height * 0.07,
    highlightWidth,
    Math.max(4, height - width / 2 - height * 0.1),
    highlightWidth / 2,
  );
  const segmentRadius = Math.min(3, segmentHeight * 0.12);
  const segment = roundedRect(skia, wall, 0, innerWidth, segmentHeight, segmentRadius);
  const bottomTop = height - wall - segmentHeight;
  const bottomSlot = skia.Path.Rect(skia.XYWHRect(wall, bottomTop, innerWidth, segmentHeight));
  const bottomInTube = skia.Path.MakeFromOp(interior, bottomSlot, PathOp.Intersect) ?? bottomSlot;
  const bottomSegment = offsetPath(skia, bottomInTube, 0, -bottomTop);
  const surface = skia.XYWHRect(
    wall + innerWidth * 0.18,
    segmentHeight * 0.06,
    innerWidth * 0.64,
    Math.max(2, segmentHeight * 0.16),
  );
  const capHeight = Math.min(12, Math.max(5, width * 0.2));
  const capWidth = width + wall * 2.4;
  const cap = roundedRect(
    skia,
    -wall * 1.2,
    -capHeight * 0.7,
    capWidth,
    capHeight,
    capHeight * 0.45,
  );
  const capShine = roundedRect(
    skia,
    -wall * 1.2 + capWidth * 0.12,
    -capHeight * 0.6,
    capWidth * 0.76,
    capHeight * 0.28,
    capHeight * 0.14,
  );
  const bounds = skia.XYWHRect(-width, -height * 0.5, width * 3, height * 2);
  return {
    geometry,
    outline,
    interior,
    glass,
    lip,
    highlight,
    segment,
    bottomSegment,
    surface,
    cap,
    capShine,
    bounds,
  };
};

/** Static glass layers for one theme; every tube draws the same two pictures. */
export const recordGlass = (skia: SkiaApi, paths: TubePaths, style: TubeStyle): GlassPictures => {
  const { wall } = paths.geometry;
  const back = record(skia, paths.bounds, (canvas) => {
    canvas.drawPath(paths.interior, fill(skia, style.glassTint, style.glassOpacity));
  });
  const front = record(skia, paths.bounds, (canvas) => {
    const innerShadow = stroke(skia, '#000000', wall * 3, style.innerShadowOpacity);
    innerShadow.setMaskFilter(skia.MaskFilter.MakeBlur(BlurStyle.Normal, wall * 1.2, true));
    canvas.save();
    canvas.clipPath(paths.interior, ClipOp.Intersect, true);
    canvas.drawPath(paths.interior, innerShadow);
    canvas.restore();
    canvas.drawPath(paths.glass, fill(skia, style.rimColor, style.rimOpacity * 0.6));
    canvas.drawPath(paths.outline, stroke(skia, style.rimColor, 1, style.rimOpacity));
    canvas.drawPath(paths.highlight, fill(skia, '#FFFFFF', style.highlightOpacity));
    canvas.drawPath(paths.lip, fill(skia, style.rimColor, Math.min(1, style.rimOpacity + 0.12)));
  });
  return { back, front };
};

const gradientFill = (
  skia: SkiaApi,
  colors: readonly [string, string, string],
  segmentHeight: number,
): SkPaint => {
  const paint = skia.Paint();
  paint.setAntiAlias(true);
  paint.setShader(
    skia.Shader.MakeLinearGradient(
      skia.Point(0, 0),
      skia.Point(0, segmentHeight),
      colors.map((color) => skia.Color(color)),
      [0, 0.5, 1],
      TileMode.Clamp,
    ),
  );
  return paint;
};

/** Segment paints for one geometry; independent of theme and color-blind mode. */
export const createLiquidPaints = (skia: SkiaApi, geometry: TubeGeometry): LiquidPaints => {
  const { segmentHeight } = geometry;
  return {
    fills: LIQUID_COLORS.map((color) =>
      gradientFill(skia, [color.light, color.base, color.dark], segmentHeight),
    ),
    strokes: LIQUID_COLORS.map((color) => stroke(skia, color.stroke, 2, SEGMENT_STROKE_ALPHA)),
    caps: LIQUID_COLORS.map((color) => fill(skia, color.dark)),
    hiddenFill: gradientFill(
      skia,
      [HIDDEN_COLORS.light, HIDDEN_COLORS.base, HIDDEN_COLORS.dark],
      segmentHeight,
    ),
    hiddenStroke: stroke(skia, HIDDEN_COLORS.stroke, 2, SEGMENT_STROKE_ALPHA),
    glyph: fill(skia, HIDDEN_COLORS.glyph, 0.9),
    symbols: LIQUID_COLORS.map((color) => fill(skia, color.symbol, SYMBOL_OPACITY)),
    surface: fill(skia, '#FFFFFF', SURFACE_ALPHA),
    shine: fill(skia, '#FFFFFF', 0.3),
  };
};

const paintAt = (paints: readonly SkPaint[], index: number): SkPaint => {
  const paint = paints[index];
  if (paint === undefined) throw new Error(`No paint for color ${index}`);
  return paint;
};

export interface LiquidOptions {
  /** Draw the cap when the tube is complete (default true). */
  readonly cap?: boolean;
  /** Draw the elliptical highlight on the top surface (default true). */
  readonly surface?: boolean;
  /** Segment range to draw, `[from, to)`; defaults to the whole tube. */
  readonly from?: number;
  readonly to?: number;
}

/**
 * Liquid, mystery tiles, symbols and the cap of one tube, recorded once per tube content.
 * Boards share untouched tubes, so a pour re-records only the two tubes it changed. The pour
 * layer records partial variants (no cap, no surface, a single segment) once per pour.
 */
export const recordLiquid = (
  skia: SkiaApi,
  tube: Tube,
  paths: TubePaths,
  paints: LiquidPaints,
  colorBlind: boolean,
  options: LiquidOptions = {},
): SkPicture =>
  record(skia, paths.bounds, (canvas) => {
    const { width, height, segmentHeight, wall, capacity } = paths.geometry;
    const from = Math.max(0, options.from ?? 0);
    const to = Math.min(tube.length, options.to ?? tube.length);
    const innerWidth = width - 2 * wall;
    const centerX = width / 2;
    const markRadius = Math.min(innerWidth, segmentHeight) * 0.28;
    canvas.save();
    canvas.clipPath(paths.interior, ClipOp.Intersect, true);
    for (let index = from; index < to; index += 1) {
      const segment = tube[index];
      if (segment === undefined) continue;
      const shape = index === 0 ? paths.bottomSegment : paths.segment;
      const color = liquidColor(segment.color);
      canvas.save();
      canvas.translate(0, height - wall - (index + 1) * segmentHeight);
      canvas.drawPath(shape, segment.hidden ? paints.hiddenFill : paintAt(paints.fills, color.id));
      canvas.save();
      canvas.clipPath(shape, ClipOp.Intersect, true);
      canvas.drawPath(
        shape,
        segment.hidden ? paints.hiddenStroke : paintAt(paints.strokes, color.id),
      );
      canvas.restore();
      canvas.translate(centerX, segmentHeight / 2);
      if (segment.hidden) {
        canvas.drawPath(getQuestionMarkPath(skia, markRadius), paints.glyph);
      } else if (colorBlind) {
        canvas.drawPath(
          getSymbolPath(skia, color.id, markRadius),
          paintAt(paints.symbols, color.id),
        );
      }
      canvas.restore();
    }
    if ((options.surface ?? true) && to > 0 && to === tube.length) {
      canvas.save();
      canvas.translate(0, height - wall - tube.length * segmentHeight);
      canvas.drawOval(paths.surface, paints.surface);
      canvas.restore();
    }
    canvas.restore();
    const top = tube[tube.length - 1];
    if ((options.cap ?? true) && top !== undefined && isComplete(tube, capacity)) {
      drawCap(canvas, paths, paints, top.color);
    }
  });

const drawCap = (canvas: SkCanvas, paths: TubePaths, paints: LiquidPaints, color: number) => {
  canvas.drawPath(paths.cap, paintAt(paints.caps, liquidColor(color).id));
  canvas.drawPath(paths.capShine, paints.shine);
};

/** The cap of a completed tube in `color`, alone (tube-local coordinates). */
export const recordCap = (
  skia: SkiaApi,
  paths: TubePaths,
  paints: LiquidPaints,
  color: number,
): SkPicture => record(skia, paths.bounds, (canvas) => drawCap(canvas, paths, paints, color));

/** Background gradient plus the soft shadow under every resting tube. */
export const recordBackground = (
  skia: SkiaApi,
  size: CanvasSize,
  theme: Theme,
  layout: BoardLayout,
): SkPicture =>
  record(skia, skia.XYWHRect(0, 0, size.width, size.height), (canvas) => {
    const stops = theme.background;
    const background = skia.Paint();
    background.setShader(
      skia.Shader.MakeLinearGradient(
        skia.Point(0, 0),
        skia.Point(0, size.height),
        stops.map((color) => skia.Color(color)),
        stops.map((_, index) => (stops.length > 1 ? index / (stops.length - 1) : 0)),
        TileMode.Clamp,
      ),
    );
    canvas.drawRect(skia.XYWHRect(0, 0, size.width, size.height), background);
    const shadow = fill(skia, '#000000', theme.tube.shadowOpacity);
    shadow.setMaskFilter(skia.MaskFilter.MakeBlur(BlurStyle.Normal, 3, true));
    layout.tubes.forEach(({ drawn }) => {
      canvas.drawOval(
        skia.XYWHRect(
          drawn.x + drawn.width * 0.1,
          drawn.y + drawn.height - 3,
          drawn.width * 0.8,
          8,
        ),
        shadow,
      );
    });
  });

/** Glow ring paint (used by the headless renderer; the app draws the same ring declaratively). */
export const createGlowPaint = (skia: SkiaApi, color: string, alpha = 1): SkPaint => {
  const paint = stroke(skia, color, GLOW_STROKE, alpha);
  paint.setMaskFilter(skia.MaskFilter.MakeBlur(BlurStyle.Normal, GLOW_BLUR, true));
  return paint;
};
