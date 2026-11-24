import type { Board, Move, PourOutcome, PourResult, Segment, Tube } from './types';

/** Color of the top segment, or null for an empty tube. */
export const topColor = (tube: Tube): number | null => {
  const top = tube[tube.length - 1];
  return top === undefined ? null : top.color;
};

/**
 * Contiguous same-colored, revealed segments counted from the top. Hidden segments never count,
 * even when their true color matches.
 */
export const runLength = (tube: Tube): number => {
  const top = tube[tube.length - 1];
  if (top === undefined || top.hidden) return 0;
  let run = 0;
  for (let i = tube.length - 1; i >= 0; i -= 1) {
    const segment = tube[i];
    if (segment === undefined || segment.hidden || segment.color !== top.color) break;
    run += 1;
  }
  return run;
};

export const isFull = (tube: Tube, capacity: number): boolean => tube.length >= capacity;

/** Full, one color and fully revealed. Complete tubes are locked. */
export const isComplete = (tube: Tube, capacity: number): boolean =>
  tube.length === capacity && runLength(tube) === capacity;

/** True when every segment has the same color (hidden or not). Empty tubes are not uniform. */
export const isUniform = (tube: Tube): boolean => {
  const first = tube[0];
  if (first === undefined) return false;
  return tube.every((segment) => segment.color === first.color);
};

/** Spec §6 "valid pour A → B". Out-of-range indices are never valid. */
export const canPour = (board: Board, from: number, to: number): boolean => {
  if (from === to) return false;
  const source = board.tubes[from];
  const target = board.tubes[to];
  if (source === undefined || target === undefined) return false;
  if (source.length === 0 || isComplete(source, board.capacity)) return false;
  if (isFull(target, board.capacity) || isComplete(target, board.capacity)) return false;
  if (runLength(source) === 0) return false;
  return target.length === 0 || topColor(target) === topColor(source);
};

/** Segments a valid pour moves: `min(runLength(A), capacity − len(B))`; 0 when invalid. */
export const pourCount = (board: Board, from: number, to: number): number => {
  if (!canPour(board, from, to)) return 0;
  const source = board.tubes[from] ?? [];
  const target = board.tubes[to] ?? [];
  return Math.min(runLength(source), board.capacity - target.length);
};

const revealTop = (tube: Tube): { tube: Tube; revealed: number[] } => {
  const index = tube.length - 1;
  const top = tube[index];
  if (top === undefined || !top.hidden) return { tube, revealed: [] };
  const shown: Segment = { color: top.color, hidden: false };
  return { tube: [...tube.slice(0, index), shown], revealed: [index] };
};

/**
 * Applies a pour and returns the new board plus what happened. The source's new top flips to
 * revealed if it was hidden. Throws on an illegal move; check with `canPour` first.
 */
export const applyPour = (board: Board, move: Move): PourOutcome => {
  const count = pourCount(board, move.from, move.to);
  if (count === 0) {
    throw new Error(`Illegal pour ${move.from} -> ${move.to}`);
  }
  const source = board.tubes[move.from] ?? [];
  const target = board.tubes[move.to] ?? [];
  const cut = source.length - count;
  const moved = source.slice(cut);
  const { tube: newSource, revealed } = revealTop(source.slice(0, cut));
  const newTarget: Tube = [...target, ...moved];
  const tubes = board.tubes.map((tube, index) => {
    if (index === move.from) return newSource;
    if (index === move.to) return newTarget;
    return tube;
  });
  const result: PourResult = { count, revealed };
  return { board: { tubes, capacity: board.capacity }, result };
};

/** Every non-empty tube is complete. */
export const isWon = (board: Board): boolean =>
  board.tubes.every((tube) => tube.length === 0 || isComplete(tube, board.capacity));

/** All valid pours, ordered by source then destination index. */
export const legalMoves = (board: Board): Move[] => {
  const moves: Move[] = [];
  const count = board.tubes.length;
  for (let from = 0; from < count; from += 1) {
    for (let to = 0; to < count; to += 1) {
      if (canPour(board, from, to)) moves.push({ from, to });
    }
  }
  return moves;
};

/**
 * Moving a whole uniform, revealed tube onto an empty tube: it only swaps tube positions.
 * Also covers a tube whose every segment is the top run.
 */
export const isPointlessMove = (board: Board, move: Move): boolean => {
  const source = board.tubes[move.from];
  const target = board.tubes[move.to];
  if (source === undefined || target === undefined) return false;
  return target.length === 0 && source.length > 0 && runLength(source) === source.length;
};

/** Not won, and no legal pour exists other than pointless ones. */
export const isStuck = (board: Board): boolean =>
  !isWon(board) && legalMoves(board).every((move) => isPointlessMove(board, move));

/** Board with one extra empty tube appended (the +Tube power-up). */
export const addEmptyTube = (board: Board): Board => ({
  tubes: [...board.tubes, []],
  capacity: board.capacity,
});

/** Exact, order-sensitive key of a board (tube order and hidden flags included). */
export const boardKey = (board: Board): string => board.tubes.map(tubeKey).join('|');

/**
 * One char per segment: revealed colors are `a..n`, hidden colors are `A..N`. Used by hashing and
 * by the level codec.
 */
export const tubeKey = (tube: Tube): string => {
  let key = '';
  for (const segment of tube) {
    key += String.fromCharCode((segment.hidden ? 65 : 97) + segment.color);
  }
  return key;
};

/** Undo history: the current board plus every earlier snapshot, oldest first. */
export interface History {
  readonly current: Board;
  readonly past: readonly Board[];
}

export const createHistory = (board: Board): History => ({ current: board, past: [] });

/** Applies a move and records the previous board, so `undo` restores it exactly. */
export const pushMove = (
  history: History,
  move: Move,
): { history: History; result: PourResult } => {
  const { board, result } = applyPour(history.current, move);
  return { history: { current: board, past: [...history.past, history.current] }, result };
};

/** Restores the board before the last pour, including reveal state. Null when nothing to undo. */
export const undo = (history: History): History | null => {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return null;
  return { current: previous, past: history.past.slice(0, -1) };
};
