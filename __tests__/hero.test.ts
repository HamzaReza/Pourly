import { canPour, tubeKey } from '@/game/rules';
import { HERO_MOVES, HERO_START, heroBoards, heroPhase } from '@/render/hero';

jest.mock('@shopify/react-native-skia', () => ({
  BlurStyle: {},
  ClipOp: {},
  PaintStyle: {},
  PathOp: {},
  TileMode: {},
  FillType: {},
}));

describe('hero loop', () => {
  it('six legal pours bring the board back to the start', () => {
    const boards = heroBoards();
    expect(boards).toHaveLength(HERO_MOVES.length + 1);
    HERO_MOVES.forEach((move, index) => {
      const board = boards[index];
      if (board === undefined) throw new Error('missing board');
      expect(canPour(board, move.from, move.to)).toBe(true);
    });
    expect(boards[boards.length - 1]?.tubes.map(tubeKey)).toEqual(HERO_START.tubes.map(tubeKey));
  });

  it('heroPhase finds the running pour and the finished count at the boundaries', () => {
    const starts = [100, 400];
    const totals = [200, 300];
    expect(heroPhase(starts, totals, 0)).toEqual({ pour: -1, done: 0 });
    expect(heroPhase(starts, totals, 100)).toEqual({ pour: 0, done: 0 });
    expect(heroPhase(starts, totals, 299)).toEqual({ pour: 0, done: 0 });
    expect(heroPhase(starts, totals, 300)).toEqual({ pour: -1, done: 1 });
    expect(heroPhase(starts, totals, 450)).toEqual({ pour: 1, done: 1 });
    expect(heroPhase(starts, totals, 700)).toEqual({ pour: -1, done: 2 });
  });
});
