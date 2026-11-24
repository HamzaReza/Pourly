/**
 * Game flow: the actions behind the game screen's buttons and overlays. Coordinates the game
 * store, progress, economy decisions, ads and analytics. No React here; the screen renders the
 * typed results.
 */
import { AppState } from 'react-native';

import { REWARDED_PLACEMENTS, type RewardedPlacement } from '@/config/ads';
import type { RewardBundle } from '@/config/economy';
import {
  canSkip,
  resolveExtraTubeCost,
  resolveHintCost,
  resolveUndoCost,
  winReward,
  type CostDecision,
  type PowerUp,
} from '@/game/economy';
import { computeStars } from '@/game/stars';
import { TUTORIAL_LAST_LEVEL } from '@/game/tutorial';
import type { Board, Level, Move, PourOutcome } from '@/game/types';
import { ads } from '@/services/ads';
import { track, type PaymentSource } from '@/services/analytics';

import {
  elapsedOf,
  flushGameSnapshot,
  isActive,
  isResumable,
  useGameStore,
  type GameMode,
  type GameSession,
} from './gameStore';
import { levelNow, prepareLevel, readyLevel } from './levelLoader';
import { useProgressStore } from './progressStore';

export const PLACEMENT_FOR: Readonly<Record<PowerUp, RewardedPlacement>> = {
  undo: REWARDED_PLACEMENTS.UNDO,
  hint: REWARDED_PLACEMENTS.HINT,
  extraTube: REWARDED_PLACEMENTS.EXTRA_TUBE,
};

/** What one unit of a power-up is worth when it is granted instead of used. */
const UNIT_OF: Readonly<Record<PowerUp, RewardBundle>> = {
  undo: { undos: 1 },
  hint: { hints: 1 },
  extraTube: { extraTubes: 1 },
};

const game = () => useGameStore.getState();
const progress = () => useProgressStore.getState();

const durationSec = (session: GameSession, now: number): number =>
  Math.round(elapsedOf(session, now) / 1000);

// ---------------------------------------------------------------------------------------------
// Starting and finishing levels
// ---------------------------------------------------------------------------------------------

/** Starts `level` fresh and reports `level_start`. */
export const startLevel = (level: Level, mode: GameMode, now: number = Date.now()): void => {
  game().loadLevel(level, mode, now);
  track('level_start', { level: level.config.level, mode, resumed: false });
};

/**
 * Makes sure a session for the player's current level exists: resumes the saved one or starts
 * the level. Returns null when that happened synchronously (the usual case), otherwise a promise
 * that settles once an ungenerated level (> 300) is ready.
 */
export const ensureLevelSession = (now: number = Date.now()): Promise<void> | null => {
  const target = progress().level;
  if (isResumable(game().session, target)) {
    game().resume(now);
    track('level_start', { level: target, mode: 'level', resumed: true });
    return null;
  }
  const ready = readyLevel(target);
  if (ready !== null) {
    startLevel(ready, 'level', now);
    return null;
  }
  return prepareLevel(target).then((level) => {
    if (progress().level === target && !isResumable(game().session, target)) {
      startLevel(level, 'level', Date.now());
    }
  });
};

const finishWin = (session: GameSession, now: number): void => {
  const stars = computeStars(session.moves, session.par);
  const owner = progress();
  const coins =
    session.mode === 'level'
      ? winReward({ stars, hard: session.hard, isVip: owner.entitlements.vip, doubled: false })
      : 0;
  if (session.mode === 'level') {
    owner.completeLevel({ level: session.levelNumber, stars, coins }, now);
    if (session.levelNumber >= TUTORIAL_LAST_LEVEL) owner.markTutorialDone(now);
    void prepareLevel(session.levelNumber + 1);
  }
  game().markWon({ stars, coins, skipped: false, doubled: false });
  track('level_complete', {
    level: session.levelNumber,
    mode: session.mode,
    stars,
    moves: session.moves,
    coins,
    durationSec: durationSec(session, now),
    hintsUsed: session.hintsUsed,
    undosUsed: session.undosUsed,
    skipped: false,
  });
};

/**
 * The board's pour commit (called at the start of the pour animation). Detects the win (progress
 * and coins are granted immediately, so a kill during the win animation loses nothing) and stuck
 * boards.
 */
