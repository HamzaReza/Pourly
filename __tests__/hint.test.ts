import { act, renderHook } from '@testing-library/react-native';

import { getLevel } from '@/game/generator';
import { canPour } from '@/game/rules';
import type { Board, Move, Tube } from '@/game/types';
import { findHintChunked, useHintSearch } from '@/render/useHint';

const tube = (...colors: number[]): Tube => colors.map((color) => ({ color, hidden: false }));

const solvable: Board = { capacity: 4, tubes: [tube(0, 0, 0, 1), tube(1, 1, 1, 0), []] };
const won: Board = { capacity: 4, tubes: [tube(0, 0, 0, 0), tube(1, 1, 1, 1), []] };

describe('findHintChunked', () => {
  it('returns a legal first move on a solvable board', async () => {
    const move = await findHintChunked(solvable);
    expect(move).not.toBeNull();
    if (move !== null) expect(canPour(solvable, move.from, move.to)).toBe(true);
  });

  it('returns null on a won board', async () => {
    await expect(findHintChunked(won)).resolves.toBeNull();
  });

  it('returns null when cancelled', async () => {
    await expect(findHintChunked(solvable, { isCancelled: () => true })).resolves.toBeNull();
  });
});

describe('useHintSearch', () => {
  it('resolves a hint for the current board', async () => {
    const { result } = await renderHook(() => useHintSearch(solvable));
    let move: Move | null = null;
    await act(async () => {
      move = await result.current();
    });
    expect(move).not.toBeNull();
  });

  it('cancels an older request when a newer one starts', async () => {
    const { result } = await renderHook(() => useHintSearch(solvable));
    let first: Move | null = { from: -1, to: -1 };
    let second: Move | null = null;
    await act(async () => {
      const older = result.current();
      const newer = result.current();
      [first, second] = await Promise.all([older, newer]);
    });
    expect(first).toBeNull();
    expect(second).not.toBeNull();
  });

  it('cancels a running search when the board changes', async () => {
    // A clock that jumps 10 ms per read makes every slice one unit, so the search is still
    // running when the board changes.
    let clock = 0;
    const now = jest.spyOn(performance, 'now').mockImplementation(() => (clock += 10));
    const hard = getLevel(250).board;
    const { result, rerender } = await renderHook(
      ({ board }: { board: Board }) => useHintSearch(board),
      {
        initialProps: { board: hard },
      },
    );
    let pending: Promise<Move | null> = Promise.resolve({ from: -1, to: -1 });
    await act(() => {
      pending = result.current();
    });
    await rerender({ board: { ...hard } });
    const move = await pending;
    now.mockRestore();
    expect(move).toBeNull();
  });
});
