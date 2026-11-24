import { useCallback, useEffect, useRef } from 'react';

import { createHintTask } from '@/game/solver';
import { DEFAULT_SLICE_MS, runTaskChunked } from '@/game/task';
import type { Board, Move } from '@/game/types';

export interface HintSearchOptions {
  /** Return true to stop; the search then resolves to null. */
  readonly isCancelled?: () => boolean;
  readonly sliceMs?: number;
}

const nextMacrotask = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Finds a hint for `board` in ≤ 8 ms slices, yielding to the event loop with `setTimeout(0)`
 * between slices so frames and touches keep flowing. Resolves to the first move of a solution,
 * or null (no solution within the node cap, a won board, or cancelled).
 */
export const findHintChunked = (
  board: Board,
  options: HintSearchOptions = {},
): Promise<Move | null> =>
  runTaskChunked(createHintTask(board), {
    sliceMs: options.sliceMs ?? DEFAULT_SLICE_MS,
    now: () => performance.now(),
    yieldFn: nextMacrotask,
    isCancelled: options.isCancelled,
  });

/**
 * Returns `requestHint()`, which searches the current `board` in slices. A search is cancelled
 * (resolves to null) when the board changes, the component unmounts, or a newer request starts.
 */
export const useHintSearch = (board: Board): (() => Promise<Move | null>) => {
  const generation = useRef(0);
  const boardRef = useRef(board);

  useEffect(() => {
    boardRef.current = board;
    return () => {
      generation.current += 1;
    };
  }, [board]);

  return useCallback(() => {
    generation.current += 1;
    const mine = generation.current;
    return findHintChunked(boardRef.current, {
      isCancelled: () => generation.current !== mine,
    }).then((move) => (generation.current === mine ? move : null));
  }, []);
};
