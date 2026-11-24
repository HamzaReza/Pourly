/**
 * Guided tutorial for levels 1–3 (spec §9): a finger points at the solver's suggested source,
 * then its destination. Pure state machine; the game screen feeds it board events and decides
 * when an idle moment has come.
 */
import type { Move } from './types';

/** Levels with the guided finger while `progress.tutorialDone` is false. */
export const TUTORIAL_LAST_LEVEL = 3;

/** After a correct pour, the next suggestion appears this long after the board settles. */
export const TUTORIAL_NEXT_DELAY_MS = 250;
/** After a wrong move, the finger waits for this much idle time before returning. */
export const TUTORIAL_IDLE_DELAY_MS = 1500;

export const isTutorialLevel = (level: number, tutorialDone: boolean): boolean =>
  !tutorialDone && level >= 1 && level <= TUTORIAL_LAST_LEVEL;

/** `source`: point at the tube to pick up; `target`: point at where to pour. */
export type TutorialPhase = 'hidden' | 'source' | 'target';

export interface TutorialState {
  readonly move: Move | null;
  readonly phase: TutorialPhase;
  /** Correct pours made while guided on this level. */
  readonly step: number;
}

export type TutorialEvent =
  /** A new suggestion at an idle moment (`selected`: the tube currently lifted, or -1). */
  | { readonly type: 'suggest'; readonly move: Move | null; readonly selected: number }
  | { readonly type: 'select'; readonly index: number }
  | { readonly type: 'pour'; readonly move: Move }
  | { readonly type: 'invalid' };

/** What the event meant for the guide: drives how soon the finger returns. */
export type TutorialOutcome = 'none' | 'correct' | 'wrong';

export interface TutorialTransition {
  readonly state: TutorialState;
  readonly outcome: TutorialOutcome;
}

export const INITIAL_TUTORIAL: TutorialState = { move: null, phase: 'hidden', step: 0 };

const hidden = (state: TutorialState): TutorialState => ({ ...state, phase: 'hidden' });

export const reduceTutorial = (state: TutorialState, event: TutorialEvent): TutorialTransition => {
  switch (event.type) {
    case 'suggest': {
      if (event.move === null)
        return { state: { ...state, move: null, phase: 'hidden' }, outcome: 'none' };
      const phase: TutorialPhase = event.selected === event.move.from ? 'target' : 'source';
      return { state: { ...state, move: event.move, phase }, outcome: 'none' };
    }
    case 'select': {
      const { move } = state;
      if (move === null || state.phase === 'hidden') return { state, outcome: 'none' };
      if (event.index === move.from)
        return { state: { ...state, phase: 'target' }, outcome: 'none' };
      if (event.index === -1 && state.phase === 'target') {
        return { state: { ...state, phase: 'source' }, outcome: 'none' };
      }
      return { state: hidden(state), outcome: 'wrong' };
    }
    case 'pour': {
      const { move } = state;
      if (move !== null && move.from === event.move.from && move.to === event.move.to) {
        return { state: { move: null, phase: 'hidden', step: state.step + 1 }, outcome: 'correct' };
      }
      return { state: { ...state, move: null, phase: 'hidden' }, outcome: 'wrong' };
    }
    case 'invalid':
      return { state: hidden(state), outcome: 'wrong' };
  }
};