export const commitPlayerPour = (
  from: number,
  to: number,
  now: number = Date.now(),
): PourOutcome | null => {
  const before = game().session?.status ?? null;
  const outcome = game().commitPour(from, to, now);
  if (outcome === null) return null;
  const session = game().session;
  if (session === null) return outcome;
  if (session.status === 'won') finishWin(session, now);
  else if (session.status === 'stuck' && before !== 'stuck') {
    track('level_stuck', { level: session.levelNumber, moves: session.moves });
  }
  return outcome;
};

// ---------------------------------------------------------------------------------------------
// Power-ups
// ---------------------------------------------------------------------------------------------

/** How `powerUp` would be paid right now. */
export const costOf = (powerUp: PowerUp): CostDecision => {
  const session = game().session;
  const owner = progress();
  switch (powerUp) {
    case 'undo':
      return resolveUndoCost({
        undosUsed: session?.undosUsed ?? 0,
        inventory: owner.undos,
        coins: owner.coins,
      });
    case 'hint':
      return resolveHintCost({ inventory: owner.hints, coins: owner.coins });
    case 'extraTube':
      return resolveExtraTubeCost({
        extraTubeUsed: session?.extraTubeUsed ?? false,
        inventory: owner.extraTubes,
        coins: owner.coins,
      });
  }
};

/** Whether `powerUp` can act on the current board (independent of its price). */
export const canUse = (powerUp: PowerUp): boolean => {
  const session = game().session;
  if (session === null || !isActive(session.status)) return false;
  switch (powerUp) {
    case 'undo':
      return session.history.past.length > 0;
    case 'hint':
      return true;
    case 'extraTube':
      return !session.extraTubeUsed;
  }
};

export type PowerUpResult =
  | { readonly kind: 'applied'; readonly source: PaymentSource }
  /** Neither inventory nor coins cover it: offer a rewarded ad or the Shop. */
  | { readonly kind: 'needsPayment'; readonly powerUp: PowerUp; readonly cost: number }
  | { readonly kind: 'unavailable' };

const pay = (decision: CostDecision, now: number): PaymentSource | null => {
  switch (decision.kind) {
    case 'free':
      return 'free';
    case 'inventory':
      return progress().consume(decision.item, now) ? 'inventory' : null;
    case 'coins':
      return progress().spendCoins(decision.cost, now) ? 'coins' : null;
    case 'adOrShop':
    case 'unavailable':
      return null;
  }
};

const apply = (powerUp: PowerUp, source: PaymentSource, move: Move | null): boolean => {
  const level = game().session?.levelNumber ?? 0;
  switch (powerUp) {
    case 'undo':
      if (!game().undo(source !== 'free')) return false;
      track('undo_used', { level, source });
      return true;
    case 'extraTube':
      if (!game().addTube()) return false;
      track('extra_tube_used', { level, source });
      return true;
    case 'hint':
      if (move === null) return false;
      game().applyHint(move);
      track('hint_used', { level, source });
      return true;
  }
};

/**
 * Uses a power-up, paying with a free undo, inventory or coins in that order. `move` is the hint
 * already found by the solver (hints are only charged once a move exists).
 */
export const activatePowerUp = (
  powerUp: PowerUp,
  move: Move | null = null,
  now: number = Date.now(),
): PowerUpResult => {
  if (!canUse(powerUp) || (powerUp === 'hint' && move === null)) return { kind: 'unavailable' };
  const decision = costOf(powerUp);
  if (decision.kind === 'unavailable') return { kind: 'unavailable' };
  if (decision.kind === 'adOrShop') return { kind: 'needsPayment', powerUp, cost: decision.cost };
  const source = pay(decision, now);
  if (source === null) {
    return { kind: 'needsPayment', powerUp, cost: decision.kind === 'coins' ? decision.cost : 0 };
  }
  apply(powerUp, source, move);
  return { kind: 'applied', source };
};

export type PowerUpAdResult =
  | { readonly kind: 'applied' }
  /** Earned, but the board changed meanwhile: the unit went to the inventory. */
  | { readonly kind: 'granted'; readonly reward: RewardBundle }
  | { readonly kind: 'none' };

