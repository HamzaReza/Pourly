/**
 * Color-blind symbols (spec §8.3): one shape per palette color, drawn at 70% opacity in the middle
 * of each segment (white, or dark slate on the three lightest colors; see `palette.ts`), plus the "?" glyph of mystery segments. Every shape is built as a Skia
 * path once per size and cached; paths are centered on (0, 0).
 */
import { FillType, PathOp, StrokeCap, StrokeJoin } from '@shopify/react-native-skia';
import type { SkPath, SkPathBuilder } from '@shopify/react-native-skia';

import { PALETTE_SIZE } from '@/config/game';

import type { SkiaApi } from './skiaApi';

export type SymbolName =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'plus'
  | 'cross'
  | 'heart'
  | 'moon'
  | 'drop'
  | 'hexagon'
  | 'pentagon'
  | 'bolt'
  | 'ring';

/** Symbol per palette id, in palette order. */
export const SYMBOL_NAMES: readonly SymbolName[] = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'star',
  'plus',
  'cross',
  'heart',
  'moon',
  'drop',
  'hexagon',
  'pentagon',
  'bolt',
  'ring',
];

export const SYMBOL_OPACITY = 0.7;

if (SYMBOL_NAMES.length !== PALETTE_SIZE) {
  throw new Error(`Expected ${PALETTE_SIZE} symbols, got ${SYMBOL_NAMES.length}`);
}

type Point = readonly [number, number];

/** Points of a regular polygon of radius `r`, first vertex straight up. */
const regularPolygon = (sides: number, r: number, rotation = 0): Point[] =>
  Array.from({ length: sides }, (_, i) => {
    const angle = -Math.PI / 2 + rotation + (i * 2 * Math.PI) / sides;
    return [Math.cos(angle) * r, Math.sin(angle) * r] as const;
  });

const addPolygon = (
  builder: SkPathBuilder,
  skia: SkiaApi,
  points: readonly Point[],
): SkPathBuilder =>
  builder.addPoly(
    points.map(([x, y]) => skia.Point(x, y)),
    true,
  );

const polygonPath = (skia: SkiaApi, points: readonly Point[]): SkPath =>
  addPolygon(skia.PathBuilder.Make(), skia, points).build();

/** Plus sign of half-size `r` and arm half-thickness `t`. */
const plusPoints = (r: number, t: number): Point[] => [
  [-t, -r],
  [t, -r],
  [t, -t],
  [r, -t],
  [r, t],
  [t, t],
  [t, r],
  [-t, r],
  [-t, t],
  [-r, t],
  [-r, -t],
  [-t, -t],
];

const rotatePoints = (points: readonly Point[], angle: number): Point[] => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return points.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos] as const);
};

const starPoints = (r: number): Point[] => {
  const inner = r * 0.45;
  return Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
  });
};

const heartPath = (skia: SkiaApi, r: number): SkPath =>
  skia.PathBuilder.Make()
    .moveTo(0, r * 0.95)
    .cubicTo(-r * 1.25, r * 0.1, -r * 0.95, -r * 0.95, 0, -r * 0.45)
    .cubicTo(r * 0.95, -r * 0.95, r * 1.25, r * 0.1, 0, r * 0.95)
    .close()
    .build();

const dropPath = (skia: SkiaApi, r: number): SkPath =>
  skia.PathBuilder.Make()
    .moveTo(0, -r)
    .cubicTo(r * 0.35, -r * 0.45, r * 0.78, -r * 0.05, r * 0.78, r * 0.3)
    .cubicTo(r * 0.78, r * 0.75, r * 0.42, r, 0, r)
    .cubicTo(-r * 0.42, r, -r * 0.78, r * 0.75, -r * 0.78, r * 0.3)
    .cubicTo(-r * 0.78, -r * 0.05, -r * 0.35, -r * 0.45, 0, -r)
    .close()
    .build();

const moonPath = (skia: SkiaApi, r: number): SkPath => {
  const disc = skia.Path.Circle(0, 0, r * 0.9);
  const bite = skia.Path.Circle(r * 0.42, -r * 0.3, r * 0.75);
  return skia.Path.MakeFromOp(disc, bite, PathOp.Difference) ?? disc;
};

const ringPath = (skia: SkiaApi, r: number): SkPath =>
  skia.PathBuilder.Make()
    .addCircle(0, 0, r * 0.9)
    .addCircle(0, 0, r * 0.5)
    .setFillType(FillType.EvenOdd)
    .build();

