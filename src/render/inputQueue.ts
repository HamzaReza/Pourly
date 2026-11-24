/**
 * Input rule during animations (spec §9, decision P4.3). Pure and worklet-safe; the board keeps
 * the state in shared values and asks `decideTap` what to do with each tap.
 *
 * - Every tap is resolved against the committed board mirror and the current selection.
 * - While a pour waits for its JS commit, or while the invalid-move shake runs, every tap waits.
 * - A pour waits while another pour's stream is running or no pour slot is free.
 * - A tap that needs a tube an animation still owns (the returning source, a destination that is
 *   filling or capping) waits.
 * - Selecting, deselecting and invalid moves on free tubes happen immediately, even mid-pour.
 * - At most one tap waits (the newest replaces it). It is replayed through the same rule when a
 *   stream ends, a tube is released, the shake ends or a pending pour is rejected.
 */
import { resolveTap, type BoardMirror, type TapOutcome } from './selection';

/** No queued tap (-1 is a valid tap: empty space). */
export const NO_TAP = -2;

export interface InputState {
  readonly selected: number;
  /** Bit `i` set: tube `i` is drawn by an animation. */
  readonly ownedMask: number;
  /** A pour was decided on the UI thread and the JS commit has not started it yet. */
  readonly pending: boolean;
  /** A pour stream is running (from the start of the pour until its stream ends). */
  readonly streaming: boolean;
  readonly freeSlot: boolean;
  readonly shaking: boolean;
}

export type TapDecision =
  { readonly kind: 'queue' } | { readonly kind: 'apply'; readonly outcome: TapOutcome };

export const isOwned = (mask: number, index: number): boolean => {
  'worklet';
  return index >= 0 && index < 31 && (mask & (1 << index)) !== 0;
};

export const withOwned = (mask: number, index: number, owned: boolean): number => {
  'worklet';
  if (index < 0 || index >= 31) return mask;
  return owned ? mask | (1 << index) : mask & ~(1 << index);
};

export const decideTap = (mirror: BoardMirror, state: InputState, tapped: number): TapDecision => {
  'worklet';
  if (state.pending || state.shaking) return { kind: 'queue' };
  const outcome = resolveTap(mirror, state.selected, tapped);
  const owned = state.ownedMask;
  switch (outcome.kind) {
    case 'select':
      if (isOwned(owned, outcome.index)) return { kind: 'queue' };
      break;
    case 'pour':
      if (isOwned(owned, outcome.from) || isOwned(owned, outcome.to)) return { kind: 'queue' };
      if (state.streaming || !state.freeSlot) return { kind: 'queue' };
      break;
    case 'invalid':
      if (isOwned(owned, outcome.to)) return { kind: 'queue' };
      break;
    case 'none':
    case 'deselect':
      break;
  }
  return { kind: 'apply', outcome };
};