/**
 * Pays for a power-up with a rewarded ad. Applied only on `earned`; if the board changed while
 * the ad was up (so it no longer applies), the unit goes to the inventory instead.
 */
export const buyPowerUpWithAd = async (
  powerUp: PowerUp,
  move: Move | null,
  board: Board | null,
): Promise<PowerUpAdResult> => {
  const result = await ads.showRewarded(PLACEMENT_FOR[powerUp]);
  if (result !== 'earned') return { kind: 'none' };
  const sameBoard = board === null || game().session?.history.current === board;
  if (canUse(powerUp) && sameBoard && apply(powerUp, 'ad', move)) return { kind: 'applied' };
  const reward = UNIT_OF[powerUp];
  progress().grant(reward);
  return { kind: 'granted', reward };
};

// ---------------------------------------------------------------------------------------------
// Restart, skip, double coins, next
// ---------------------------------------------------------------------------------------------

/** Restart asks for confirmation only when a paid resource was used this attempt. */
export const restartNeedsConfirm = (): boolean =>
  game().session?.paidResourceUsedThisAttempt ?? false;

export const restartLevel = (now: number = Date.now()): boolean => {
  if (!game().restart(now)) return false;
  const session = game().session;
  if (session !== null) {
    track('level_restart', { level: session.levelNumber, restarts: session.restartsThisLevel });
  }
  return true;
};

/** SKIP_LEVEL is offered when stuck, after 3 restarts, or after 2 minutes on the level. */
export const isSkipOffered = (session: GameSession | null, now: number): boolean =>
  session !== null &&
  session.status !== 'won' &&
  canSkip({
    stuck: session.status === 'stuck' || session.pausedFrom === 'stuck',
    restartsThisLevel: session.restartsThisLevel,
    elapsedMs: elapsedOf(session, now),
  });

/** Watches the SKIP_LEVEL ad; on `earned` the level counts as done with 1★ and no coins. */
export const skipWithAd = async (): Promise<boolean> => {
  const before = game().session;
  if (before === null || before.status === 'won') return false;
  const result = await ads.showRewarded(REWARDED_PLACEMENTS.SKIP_LEVEL);
  if (result !== 'earned') return false;
  const now = Date.now();
  const session = game().session;
  if (session === null || session.levelId !== before.levelId || !game().skip(now)) return false;
  if (session.mode === 'level') {
    progress().skipLevel(session.levelNumber, now);
    if (session.levelNumber >= TUTORIAL_LAST_LEVEL) progress().markTutorialDone(now);
    void prepareLevel(session.levelNumber + 1);
  }
  track('level_complete', {
    level: session.levelNumber,
    mode: session.mode,
    stars: 1,
    moves: session.moves,
    coins: 0,
    durationSec: durationSec(session, now),
    hintsUsed: session.hintsUsed,
    undosUsed: session.undosUsed,
    skipped: true,
  });
  return true;
};

/** Watches the DOUBLE_COINS ad after a win; on `earned` grants the win coins a second time. */
export const doubleWinCoins = async (): Promise<boolean> => {
  const result = game().session?.result;
  if (result === null || result === undefined || result.doubled || result.coins <= 0) return false;
  const shown = await ads.showRewarded(REWARDED_PLACEMENTS.DOUBLE_COINS);
  if (shown !== 'earned') return false;
  const latest = game().session?.result;
  if (latest === null || latest === undefined || latest.doubled) return false;
  progress().grant({ coins: latest.coins });
  game().markWon({ ...latest, doubled: true });
  return true;
};

/**
 * Next on the win (or skip) screen: loads the player's next level, which was prepared during the
 * win animation. Phase 7 extends this function with the interstitial check (`adScheduler`) before
 * the level loads; it is the only place an interstitial may appear (spec §9, §13).
 */
export const onNextPressed = (now: number = Date.now()): void => {
  startLevel(levelNow(progress().level), 'level', now);
};

// ---------------------------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------------------------

/**
 * Pauses the live game and flushes its snapshot whenever the app leaves the foreground, so a
 * kill never loses a move. Returns the unsubscribe function.
 */
export const initGameLifecycle = (): (() => void) => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state !== 'background') return;
    game().pause(Date.now());
    void flushGameSnapshot();
  });
  return () => subscription.remove();
};
