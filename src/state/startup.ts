/**
 * First-launch routing (spec §1, §9): a brand-new player (level 1, no saved game) goes straight
 * into the game with no extra screens. Decided once per app start, after the stores hydrate.
 */
import { useGameStore } from './gameStore';
import { useProgressStore } from './progressStore';

let autoStart = false;

/** Decides whether Home should hand over to the game immediately. Call after hydration. */
export const decideAutoStart = (): void => {
  const { session, parked } = useGameStore.getState();
  autoStart = useProgressStore.getState().level === 1 && session === null && parked === null;
};

/** True until consumed: Home redirects to the game once per app start. */
export const shouldAutoStart = (): boolean => autoStart;

export const consumeAutoStart = (): void => {
  autoStart = false;
};
