import { useCallback, useRef, useState } from 'react';

import { applyPour, canPour } from '@/game/rules';
import type { Board, PourOutcome } from '@/game/types';

export interface BoardState {
  readonly board: Board;
  /** Selected tube index, or -1. Kept in a ref: selection is drawn from UI-thread shared values. */
  readonly selectedRef: { readonly current: number };
  /** Records the selection the UI thread just applied. */
  readonly setSelected: (index: number) => void;
  /**
   * Applies a pour through the rules engine (instant, no animation). Returns false and leaves the
   * board untouched when the pour is not legal on the current board.
   */
  readonly pour: (from: number, to: number) => boolean;
  /** Same as `pour`, but returns the outcome (new board and what moved) or null when illegal. */
  readonly commitPour: (from: number, to: number) => PourOutcome | null;
}

/**
 * Standalone board holder for screens that drive a board outside the game session (the dev
 * stress screen). The game screen uses the game store (`src/state/gameStore.ts`) instead, with
 * the same `commitPour` contract; this hook never touches the saved game.
 */
export const useBoardState = (initial: Board): BoardState => {
  const [board, setBoard] = useState(initial);
  const boardRef = useRef(initial);
  const selectedRef = useRef(-1);

  const setSelected = useCallback((index: number) => {
    selectedRef.current = index;
  }, []);

  const commitPour = useCallback((from: number, to: number): PourOutcome | null => {
    selectedRef.current = -1;
    const current = boardRef.current;
    if (!canPour(current, from, to)) return null;
    const outcome = applyPour(current, { from, to });
    boardRef.current = outcome.board;
    setBoard(outcome.board);
    return outcome;
  }, []);

  const pour = useCallback(
    (from: number, to: number): boolean => commitPour(from, to) !== null,
    [commitPour],
  );

  return { board, selectedRef, setSelected, pour, commitPour };
};
