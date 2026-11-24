import { getLevel } from '@/game/generator';
import { canPour } from '@/game/rules';
import type { Board, Segment, Tube } from '@/game/types';
import { canPourMirror, mirrorBoard, resolveTap } from '@/render/selection';

const seg = (color: number, hidden = false): Segment => ({ color, hidden });
const tube = (...colors: number[]): Tube => colors.map((color) => seg(color));

/** 0: mixed, 1: complete, 2: empty, 3: top matches 0, 4: full mixed, 5: top differs from 0. */
const board: Board = {
  capacity: 4,
  tubes: [tube(1, 0), tube(2, 2, 2, 2), [], tube(3, 0), tube(4, 5, 4, 5), tube(1, 1, 3)],
};
const mirror = mirrorBoard(board);

describe('resolveTap', () => {
  it('selects a selectable tube and ignores empty or complete tubes when nothing is selected', () => {
    expect(resolveTap(mirror, -1, 0)).toEqual({ kind: 'select', index: 0 });
    expect(resolveTap(mirror, -1, 1)).toEqual({ kind: 'none' });
    expect(resolveTap(mirror, -1, 2)).toEqual({ kind: 'none' });
    expect(resolveTap(mirror, -1, -1)).toEqual({ kind: 'none' });
  });

  it('deselects on the same tube or on empty space', () => {
    expect(resolveTap(mirror, 0, 0)).toEqual({ kind: 'deselect' });
    expect(resolveTap(mirror, 0, -1)).toEqual({ kind: 'deselect' });
  });

  it('pours onto a valid destination', () => {
    expect(resolveTap(mirror, 0, 2)).toEqual({ kind: 'pour', from: 0, to: 2 });
    expect(resolveTap(mirror, 0, 3)).toEqual({ kind: 'pour', from: 0, to: 3 });
  });

  it('turns a tap on a tube the selection cannot pour into into an invalid move', () => {
    expect(resolveTap(mirror, 0, 5)).toEqual({ kind: 'invalid', from: 0, to: 5, next: 5 });
    expect(resolveTap(mirror, 0, 4)).toEqual({ kind: 'invalid', from: 0, to: 4, next: 4 });
    expect(resolveTap(mirror, 0, 1)).toEqual({ kind: 'invalid', from: 0, to: 1, next: -1 });
  });
});

describe('canPourMirror', () => {
  it('agrees with rules.canPour on every pair of all 300 precomputed levels', () => {
    let pairs = 0;
    for (let level = 1; level <= 300; level += 1) {
      const levelBoard = getLevel(level).board;
      const levelMirror = mirrorBoard(levelBoard);
      const count = levelBoard.tubes.length;
      for (let from = 0; from < count; from += 1) {
        for (let to = 0; to < count; to += 1) {
          if (canPourMirror(levelMirror, from, to) !== canPour(levelBoard, from, to)) {
            throw new Error(`level ${level}: ${from} → ${to} disagrees`);
          }
          pairs += 1;
        }
      }
    }
    expect(pairs).toBeGreaterThan(0);
  });
});