const boltPoints = (r: number): Point[] => [
  [r * 0.2, -r],
  [-r * 0.62, r * 0.12],
  [-r * 0.05, r * 0.12],
  [-r * 0.22, r],
  [r * 0.62, -r * 0.14],
  [r * 0.05, -r * 0.14],
];

/** Builds one symbol whose shape fits a circle of radius `r` around (0, 0). */
export const buildSymbolPath = (skia: SkiaApi, name: SymbolName, r: number): SkPath => {
  switch (name) {
    case 'circle':
      return skia.Path.Circle(0, 0, r * 0.85);
    case 'square':
      return skia.Path.Rect(skia.XYWHRect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44));
    case 'triangle':
      return polygonPath(
        skia,
        regularPolygon(3, r).map(([x, y]) => [x, y + r * 0.15] as const),
      );
    case 'diamond':
      return polygonPath(skia, [
        [0, -r],
        [r * 0.75, 0],
        [0, r],
        [-r * 0.75, 0],
      ]);
    case 'star':
      return polygonPath(skia, starPoints(r));
    case 'plus':
      return polygonPath(skia, plusPoints(r * 0.92, r * 0.3));
    case 'cross':
      return polygonPath(skia, rotatePoints(plusPoints(r, r * 0.28), Math.PI / 4));
    case 'heart':
      return heartPath(skia, r);
    case 'moon':
      return moonPath(skia, r);
    case 'drop':
      return dropPath(skia, r);
    case 'hexagon':
      return polygonPath(skia, regularPolygon(6, r * 0.92, Math.PI / 6));
    case 'pentagon':
      return polygonPath(skia, regularPolygon(5, r * 0.95));
    case 'bolt':
      return polygonPath(skia, boltPoints(r));
    case 'ring':
      return ringPath(skia, r);
  }
};

/** "?" glyph for mystery segments, as a filled outline (no fonts), fitting a circle of radius `r`. */
export const buildQuestionMarkPath = (skia: SkiaApi, r: number): SkPath => {
  const thickness = r * 0.32;
  const hook = skia.PathBuilder.Make()
    .moveTo(-r * 0.5, -r * 0.45)
    .cubicTo(-r * 0.5, -r * 0.95, r * 0.55, -r * 1.0, r * 0.52, -r * 0.4)
    .cubicTo(r * 0.5, -r * 0.05, 0, r * 0.02, 0, r * 0.32)
    .build();
  const stroked =
    skia.Path.Stroke(hook, {
      width: thickness,
      cap: StrokeCap.Round,
      join: StrokeJoin.Round,
    }) ?? hook;
  return skia.PathBuilder.MakeFromPath(stroked)
    .addCircle(0, r * 0.78, thickness * 0.62)
    .build();
};

/** Sizes are cached on a half-dp grid so tiny layout differences reuse the same paths. */
const sizeKey = (radius: number): number => Math.round(radius * 2) / 2;

interface SymbolCache {
  readonly symbols: Map<number, readonly SkPath[]>;
  readonly questionMarks: Map<number, SkPath>;
}

const caches = new WeakMap<SkiaApi, SymbolCache>();

const cacheFor = (skia: SkiaApi): SymbolCache => {
  const existing = caches.get(skia);
  if (existing !== undefined) return existing;
  const created: SymbolCache = { symbols: new Map(), questionMarks: new Map() };
  caches.set(skia, created);
  return created;
};

/** All 14 symbol paths for one radius (built once per radius, then cached). */
export const getSymbolPaths = (skia: SkiaApi, radius: number): readonly SkPath[] => {
  const key = sizeKey(radius);
  const cache = cacheFor(skia);
  const cached = cache.symbols.get(key);
  if (cached !== undefined) return cached;
  const built = SYMBOL_NAMES.map((name) => buildSymbolPath(skia, name, key));
  cache.symbols.set(key, built);
  return built;
};

/** Symbol path for palette id `colorId` at `radius`. */
export const getSymbolPath = (skia: SkiaApi, colorId: number, radius: number): SkPath => {
  const paths = getSymbolPaths(skia, radius);
  const path = paths[((colorId % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE];
  if (path === undefined) throw new Error(`No symbol for color ${colorId}`);
  return path;
};

export const getQuestionMarkPath = (skia: SkiaApi, radius: number): SkPath => {
  const key = sizeKey(radius);
  const cache = cacheFor(skia);
  const cached = cache.questionMarks.get(key);
  if (cached !== undefined) return cached;
  const built = buildQuestionMarkPath(skia, key);
  cache.questionMarks.set(key, built);
  return built;
};
