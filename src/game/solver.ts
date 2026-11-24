import { applyPour, isPointlessMove, isWon, legalMoves, runLength, tubeKey } from './rules';
import {
  createTask,
  runTaskChunked,
  runWork,
  type ChunkOptions,
  type Task,
  type Work,
} from './task';
import type { Board, Move } from './types';

/** Node cap used when validating generated levels. */
export const GENERATION_NODE_CAP = 200_000;
/** Node cap for in-game hints. */
export const HINT_NODE_CAP = 40_000;
/** Node budget for the par-shortening pass. */
export const IMPROVE_NODE_BUDGET = 60_000;
/** Solver nodes per unit of cooperative work (between two possible pauses). */
export const NODES_PER_UNIT = 24;

export interface SolveOptions {
  readonly nodeCap?: number;
}

export interface SolveResult {
  /** A solution was found. */
  readonly solvable: boolean;
  /** The search stopped at the node cap; `solvable` is then false but the board may be solvable. */
  readonly capped: boolean;
  /** Pours of the solution found (empty when not solvable or already won). */
  readonly moves: readonly Move[];
  /** Child states generated. */
  readonly nodes: number;
}

export interface ImproveResult {
  /** Shortest solution found (the initial one when nothing shorter was found). */
  readonly moves: readonly Move[];
  readonly nodes: number;
  /** The search space was exhausted within budget, so `moves` is a shortest solution. */
  readonly optimal: boolean;
}

/**
 * Canonical key of a board: tube keys (one char per segment, hidden segments upper-case) sorted
 * and joined, so two boards that differ only in tube order share a key.
 */
export const canonicalHash = (board: Board): string => board.tubes.map(tubeKey).sort().join('|');

/**
 * Admissible lower bound on the pours still needed: color changes between stacked segments (a
 * pour removes at most one) plus, per color, the tubes beyond the first whose bottom segment has
 * that color (only emptying a tube removes one, which removes no color change).
 */
export const lowerBound = (board: Board): number => {
  let changes = 0;
  const bottoms = new Map<number, number>();
  for (const tube of board.tubes) {
    const bottom = tube[0];
    if (bottom === undefined) continue;
    bottoms.set(bottom.color, (bottoms.get(bottom.color) ?? 0) + 1);
    for (let i = 1; i < tube.length; i += 1) {
      if (tube[i]?.color !== tube[i - 1]?.color) changes += 1;
    }
  }
  let extraBottoms = 0;
  for (const count of bottoms.values()) extraBottoms += count - 1;
  return changes + extraBottoms;
};

/**
 * Heuristic priority of a legal move: completing a tube, then pouring onto a matching top,
 * then moving a whole run (consolidating, revealing or emptying the source). Pours into an
 * empty tube and pours that split a run rank last.
 */
const scoreMove = (board: Board, move: Move): number => {
  const source = board.tubes[move.from] ?? [];
  const target = board.tubes[move.to] ?? [];
  const run = runLength(source);
  const count = Math.min(run, board.capacity - target.length);
  let score = 0;
  if (target.length > 0) {
    score += 50;
    const targetRun = runLength(target);
    if (targetRun === target.length && target.length + count === board.capacity) score += 100;
    score += targetRun;
  } else {
    score -= 20;
  }
  if (count === run) {
    score += 20;
    const below = source[source.length - run - 1];
    if (below === undefined) score += 10;
    else if (below.hidden) score += 15;
  } else {
    score -= 10;
  }
  return score;
};

/**
 * Legal moves worth searching, best first. Skips pointless moves, pours into any empty tube but
 * the first (all lead to the same canonical state), and the immediate reversal of the previous
 * pour when it revealed nothing (its result is one pour away from the grandparent state).
 */
