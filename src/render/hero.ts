/**
 * The Home hero: three small tubes pouring in an endless loop, built from the board's own scene
 * builders and pour planner. Pure: takes the Skia API object, so the headless renderer draws the
 * same frames. Everything is recorded once per theme; the loop itself only moves numbers.
 *
 * The six pours are all legal moves and bring the board back to its starting state, so the loop
 * has no visible reset:
 *   A=RRR B=– C=TTT → A→B, C→A, B→C → A=TTT B=– C=RRR → A→B, C→A, B→C → start.
 */
import type { SkPicture } from '@shopify/react-native-skia';

import { applyPour } from '@/game/rules';
import type { Board, Move, Tube } from '@/game/types';

import { computeBoardLayout, type BoardLayout } from './layout';
import { preparePour, type PreparedPour } from './pourPictures';
import {
  buildTubePaths,
  createLiquidPaints,
  geometryOf,
  recordGlass,
  recordLiquid,
  type CanvasSize,
  type GlassPictures,
  type LiquidPaints,
  type TubePaths,
} from './scene';
import type { SkiaApi } from './skiaApi';
import type { Theme } from './themes';

export const HERO_SIZE: CanvasSize = { width: 220, height: 150 };
export const HERO_CAPACITY = 4;
/** Pause before each pour. */
export const HERO_GAP_MS = 520;

/** Palette ids of the two liquids (rose and teal). */
const HERO_COLORS = [0, 4] as const;

const run = (color: number, count: number): Tube =>
  Array.from({ length: count }, () => ({ color, hidden: false }));

export const HERO_START: Board = {
  tubes: [run(HERO_COLORS[0], 3), [], run(HERO_COLORS[1], 3)],
  capacity: HERO_CAPACITY,
};

export const HERO_MOVES: readonly Move[] = [
  { from: 0, to: 1 },
  { from: 2, to: 0 },
  { from: 1, to: 2 },
  { from: 0, to: 1 },
  { from: 2, to: 0 },
  { from: 1, to: 2 },
];

/** Every board of the loop: `boards[k]` is the board after `k` pours (the last equals the first). */
export const heroBoards = (): readonly Board[] => {
  const boards: Board[] = [HERO_START];
  for (const move of HERO_MOVES) {
    const last = boards[boards.length - 1] ?? HERO_START;
    boards.push(applyPour(last, move).board);
  }
  return boards;
};

export interface HeroScene {
  readonly size: CanvasSize;
  readonly layout: BoardLayout;
  readonly paths: TubePaths;
  readonly glass: GlassPictures;
  readonly paints: LiquidPaints;
  readonly empty: SkPicture;
  /** Resting liquid per board of the loop, per tube (`states[k][tube]`). */
  readonly states: readonly (readonly SkPicture[])[];
  readonly pours: readonly PreparedPour[];
  /** Start (ms on the loop clock) and length of each pour. */
  readonly starts: readonly number[];
  readonly totals: readonly number[];
  readonly cycleMs: number;
}

/** Area the three tubes sit in: the upper part is left free for the tilted, travelling tube. */
export const heroArea = (size: CanvasSize) => ({
  x: size.width * 0.12,
  y: size.height * 0.34,
  width: size.width * 0.76,
  height: size.height * 0.64,
});

const recordEmpty = (skia: SkiaApi): SkPicture => {
  const recorder = skia.PictureRecorder();
  recorder.beginRecording(skia.XYWHRect(0, 0, 1, 1));
  return recorder.finishRecordingAsPicture();
};

export const buildHeroScene = (
  skia: SkiaApi,
  theme: Theme,
  colorBlind: boolean,
  size: CanvasSize = HERO_SIZE,
): HeroScene => {
  const layout = computeBoardLayout({
    area: heroArea(size),
    tubeCount: HERO_START.tubes.length,
    capacity: HERO_CAPACITY,
  });
  const geometry = geometryOf(layout, HERO_CAPACITY);
  const paths = buildTubePaths(skia, geometry);
  const glass = recordGlass(skia, paths, theme.tube);
  const paints = createLiquidPaints(skia, geometry);
  const empty = recordEmpty(skia);
  const boards = heroBoards();
  const states = boards.map((board) =>
    board.tubes.map((tube) => recordLiquid(skia, tube, paths, paints, colorBlind)),
  );
  const pours: PreparedPour[] = [];
  HERO_MOVES.forEach((move, index) => {
    const before = boards[index];
    const after = boards[index + 1];
    if (before === undefined || after === undefined) return;
    const prepared = preparePour(skia, {
      before,
      after,
      move,
      result: applyPour(before, move).result,
      layout,
      paths,
      paints,
      colorBlind,
      canvasWidth: size.width,
      durationScale: 1,
      empty,
    });
    if (prepared !== null) pours.push(prepared);
  });
  const starts: number[] = [];
  const totals: number[] = [];
  let clock = 0;
  for (const pour of pours) {
    clock += HERO_GAP_MS;
    starts.push(clock);
    totals.push(pour.plan.times.total);
    clock += pour.plan.times.total;
  }
  return {
    size,
    layout,
    paths,
    glass,
    paints,
    empty,
    states,
    pours,
    starts,
    totals,
    cycleMs: clock,
  };
};

export interface HeroPhase {
  /** Index of the pour animating at this moment, or -1 between pours. */
  readonly pour: number;
  /** Pours finished so far in this loop (the board index to draw at rest). */
  readonly done: number;
}

/** Where the loop clock is: which pour runs and how many have finished. */
export const heroPhase = (
  starts: readonly number[],
  totals: readonly number[],
  ms: number,
): HeroPhase => {
  'worklet';
  let done = 0;
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index] ?? 0;
    const end = start + (totals[index] ?? 0);
    if (ms < start) break;
    if (ms < end) return { pour: index, done: index };
    done = index + 1;
  }
  return { pour: -1, done };
};
