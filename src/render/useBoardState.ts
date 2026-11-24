import { useCallback, useRef, useState } from 'react';

import { applyPour, canPour } from '@/game/rules';
import type { Board } from '@/game/types';

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
}

/**
 * Minimal board holder for the phase-3 board. Phase 5 replaces it with the game store; the
 * contract (board + pour + selection mirror) stays the same.
 */
export const useBoardState = (initial: Board): BoardState => {
  const [board, setBoard] = useState(initial);
  const boardRef = useRef(initial);
  const selectedRef = useRef(-1);

  const setSelected = useCallback((index: number) => {
    selectedRef.current = index;
  }, []);

  const pour = useCallback((from: number, to: number): boolean => {
    selectedRef.current = -1;
    const current = boardRef.current;
    if (!canPour(current, from, to)) return false;
    const next = applyPour(current, { from, to }).board;
    boardRef.current = next;
    setBoard(next);
    return true;
  }, []);

  return { board, selectedRef, setSelected, pour };
};
