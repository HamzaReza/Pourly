/**
 * Pictures and plan for one pour, built once on the JS thread when the pour is committed. Pure:
 * takes the Skia API object, so the headless renderer builds identical frames.
 */
import type { SkPicture } from '@shopify/react-native-skia';

import { isComplete } from '@/game/rules';
import type { Board, Move, PourResult } from '@/game/types';

import { planPour, type PourPlan } from './anim/pour';
import type { BoardLayout } from './layout';
import { recordCap, recordLiquid, type LiquidPaints, type TubePaths } from './scene';
import type { SkiaApi } from './skiaApi';

export interface PourPictureSet {
  readonly source: SkPicture;
  readonly target: SkPicture;
  readonly cap: SkPicture;
  readonly flipHidden: SkPicture;
  readonly flipShown: SkPicture;
}

export interface PreparedPour {
  readonly plan: PourPlan;
  readonly pictures: PourPictureSet;
}

export interface PreparePourInput {
  readonly before: Board;
  readonly after: Board;
  readonly move: Move;
  readonly result: PourResult;
  readonly layout: BoardLayout;
  readonly paths: TubePaths;
  readonly paints: LiquidPaints;
  readonly colorBlind: boolean;
  readonly canvasWidth: number;
  readonly durationScale: number;
  readonly empty: SkPicture;
}

/** Returns null when the move does not match the boards or the layout (nothing to animate). */
export const preparePour = (skia: SkiaApi, input: PreparePourInput): PreparedPour | null => {
  const { before, after, move, result, layout, paths, paints, colorBlind, empty } = input;
  const sourceBefore = before.tubes[move.from];
  const targetBefore = before.tubes[move.to];
  const sourceAfter = after.tubes[move.from];
  const targetAfter = after.tubes[move.to];
  const sourceRect = layout.tubes[move.from];
  const targetRect = layout.tubes[move.to];
  const poured = sourceBefore?.[sourceBefore.length - 1];
  if (
    sourceBefore === undefined ||
    targetBefore === undefined ||
    sourceAfter === undefined ||
    targetAfter === undefined ||
    sourceRect === undefined ||
    targetRect === undefined ||
    poured === undefined
  ) {
    return null;
  }
  const revealed = result.revealed.length > 0;
  const completes = isComplete(targetAfter, after.capacity);
  const plan = planPour({
    from: move.from,
    to: move.to,
    count: result.count,
    color: poured.color,
    sourceBefore: sourceBefore.length,
    targetBefore: targetBefore.length,
    capacity: after.capacity,
    revealed,
    completes,
    source: sourceRect.drawn,
    target: targetRect.drawn,
    segmentHeight: layout.segmentHeight,
    wall: layout.wall,
    canvasWidth: input.canvasWidth,
    durationScale: input.durationScale,
  });
  const top = sourceAfter.length - 1;
  const segment = { from: top, to: top + 1, cap: false, surface: false } as const;
  return {
    plan,
    pictures: {
      source: recordLiquid(skia, sourceBefore, paths, paints, colorBlind, {
        cap: false,
        surface: false,
      }),
      target: recordLiquid(skia, targetAfter, paths, paints, colorBlind, {
        cap: false,
        surface: false,
      }),
      cap: completes ? recordCap(skia, paths, paints, poured.color) : empty,
      flipHidden: revealed
        ? recordLiquid(skia, sourceBefore, paths, paints, colorBlind, segment)
        : empty,
      flipShown: revealed
        ? recordLiquid(skia, sourceAfter, paths, paints, colorBlind, segment)
        : empty,
    },
  };
};
