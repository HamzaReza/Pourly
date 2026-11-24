import { buildCandidate } from '@/game/generator';
import { applyPour, boardKey, canPour, isWon, legalMoves } from '@/game/rules';
import {
  HINT_NODE_CAP,
  canonicalHash,
  createSolveTask,
  getHint,
  improveSolution,
  solve,
  solveChunked,
} from '@/game/solver';
import { createTask, runTaskChunked, type Work } from '@/game/task';
import type { Board, LevelConfig, Move, Segment, Tube } from '@/game/types';

const tube = (code: string): Tube =>
  [...code].map((ch): Segment =>
    ch >= 'a'
      ? { color: ch.charCodeAt(0) - 97, hidden: false }
      : { color: ch.charCodeAt(0) - 65, hidden: true },
  );
const board = (capacity: number, ...tubes: string[]): Board => ({
  capacity,
  tubes: tubes.map(tube),
});

const replay = (start: Board, moves: readonly Move[]): Board =>
  moves.reduce((current, move) => applyPour(current, move).board, start);

/** Unpruned breadth-first search over exact board keys: optimal length, or -1 if unsolvable. */
const bfsOptimal = (start: Board): number => {
  if (isWon(start)) return 0;
  const seen = new Set([boardKey(start)]);
  let frontier = [start];
  let depth = 0;
  while (frontier.length > 0) {
    depth += 1;
    const next: Board[] = [];
    for (const state of frontier) {
      for (const move of legalMoves(state)) {
        const child = applyPour(state, move).board;
        if (isWon(child)) return depth;
        const key = boardKey(child);
        if (!seen.has(key)) {
          seen.add(key);
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  return -1;
};

const smallConfig = (colors: number, emptyTubes: number, hiddenRatio: number): LevelConfig => ({
  level: 1,
  colors,
  emptyTubes,
  hiddenRatio,
  hard: false,
  capacity: 4,
  minSolutionLength: 0,
  fallback: false,
});

describe('solver', () => {
  it('solves hand-built puzzles and the moves replay to a win', () => {
    const puzzles = [
      board(2, 'ab', 'ba', ''),
      board(4, 'Abab', 'baba', '', ''),
      board(4, 'abcd', 'dcba', 'cadb', 'bdac', '', ''),
      board(4, 'Abb', 'bbaa', 'a', ''),
    ];
    for (const puzzle of puzzles) {
      const result = solve(puzzle);
      expect(result.solvable).toBe(true);
      expect(result.capped).toBe(false);
      expect(isWon(replay(puzzle, result.moves))).toBe(true);
    }
  });

  it('returns an empty solution for a won board', () => {
    const result = solve(board(4, 'aaaa', '', 'bbbb'));
    expect(result).toEqual({ solvable: true, capped: false, moves: [], nodes: 0 });
  });

  it('reports a board with no moves as unsolvable, not capped', () => {
    const result = solve(board(3, 'abc', 'bca', 'cab'));
    expect(result.solvable).toBe(false);
    expect(result.capped).toBe(false);
  });

  it('agrees with an unpruned breadth-first search on a non-trivial unsolvable board', () => {
    const config = smallConfig(5, 1, 0);
    let seed = 1000;
    let result = solve(buildCandidate(config, seed));
    while (result.solvable || result.nodes < 15) {
      seed += 1;
      result = solve(buildCandidate(config, seed));
    }
    expect(result.capped).toBe(false);
    expect(bfsOptimal(buildCandidate(config, seed))).toBe(-1);
  });

  it('stops at the node cap and reports capped', () => {
    const start = buildCandidate(smallConfig(12, 2, 0.3), 7);
    const result = solve(start, { nodeCap: 10 });
    expect(result.solvable).toBe(false);
    expect(result.capped).toBe(true);
    expect(result.nodes).toBe(10);
  });

  it('canonicalHash ignores tube order but distinguishes hidden flags', () => {
    expect(canonicalHash(board(4, 'ab', '', 'ba'))).toBe(canonicalHash(board(4, 'ba', 'ab', '')));
    expect(canonicalHash(board(4, 'Ab', ''))).not.toBe(canonicalHash(board(4, 'ab', '')));
  });

  it('improveSolution never lengthens, always wins, and is optimal on small boards', () => {
    let checked = 0;
    for (let i = 0; i < 24; i += 1) {
      const start = buildCandidate(smallConfig(3 + (i % 3), 1 + (i % 2), i % 4 < 2 ? 0 : 0.3), i);
      const first = solve(start);
      const optimal = bfsOptimal(start);
      expect(first.solvable).toBe(optimal >= 0);
      if (!first.solvable) continue;
      const improved = improveSolution(start, first.moves, 1_000_000);
      expect(improved.moves.length).toBeLessThanOrEqual(first.moves.length);
      expect(isWon(replay(start, improved.moves))).toBe(true);
      expect(improved.optimal).toBe(true);
      expect(improved.moves.length).toBe(optimal);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(6);
  }, 20_000);

  it('getHint returns a legal first move of a solution, or null', () => {
    const start = board(4, 'abab', 'baba', '', '');
    const hint = getHint(start);
    expect(hint).not.toBeNull();
    if (hint === null) return;
    expect(canPour(start, hint.from, hint.to)).toBe(true);
    expect(solve(applyPour(start, hint).board).solvable).toBe(true);
    expect(getHint(board(4, 'aaaa', ''))).toBeNull();
    expect(getHint(board(3, 'abc', 'bca', 'cab'))).toBeNull();
  });

  it('solveChunked gives the same result as solve', async () => {
    const start = buildCandidate(smallConfig(12, 2, 0.35), 21);
    const sync = solve(start, { nodeCap: HINT_NODE_CAP });
    const chunked = await solveChunked(start, {
      nodeCap: HINT_NODE_CAP,
      sliceMs: 1,
      now: () => performance.now(),
      yieldFn: () => Promise.resolve(),
    });
    expect(chunked).toEqual(sync);
  });

  it('resolves null when a chunked run is cancelled', async () => {
    const result = await runTaskChunked(createSolveTask(board(2, 'ab', 'ba', '')), {
      now: () => 0,
      yieldFn: () => Promise.resolve(),
      isCancelled: () => true,
    });
    expect(result).toBeNull();
  });

  it('Task.step finishes eventually with a fake clock', () => {
    let clock = 0;
    const now = (): number => {
      clock += 1;
      return clock;
    };
    function* work(): Work<string> {
      for (let i = 0; i < 10; i += 1) yield;
      return 'done';
    }
    const task = createTask(work());
    let steps = 0;
    let step = task.step(3, now);
    while (!step.done) {
      steps += 1;
      step = task.step(3, now);
    }
    expect(step.value).toBe('done');
    expect(steps).toBeGreaterThan(1);
    expect(task.step(3, now)).toEqual({ done: true, value: 'done' });
  });
});
