/**
 * Tap resolution on the UI thread. The JS board stays the source of truth; after every committed
 * change it is mirrored into a compact per-tube summary that worklets can read without touching
 * the game core. Pure: no platform imports.
 */
import { isComplete, runLength, topColor } from '@/game/rules';
import type { Board } from '@/game/types';

export interface TubeMirror {
  readonly length: number;
  /** Top color id, or -1 for an empty tube. */
  readonly top: number;
  /** Revealed same-colored segments on top. */
  readonly run: number;
  readonly complete: boolean;
}

export interface BoardMirror {
  readonly capacity: number;
  readonly tubes: readonly TubeMirror[];
}

export type TapOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'select'; readonly index: number }
  | { readonly kind: 'deselect' }
  | { readonly kind: 'pour'; readonly from: number; readonly to: number }
  /**
   * The selected tube `from` cannot pour into `to`: `from` shakes, then `next` becomes the
   * selection (`to` when it is selectable) or the selection drops (`next` = -1).
   */
  | { readonly kind: 'invalid'; readonly from: number; readonly to: number; readonly next: number };

export const mirrorBoard = (board: Board): BoardMirror => ({
  capacity: board.capacity,
  tubes: board.tubes.map((tube) => ({
    length: tube.length,
    top: topColor(tube) ?? -1,
    run: runLength(tube),
    complete: isComplete(tube, board.capacity),
  })),
});

/** A tube can be selected as a pour source: non-empty, not complete, revealed top run. */
export const isSelectable = (mirror: BoardMirror, index: number): boolean => {
  'worklet';
  const tube = mirror.tubes[index];
  return tube !== undefined && tube.length > 0 && !tube.complete && tube.run > 0;
};

/** Mirror of `rules.canPour` (spec §6 "valid pour A → B"). */
export const canPourMirror = (mirror: BoardMirror, from: number, to: number): boolean => {
  'worklet';
  if (from === to) return false;
  const source = mirror.tubes[from];
  const target = mirror.tubes[to];
  if (source === undefined || target === undefined) return false;
  if (!isSelectable(mirror, from)) return false;
  if (target.complete || target.length >= mirror.capacity) return false;
  return target.length === 0 || target.top === source.top;
};

/**
 * What a tap on tube `tapped` (-1 for empty space) does while `selected` (-1 for none) is lifted:
 * - same tube or empty space: deselect;
 * - valid destination: pour;
 * - any other tube: an invalid move (the selection shakes, then moves to the tapped tube if it is
 *   selectable, otherwise drops);
 * - nothing selected: select the tapped tube if it is selectable, otherwise nothing.
 */
export const resolveTap = (mirror: BoardMirror, selected: number, tapped: number): TapOutcome => {
  'worklet';
  if (selected >= 0) {
    if (tapped < 0 || tapped === selected) return { kind: 'deselect' };
    if (canPourMirror(mirror, selected, tapped))
      return { kind: 'pour', from: selected, to: tapped };
    const next = isSelectable(mirror, tapped) ? tapped : -1;
    return { kind: 'invalid', from: selected, to: tapped, next };
  }
  if (tapped >= 0 && isSelectable(mirror, tapped)) return { kind: 'select', index: tapped };
  return { kind: 'none' };
};
