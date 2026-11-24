import {
  INITIAL_TUTORIAL,
  isTutorialLevel,
  reduceTutorial,
  type TutorialState,
} from '@/game/tutorial';

const move = { from: 0, to: 2 };
const showing: TutorialState = { move, phase: 'source', step: 0 };

describe('isTutorialLevel', () => {
  it('covers levels 1-3 until the tutorial is done', () => {
    expect([0, 1, 3, 4].map((level) => isTutorialLevel(level, false))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect(isTutorialLevel(1, true)).toBe(false);
  });
});

describe('reduceTutorial', () => {
  it('suggests the source, or the target when the source is already lifted', () => {
    expect(
      reduceTutorial(INITIAL_TUTORIAL, { type: 'suggest', move, selected: -1 }).state.phase,
    ).toBe('source');
    expect(
      reduceTutorial(INITIAL_TUTORIAL, { type: 'suggest', move, selected: 0 }).state.phase,
    ).toBe('target');
    expect(reduceTutorial(showing, { type: 'suggest', move: null, selected: -1 }).state).toEqual({
      move: null,
      phase: 'hidden',
      step: 0,
    });
  });

  it('moves to the target when the source is selected and back on deselect', () => {
    const target = reduceTutorial(showing, { type: 'select', index: 0 });
    expect(target).toEqual({ state: { ...showing, phase: 'target' }, outcome: 'none' });
    expect(reduceTutorial(target.state, { type: 'select', index: -1 }).state.phase).toBe('source');
  });

  it('hides on a wrong selection or an invalid move', () => {
    expect(reduceTutorial(showing, { type: 'select', index: 1 })).toEqual({
      state: { ...showing, phase: 'hidden' },
      outcome: 'wrong',
    });
    expect(reduceTutorial(showing, { type: 'invalid' }).outcome).toBe('wrong');
  });

  it('counts a correct pour as a step and a different pour as wrong', () => {
    expect(reduceTutorial(showing, { type: 'pour', move })).toEqual({
      state: { move: null, phase: 'hidden', step: 1 },
      outcome: 'correct',
    });
    expect(reduceTutorial(showing, { type: 'pour', move: { from: 1, to: 2 } }).outcome).toBe(
      'wrong',
    );
  });

  it('ignores selections while hidden', () => {
    expect(reduceTutorial(INITIAL_TUTORIAL, { type: 'select', index: 3 })).toEqual({
      state: INITIAL_TUTORIAL,
      outcome: 'none',
    });
  });
});
