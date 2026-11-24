import { createRng } from '@/game/rng';
import {
  addEmptyTube,
  applyPour,
  boardKey,
  canPour,
  createHistory,
  isComplete,
  isPointlessMove,
  isStuck,
  isWon,
  legalMoves,
  pourCount,
  pushMove,
  runLength,
  undo,
} from '@/game/rules';
import { buildCandidate } from '@/game/generator';
import type { Board, Segment, Tube } from '@/game/types';

/** `a..n` = revealed color 0..13, `A..N` = hidden color 0..13. */
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

describe('rules', () => {
  it('runLength counts only same-colored revealed segments from the top', () => {
    expect(runLength(tube('abb'))).toBe(2);
    expect(runLength(tube('Bbb'))).toBe(2);
    expect(runLength(tube('bBb'))).toBe(1);
    expect(runLength(tube('bbbb'))).toBe(4);
    expect(runLength(tube(''))).toBe(0);
  });

  it('canPour rejects every invalid pour', () => {
    const b = board(4, 'aab', 'ab', 'abbb', 'aaaa', '', 'ba');
    expect(canPour(b, 0, 0)).toBe(false);
    expect(canPour(b, 4, 0)).toBe(false);
    expect(canPour(b, 3, 4)).toBe(false);
    expect(canPour(b, 0, 2)).toBe(false);
    expect(canPour(b, 5, 3)).toBe(false);
    expect(canPour(b, 0, 5)).toBe(false);
    expect(canPour(b, 0, 9)).toBe(false);
    expect(canPour(b, -1, 0)).toBe(false);
    expect(canPour(b, 0, 1)).toBe(true);
    expect(canPour(b, 0, 4)).toBe(true);
  });

  it('pours the whole top run onto an empty tube', () => {
    const { board: next, result } = applyPour(board(4, 'abbb', ''), { from: 0, to: 1 });
    expect(result.count).toBe(3);
    expect(boardKey(next)).toBe('a|bbb');
  });

  it('limits a partial pour to the free space of the target', () => {
    const b = board(4, 'abbb', 'aab', '');
    expect(pourCount(b, 0, 1)).toBe(1);
    const { board: next, result } = applyPour(b, { from: 0, to: 1 });
    expect(result.count).toBe(Math.min(3, 4 - 3));
    expect(boardKey(next)).toBe('abb|aabb|');
  });

  it('applyPour throws on an illegal move', () => {
    expect(() => applyPour(board(4, 'ab', 'ba'), { from: 0, to: 1 })).toThrow(/Illegal pour/);
  });

  it('reveals a hidden segment when a pour exposes it', () => {
    const { board: next, result } = applyPour(board(4, 'Abb', 'b', ''), { from: 0, to: 1 });
    expect(result.count).toBe(2);
    expect(result.revealed).toEqual([0]);
    expect(boardKey(next)).toBe('a|bbb|');

    const partial = applyPour(board(4, 'aBb', ''), { from: 0, to: 1 });
    expect(partial.result.count).toBe(1);
    expect(partial.result.revealed).toEqual([1]);
    expect(boardKey(partial.board)).toBe('ab|b');
  });

  it('never leaves a hidden top during random legal play', () => {
    const config = {
      level: 100,
      colors: 10,
      emptyTubes: 2,
      hiddenRatio: 0.4,
      hard: false,
      capacity: 4,
      minSolutionLength: 0,
      fallback: false,
    };
    for (let seed = 1; seed <= 20; seed += 1) {
      const rng = createRng(seed);
      let current = buildCandidate(config, seed);
      for (let step = 0; step < 60; step += 1) {
        for (const t of current.tubes) {
          if (t.length > 0) expect(t[t.length - 1]?.hidden).toBe(false);
        }
        const moves = legalMoves(current);
        const move = moves[rng.int(Math.max(moves.length, 1))];
        if (move === undefined) break;
        current = applyPour(current, move).board;
      }
    }
  });

  it('isComplete is false for a full one-color tube with a hidden segment', () => {
    expect(isComplete(tube('aaaa'), 4)).toBe(true);
    expect(isComplete(tube('Aaaa'), 4)).toBe(false);
    expect(isComplete(tube('aaa'), 4)).toBe(false);
  });

  it('locks complete tubes as source and destination', () => {
    const b = board(4, 'aaaa', 'a', '');
    expect(canPour(b, 0, 2)).toBe(false);
    expect(canPour(b, 1, 0)).toBe(false);
    const filled = applyPour(board(4, 'aaa', 'ba'), { from: 1, to: 0 }).board;
    expect(isComplete(filled.tubes[0] ?? [], 4)).toBe(true);
    expect(canPour(filled, 0, 1)).toBe(false);
  });

  it('isWon only when every non-empty tube is complete', () => {
    expect(isWon(board(4, 'aaaa', '', 'bbbb'))).toBe(true);
    expect(isWon(board(4, 'aaaa', 'bbb', 'b'))).toBe(false);
    expect(isWon(board(4, 'Aaaa', ''))).toBe(false);
  });

  it('isStuck when only pointless moves remain, never when won', () => {
    expect(isStuck(board(2, 'ab', 'ba'))).toBe(true);
    expect(isStuck(board(4, 'aa', 'bb', ''))).toBe(true);
    expect(isStuck(board(3, 'aab', 'bba', ''))).toBe(false);
    expect(isStuck(board(2, 'aa', 'bb'))).toBe(false);
  });

  it('isPointlessMove: uniform revealed tube into an empty tube only', () => {
    const b = board(4, 'bb', 'ab', 'Bb', '', 'aa');
    expect(isPointlessMove(b, { from: 0, to: 3 })).toBe(true);
    expect(isPointlessMove(b, { from: 1, to: 3 })).toBe(false);
    expect(isPointlessMove(b, { from: 2, to: 3 })).toBe(false);
    expect(isPointlessMove(b, { from: 0, to: 4 })).toBe(false);
  });

  it('addEmptyTube appends an empty tube', () => {
    const next = addEmptyTube(board(4, 'ab', 'ba'));
    expect(next.tubes).toHaveLength(3);
    expect(next.tubes[2]).toEqual([]);
    expect(next.capacity).toBe(4);
  });

  it('undo restores the exact previous board, including reveal state', () => {
    const start = board(4, 'Abb', 'b', '');
    let history = createHistory(start);
    expect(undo(history)).toBeNull();
    history = pushMove(history, { from: 0, to: 1 }).history;
    history = pushMove(history, { from: 0, to: 2 }).history;
    expect(boardKey(history.current)).toBe('|bbb|a');
    const once = undo(history);
    expect(once).not.toBeNull();
    expect(boardKey(once?.current ?? start)).toBe('a|bbb|');
    const twice = once === null ? null : undo(once);
    expect(twice?.current).toBe(start);
    expect(boardKey(twice?.current ?? board(4))).toBe('Abb|b|');
    expect(twice === null ? null : undo(twice)).toBeNull();
  });

  it('shares untouched tubes by reference after a pour', () => {
    const start = board(4, 'ab', 'b', 'cc', 'ac');
    const next = applyPour(start, { from: 0, to: 1 }).board;
    expect(next.tubes[2]).toBe(start.tubes[2]);
    expect(next.tubes[3]).toBe(start.tubes[3]);
    expect(next.tubes[0]).not.toBe(start.tubes[0]);
  });
});
