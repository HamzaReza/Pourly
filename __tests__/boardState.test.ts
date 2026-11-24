import { act, renderHook } from '@testing-library/react-native';

import type { Board, Tube } from '@/game/types';
import { useBoardState } from '@/render/useBoardState';

const tube = (...colors: number[]): Tube => colors.map((color) => ({ color, hidden: false }));

const initial: Board = { capacity: 4, tubes: [tube(1, 0), tube(2, 0), [], tube(1, 1, 1, 1)] };

describe('useBoardState', () => {
  it('applies a legal pour and rejects an illegal one without changing the board', async () => {
    const { result } = await renderHook(() => useBoardState(initial));
    expect(result.current.board).toBe(initial);

    let accepted = false;
    await act(() => {
      result.current.setSelected(0);
      accepted = result.current.pour(0, 1);
    });
    expect(accepted).toBe(true);
    expect(result.current.selectedRef.current).toBe(-1);
    const afterPour = result.current.board;
    expect(afterPour.tubes[0]).toEqual(tube(1));
    expect(afterPour.tubes[1]).toEqual(tube(2, 0, 0));
    expect(afterPour.tubes[3]).toBe(initial.tubes[3]);

    let rejected = true;
    await act(() => {
      rejected = result.current.pour(0, 3);
    });
    expect(rejected).toBe(false);
    expect(result.current.board).toBe(afterPour);
  });

  it('returns the pour outcome from commitPour, or null without touching the board', async () => {
    const { result } = await renderHook(() => useBoardState(initial));
    let outcome: ReturnType<typeof result.current.commitPour> = null;
    await act(() => {
      outcome = result.current.commitPour(0, 2);
    });
    expect(outcome).not.toBeNull();
    expect(outcome!.result).toEqual({ count: 1, revealed: [] });
    expect(result.current.board).toBe(outcome!.board);
    expect(result.current.board.tubes[2]).toEqual(tube(0));

    const before = result.current.board;
    let rejected: ReturnType<typeof result.current.commitPour> = null;
    await act(() => {
      rejected = result.current.commitPour(0, 3);
    });
    expect(rejected).toBeNull();
    expect(result.current.board).toBe(before);
  });
});
