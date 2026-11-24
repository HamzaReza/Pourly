/**
 * Starter Pack offer window (spec §10.1). The offer becomes eligible once level 8 is completed and
 * lasts 72 hours from the first moment it was eligible; `starterPackExpiresAt` is persisted so the
 * countdown survives restarts. Pure: the clock is injected.
 *
 * The remaining time is measured from `max(now, lastSeenAt)`, so turning the device clock back
 * can never lengthen the offer.
 */
import type { ProgressState } from '@/state/progressModel';

/** The offer appears after this level is completed. */
export const STARTER_PACK_AFTER_LEVEL = 8;
export const STARTER_PACK_WINDOW_MS = 72 * 60 * 60 * 1000;

export type StarterPackFields = Pick<
  ProgressState,
  'level' | 'starterPackExpiresAt' | 'starterPackPurchased' | 'lastSeenAt'
>;

/** Level 8 is done (the next level is 9 or later) and the pack was never bought. */
export const isStarterPackEligible = (
  state: Pick<StarterPackFields, 'level' | 'starterPackPurchased'>,
): boolean => !state.starterPackPurchased && state.level > STARTER_PACK_AFTER_LEVEL;

/**
 * The expiry to persist when the window should open now: only for an eligible player whose window
 * never started. Null means "leave the state alone".
 */
export const starterPackWindowToOpen = (state: StarterPackFields, now: number): number | null => {
  if (!isStarterPackEligible(state) || state.starterPackExpiresAt !== null) return null;
  return Math.max(now, state.lastSeenAt) + STARTER_PACK_WINDOW_MS;
};

/** Milliseconds left on the offer (0 when hidden, expired or bought). */
export const starterPackRemainingMs = (state: StarterPackFields, now: number): number => {
  if (!isStarterPackEligible(state) || state.starterPackExpiresAt === null) return 0;
  return Math.max(0, state.starterPackExpiresAt - Math.max(now, state.lastSeenAt));
};

export interface CountdownParts {
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

/** Whole hours (may exceed 24), minutes and seconds of a duration, rounded up to the second. */
export const countdownParts = (ms: number): CountdownParts => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return {
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
};
