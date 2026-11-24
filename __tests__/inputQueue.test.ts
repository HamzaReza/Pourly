import type { Board, Segment, Tube } from '@/game/types';
import { decideTap, isOwned, withOwned, type InputState } from '@/render/inputQueue';
import { mirrorBoard } from '@/render/selection';

const seg = (color: number): Segment => ({ color, hidden: false });
const tube = (...colors: number[]): Tube => colors.map(seg);

/** 0: mixed, 1: complete, 2: empty, 3: top matches 0, 4: full mixed, 5: top differs from 0. */
const board: Board = {
  capacity: 4,
  tubes: [tube(1, 0), tube(2, 2, 2, 2), [], tube(3, 0), tube(4, 5, 4, 5), tube(1, 1, 3)],
};
const mirror = mirrorBoard(board);

const idle: InputState = {
  selected: -1,
  ownedMask: 0,
  pending: false,
  streaming: false,
  freeSlot: true,
  shaking: false,
};
const state = (overrides: Partial<InputState>): InputState => ({ ...idle, ...overrides });
const owning = (...indices: number[]) => indices.reduce((mask, i) => withOwned(mask, i, true), 0);

describe('ownership bits', () => {
  it('sets, clears and reads bits and ignores out-of-range tubes', () => {
    const mask = owning(0, 5, 15);
    expect(isOwned(mask, 0)).toBe(true);
    expect(isOwned(mask, 5)).toBe(true);
    expect(isOwned(mask, 15)).toBe(true);
    expect(isOwned(mask, 1)).toBe(false);
    expect(isOwned(withOwned(mask, 5, false), 5)).toBe(false);
    expect(withOwned(mask, -1, true)).toBe(mask);
    expect(withOwned(mask, 31, true)).toBe(mask);
    expect(isOwned(mask, -1)).toBe(false);
  });
});

describe('decideTap', () => {
  it('applies taps immediately when nothing is animating', () => {
    expect(decideTap(mirror, idle, 0)).toEqual({
      kind: 'apply',
      outcome: { kind: 'select', index: 0 },
    });
    expect(decideTap(mirror, state({ selected: 0 }), 2)).toEqual({
      kind: 'apply',
      outcome: { kind: 'pour', from: 0, to: 2 },
    });
  });

  it('queues every tap while a pour waits for its commit or the shake runs', () => {
    expect(decideTap(mirror, state({ pending: true }), 0)).toEqual({ kind: 'queue' });
    expect(decideTap(mirror, state({ shaking: true, selected: 0 }), -1)).toEqual({
      kind: 'queue',
    });
  });

  it('queues a pour while another stream runs or no slot is free', () => {
    expect(decideTap(mirror, state({ selected: 0, streaming: true }), 2)).toEqual({
      kind: 'queue',
    });
    expect(decideTap(mirror, state({ selected: 0, freeSlot: false }), 2)).toEqual({
      kind: 'queue',
    });
  });

  it('still selects, deselects and rejects on free tubes during a stream', () => {
    const streaming = state({ streaming: true, freeSlot: false, ownedMask: owning(1, 2) });
    expect(decideTap(mirror, streaming, 0)).toEqual({
      kind: 'apply',
      outcome: { kind: 'select', index: 0 },
    });
    expect(decideTap(mirror, { ...streaming, selected: 0 }, -1)).toEqual({
      kind: 'apply',
      outcome: { kind: 'deselect' },
    });
    expect(decideTap(mirror, { ...streaming, selected: 0 }, 5)).toEqual({
      kind: 'apply',
      outcome: { kind: 'invalid', from: 0, to: 5, next: 5 },
    });
  });

  it('queues taps that need a tube an animation still owns', () => {
    expect(decideTap(mirror, state({ ownedMask: owning(0) }), 0)).toEqual({ kind: 'queue' });
    expect(decideTap(mirror, state({ selected: 0, ownedMask: owning(2) }), 2)).toEqual({
      kind: 'queue',
    });
    expect(decideTap(mirror, state({ selected: 3, ownedMask: owning(3) }), 0)).toEqual({
      kind: 'queue',
    });
    expect(decideTap(mirror, state({ selected: 0, ownedMask: owning(5) }), 5)).toEqual({
      kind: 'queue',
    });
  });

  it('lets taps that resolve to nothing through', () => {
    expect(decideTap(mirror, state({ ownedMask: owning(1) }), 1)).toEqual({
      kind: 'apply',
      outcome: { kind: 'none' },
    });
  });
});