export const orderedMoves = (board: Board, last: Move | null, lastRevealed: boolean): Move[] => {
  const firstEmpty = board.tubes.findIndex((tube) => tube.length === 0);
  const scored: { move: Move; score: number; index: number }[] = [];
  legalMoves(board).forEach((move, index) => {
    if (isPointlessMove(board, move)) return;
    if (firstEmpty !== -1 && move.to !== firstEmpty && board.tubes[move.to]?.length === 0) return;
    if (last !== null && !lastRevealed && move.from === last.to && move.to === last.from) return;
    scored.push({ move, score: scoreMove(board, move), index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((entry) => entry.move);
};

interface Frame {
  readonly board: Board;
  readonly moves: readonly Move[];
  next: number;
}

interface SearchStats {
  nodes: number;
}

type SearchOutcome =
  | { readonly kind: 'found'; readonly moves: Move[]; readonly complete: boolean }
  | { readonly kind: 'exhausted' }
  | { readonly kind: 'capped' };

interface SearchConfig {
  readonly nodeCap: number;
  /**
   * `first`: return the first solution. `shortest`: branch and bound; every solution found
   * tightens the bound to one pour shorter, and the last one found is returned.
   */
  readonly mode: 'first' | 'shortest';
  /** Longest solution accepted (`shortest` mode). */
  readonly maxDepth: number;
}

/**
 * Depth-first search over the rules engine with an explicit stack, so it can pause at any unit
 * boundary. States are memoized by canonical hash; in `shortest` mode a state is re-expanded only
 * when reached by a shorter path.
 */
function* search(root: Board, config: SearchConfig, stats: SearchStats): Work<SearchOutcome> {
  if (isWon(root)) return { kind: 'found', moves: [], complete: true };
  const shortest = config.mode === 'shortest';
  let maxDepth = config.maxDepth;
  let best: Move[] | null = null;
  const seen = new Map<string, number>([[canonicalHash(root), 0]]);
  const stack: Frame[] = [{ board: root, moves: orderedMoves(root, null, false), next: 0 }];
  const path: Move[] = [];
  let unitNodes = 0;

  while (stack.length > 0) {
    const frame = stack[stack.length - 1] as Frame;
    const frameDepth = stack.length - 1;
    const move = frame.moves[frame.next];
    if (move === undefined || frameDepth >= maxDepth) {
      stack.pop();
      path.pop();
      continue;
    }
    frame.next += 1;
    if (stats.nodes >= config.nodeCap) {
      return best === null ? { kind: 'capped' } : { kind: 'found', moves: best, complete: false };
    }
    stats.nodes += 1;
    unitNodes += 1;
    if (unitNodes >= NODES_PER_UNIT) {
      unitNodes = 0;
      yield;
    }

    const { board, result } = applyPour(frame.board, move);
    const depth = frameDepth + 1;
    if (isWon(board)) {
      const solution = [...path, move];
      if (!shortest) return { kind: 'found', moves: solution, complete: false };
      best = solution;
      maxDepth = solution.length - 1;
      continue;
    }
    if (depth >= maxDepth) continue;
    if (shortest && depth + lowerBound(board) > maxDepth) continue;
    const key = canonicalHash(board);
    const previous = seen.get(key);
    if (previous !== undefined && (!shortest || previous <= depth)) continue;
    seen.set(key, depth);
    path.push(move);
    stack.push({ board, moves: orderedMoves(board, move, result.revealed.length > 0), next: 0 });
  }
  return best === null ? { kind: 'exhausted' } : { kind: 'found', moves: best, complete: true };
}

/** Cooperative form of `solve`. */
export function* solveWork(board: Board, options: SolveOptions = {}): Work<SolveResult> {
  const stats: SearchStats = { nodes: 0 };
  const nodeCap = options.nodeCap ?? GENERATION_NODE_CAP;
  const outcome = yield* search(
    board,
    { nodeCap, mode: 'first', maxDepth: Number.POSITIVE_INFINITY },
    stats,
  );
  if (outcome.kind === 'found') {
    return { solvable: true, capped: false, moves: outcome.moves, nodes: stats.nodes };
  }
  return { solvable: false, capped: outcome.kind === 'capped', moves: [], nodes: stats.nodes };
}

/** Finds a solution (not necessarily the shortest) within the node cap. */
export const solve = (board: Board, options: SolveOptions = {}): SolveResult =>
  runWork(solveWork(board, options));

export const createSolveTask = (board: Board, options: SolveOptions = {}): Task<SolveResult> =>
  createTask(solveWork(board, options));

/** Solves in time slices, yielding between them. Resolves null when cancelled. */
export const solveChunked = (
  board: Board,
  options: SolveOptions & ChunkOptions,
): Promise<SolveResult | null> => runTaskChunked(createSolveTask(board, options), options);

/** Cooperative form of `improveSolution`. */
export function* improveWork(
  board: Board,
  initial: readonly Move[],
  budget: number = IMPROVE_NODE_BUDGET,
): Work<ImproveResult> {
  const stats: SearchStats = { nodes: 0 };
  if (initial.length === 0) return { moves: [], nodes: 0, optimal: true };
  const outcome = yield* search(
    board,
    { nodeCap: budget, mode: 'shortest', maxDepth: initial.length - 1 },
    stats,
  );
  if (outcome.kind === 'found') {
    return { moves: outcome.moves, nodes: stats.nodes, optimal: outcome.complete };
  }
  return { moves: initial, nodes: stats.nodes, optimal: outcome.kind === 'exhausted' };
}

/**
 * Bounded branch-and-bound re-search for a shorter solution than `initial` (spec "find a better
 * solution" iteration). Prunes with the current best length and `lowerBound`.
 */
export const improveSolution = (
  board: Board,
  initial: readonly Move[],
  budget: number = IMPROVE_NODE_BUDGET,
): ImproveResult => runWork(improveWork(board, initial, budget));

/** Cooperative form of `getHint`. */
export function* hintWork(board: Board, nodeCap: number = HINT_NODE_CAP): Work<Move | null> {
  const result = yield* solveWork(board, { nodeCap });
  return result.moves[0] ?? null;
}

/**
 * Next pour of a solution found with the hint cap. Null when the board is won, unsolvable, or
 * no solution was found within the cap.
 */
export const getHint = (board: Board, nodeCap: number = HINT_NODE_CAP): Move | null =>
  runWork(hintWork(board, nodeCap));

export const createHintTask = (board: Board, nodeCap: number = HINT_NODE_CAP): Task<Move | null> =>
  createTask(hintWork(board, nodeCap));
