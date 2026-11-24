import type { Board, Level, Tube } from '@/game/types';

/** Revealed segments, bottom first. */
export const tube = (...colors: number[]): Tube =>
  colors.map((color) => ({ color, hidden: false }));

/** A segment list where `hidden` marks the indices that start hidden. */
export const mixed = (colors: number[], hidden: number[]): Tube =>
  colors.map((color, index) => ({ color, hidden: hidden.includes(index) }));

export const board = (...tubes: Tube[]): Board => ({ tubes, capacity: 4 });

/** A level wrapping `board` (level-mode id, par 1 unless given). */
export const levelOf = (n: number, value: Board, par = 1): Level => ({
  id: `level-${n}`,
  seed: 0,
  par,
  board: value,
  config: {
    level: n,
    colors: 2,
    emptyTubes: 1,
    hiddenRatio: 0,
    hard: n % 10 === 0,
    capacity: value.capacity,
    minSolutionLength: 1,
    fallback: false,
  },
});

/** One pour (1 → 0) wins: tube 0 holds three 0s, tube 1 one 0, tube 2 is complete. */
export const almostWon = (): Board => board(tube(0, 0, 0), tube(0), tube(1, 1, 1, 1), []);

/** Two full, interleaved tubes and no space: stuck from the start. */
export const stuckBoard = (): Board => board(tube(0, 1, 0, 1), tube(1, 0, 1, 0));

/**
 * A live board with a mystery segment: pouring 0 → 2 moves the top 1 and reveals the hidden 0
 * beneath it.
 */
export const revealBoard = (): Board => board(mixed([1, 0, 1], [1]), tube(0, 0, 0), [], tube(1, 1));

/** Live board where pouring 0 → 2 leaves no useful move (stuck). */
export const oneFromStuck = (): Board =>
  board(tube(0, 0, 2), tube(0, 1, 2, 1), tube(2), tube(2, 1, 0, 1));
