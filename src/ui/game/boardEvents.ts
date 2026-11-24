import type { Move } from '@/game/types';

/** Board happenings that game-screen helpers (tutorial, stuck overlay) react to. */
export type BoardEvent =
  | { readonly type: 'select'; readonly index: number }
  | { readonly type: 'pour'; readonly move: Move }
  | { readonly type: 'invalid' }
  | { readonly type: 'settled' };

export interface BoardEvents {
  emit: (event: BoardEvent) => void;
  subscribe: (listener: (event: BoardEvent) => void) => () => void;
}

/** A tiny synchronous emitter; one per game screen. */
export const createBoardEvents = (): BoardEvents => {
  const listeners = new Set<(event: BoardEvent) => void>();
  return {
    emit: (event) => {
      for (const listener of listeners) listener(event);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
