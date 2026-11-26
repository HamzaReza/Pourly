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
  extraTubesLeft,
  resolveExtraTubeCost,
  resolveHintCost,
  resolveUndoCost,
  replayReward,
  winReward,
  type CostDecision,
  type PowerUp,
} from '@/game/economy';
import { dailyDateOf, dailyLevelId } from '@/game/daily';
import { computeStars } from '@/game/stars';
import { TUTORIAL_LAST_LEVEL } from '@/game/tutorial';
import type { Board, Level, Move, PourOutcome } from '@/game/types';
import { isAdShowing } from '@/services/adPresence';
import { ads } from '@/services/ads';
import { shouldShowInterstitial, type InterstitialState } from '@/services/adScheduler';
import { track, type PaymentSource } from '@/services/analytics';
import { localDateString } from '@/utils/date';

import { chapterOpenedByStars, currentProgressionGate, nextChapterOpen } from './chapterFlow';
import { prepareDaily, readyDaily } from './dailyLoader';
import {
  elapsedOf,
  flushGameSnapshot,
  isActive,
  isDailyResumable,
  isResumable,
  selectTubeAdUnavailable,
  useGameStore,
  type DailyWinInfo,
  type GameMode,
  type GameSession,
  type ReplayWinInfo,
} from './gameStore';
import { levelNow, prepareLevel, readyLevel } from './levelLoader';
import type { StarCount } from './progressModel';
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
  // A locked chapter blocks progression on every route (Home, deep link, resume): the screen
  // shows the gate instead (P12.7).
  if (currentProgressionGate() !== null) return null;
  const target = progress().level;
  game().switchTo('level', now);
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

/** Starts a replay of the completed `level` and reports `level_start` and `replay_started`. */
const startReplay = (level: Level, now: number): void => {
  const number = level.config.level;
  startLevel(level, 'replay', now);
  track('replay_started', { level: number, bestStars: progress().stars[number] ?? 0 });
};

/**
 * Starts a fresh replay of `levelNumber` (a level below the player's current one). The player's
 * real slots are stashed untouched until the replay ends (`exitReplay`). Returns null when it
 * started synchronously, else a promise that settles once the level is ready; `isWanted` drops a
 * late result (the player left first). Levels not yet reached are refused (returns null).
 */
export const ensureReplaySession = (
  levelNumber: number,
  now: number = Date.now(),
  isWanted: () => boolean = () => true,
): Promise<void> | null => {
  if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber >= progress().level) {
    return null;
  }
  const ready = readyLevel(levelNumber);
  if (ready !== null) {
    startReplay(ready, now);
    return null;
  }
  return prepareLevel(levelNumber).then((level) => {
    if (isWanted()) startReplay(level, Date.now());
  });
};

/** The player's local calendar date now (`YYYY-MM-DD`). */
export const localToday = (now: number = Date.now()): string => localDateString(new Date(now));

/** Starts the daily board fresh and reports `level_start` and `daily_started`. */
const startDaily = (level: Level, date: string, now: number): void => {
  startLevel(level, 'daily', now);
  track('daily_started', { date });
};

/**
 * Makes sure a session for the daily of `today` exists: resumes today's unfinished one (from
 * either slot) or starts the board, which is generated in idle slices when it is not ready yet.
 * A level in progress is parked, never discarded. `isWanted` lets the caller drop a late result
 * (the player left before the board was ready).
 */
export const ensureDailySession = (
  today: string,
  now: number = Date.now(),
  isWanted: () => boolean = () => true,
): Promise<void> | null => {
  const id = dailyLevelId(today);
  game().switchTo('daily', now);
  if (isDailyResumable(game().session, id)) {
    game().resume(now);
    track('level_start', { level: 0, mode: 'daily', resumed: true });
    return null;
  }
  const ready = readyDaily(today);
  if (ready !== null) {
    startDaily(ready, today, now);
    return null;
  }
  return prepareDaily(today).then((level) => {
    if (isWanted() && !isDailyResumable(game().session, id)) startDaily(level, today, Date.now());
  });
};

/** Daily reward, history and streak for a solved daily board (granted once per day). */
const finishDaily = (
  session: GameSession,
  stars: StarCount,
  now: number,
): { coins: number; daily: DailyWinInfo } => {
  const date = dailyDateOf(session.levelId);
  if (date === null) return { coins: 0, daily: { streak: progress().streak, rewarded: false } };
  const result = progress().completeDaily({
    date,
    today: localToday(now),
    now,
    stars,
    moves: session.moves,
  });
  track('daily_completed', { date, stars, moves: session.moves });
  if (result.outcome === 'consecutive' || result.outcome === 'freeze') {
    track('streak_extended', { streak: result.streak });
  }
  return { coins: result.coins, daily: { streak: result.streak, rewarded: result.coins > 0 } };
};

const finishWin = (session: GameSession, now: number): void => {
  const stars = computeStars(session.moves, session.par);
  const owner = progress();
  const gated = session.mode !== 'daily';
  const nextOpenBefore = gated ? nextChapterOpen(session.levelNumber) : true;
  let coins = 0;
  let daily: DailyWinInfo | undefined;
  let replay: ReplayWinInfo | undefined;
  if (session.mode === 'replay') {
    const previousStars = owner.stars[session.levelNumber] ?? null;
    coins = replayReward({
      previousStars,
      stars,
      hard: session.hard,
      isVip: owner.entitlements.vip,
    });
    owner.completeReplay({ level: session.levelNumber, stars, coins }, now);
    replay = { previousStars, improved: previousStars === null || stars > previousStars };
    track('replay_completed', {
      level: session.levelNumber,
      stars,
      previousStars: previousStars ?? 0,
      improved: replay.improved,
      coins,
    });
  } else if (session.mode === 'level') {
    coins = winReward({ stars, hard: session.hard, isVip: owner.entitlements.vip, doubled: false });
    owner.completeLevel({ level: session.levelNumber, stars, coins }, now);
    if (session.levelNumber >= TUTORIAL_LAST_LEVEL) owner.markTutorialDone(now);
    void prepareLevel(session.levelNumber + 1);
  } else {
    ({ coins, daily } = finishDaily(session, stars, now));
  }
  const chapterUnlocked = gated ? chapterOpenedByStars(session.levelNumber, nextOpenBefore) : null;
  game().markWon({
    stars,
    coins,
    skipped: false,
    doubled: false,
    ...(daily === undefined ? {} : { daily }),
    ...(replay === undefined ? {} : { replay }),
    ...(chapterUnlocked === null ? {} : { chapterUnlocked }),
  });
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

/**
 * How `powerUp` would be paid right now. After the level's free +Tube ad could not be shown, the
 * +Tube is priced as if the ad were used (coins, then Shop) without marking it used.
 */
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
        tubesAdded: session?.extraTubesAdded ?? 0,
        adTubeUsed: (session?.adTubeUsed ?? false) || selectTubeAdUnavailable(game()),
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
      return extraTubesLeft(session.extraTubesAdded) > 0;
  }
};

export type PowerUpResult =
  | { readonly kind: 'applied'; readonly source: PaymentSource }
  /** Neither inventory nor coins cover it: offer a rewarded ad or the Shop. */
  | { readonly kind: 'needsPayment'; readonly powerUp: PowerUp; readonly cost: number }
  /** Paid by the level's one rewarded ad (+Tube): show it straight away with `buyPowerUpWithAd`. */
  | { readonly kind: 'needsAd'; readonly powerUp: PowerUp }
  /** Coins are short and no ad is left (+Tube): offer the Shop only. */
  | { readonly kind: 'needsShop'; readonly powerUp: PowerUp; readonly cost: number }
  | { readonly kind: 'unavailable' };

const pay = (decision: CostDecision, now: number): PaymentSource | null => {
  switch (decision.kind) {
    case 'free':
      return 'free';
    case 'inventory':
      return progress().consume(decision.item, now) ? 'inventory' : null;
    case 'coins':
      return progress().spendCoins(decision.cost, now) ? 'coins' : null;
    case 'ad':
    case 'adOrShop':
    case 'shop':
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
      if (!game().addTube(source === 'ad')) return false;
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
 * Uses a power-up, paying with a free undo, inventory or coins in that order (the extra tube
 * tries its one ad per level before coins). `move` is the hint already found by the solver (hints
 * are only charged once a move exists).
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
  if (decision.kind === 'ad') return { kind: 'needsAd', powerUp };
  if (decision.kind === 'shop') return { kind: 'needsShop', powerUp, cost: decision.cost };
  const source = pay(decision, now);
  if (source === null) {
    const cost = decision.kind === 'coins' ? decision.cost : 0;
    // The +Tube has no second ad: a failed payment sends the player to the Shop only.
    return powerUp === 'extraTube'
      ? { kind: 'needsShop', powerUp, cost }
      : { kind: 'needsPayment', powerUp, cost };
  }
  apply(powerUp, source, move);
  return { kind: 'applied', source };
};

export type PowerUpAdResult =
  | { readonly kind: 'applied' }
  /** Earned, but the board changed meanwhile: the unit went to the inventory. */
  | { readonly kind: 'granted'; readonly reward: RewardBundle }
  /** The ad could not be shown (not ready, no fill, offline, error); nothing was spent. */
  | { readonly kind: 'adUnavailable' }
  | { readonly kind: 'none' };

/**
 * Pays for a power-up with a rewarded ad. Applied only on `earned`; if the board changed while
 * the ad was up (so it no longer applies), the unit goes to the inventory instead. The extra tube
 * has one ad per level: it is not shown again once used, and an earned one is spent on the level
 * even when its unit was banked. When the +Tube ad cannot be shown (`adUnavailable`, told apart
 * from `none` = dismissed early or not offered), the generic "ad not ready" toast is skipped (the
 * screen shows a +Tube one) and the level's +Tube switches to coins without spending the ad.
 */
export const buyPowerUpWithAd = async (
  powerUp: PowerUp,
  move: Move | null,
  board: Board | null,
): Promise<PowerUpAdResult> => {
  const before = game().session;
  const tube = powerUp === 'extraTube';
  if (tube && (before === null || before.adTubeUsed)) return { kind: 'none' };
  const placement = PLACEMENT_FOR[powerUp];
  const result = await (tube
    ? ads.showRewarded(placement, { quietUnavailable: true })
    : ads.showRewarded(placement));
  if (result === 'unavailable') {
    if (tube && game().session?.levelId === before?.levelId) game().markTubeAdUnavailable();
    return { kind: 'adUnavailable' };
  }
  if (result !== 'earned') return { kind: 'none' };
  const sameLevel = before !== null && game().session?.levelId === before.levelId;
  const sameBoard = board === null || game().session?.history.current === board;
  if (sameLevel && canUse(powerUp) && sameBoard && apply(powerUp, 'ad', move)) {
    return { kind: 'applied' };
  }
  const reward = UNIT_OF[powerUp];
  progress().grant(reward);
  if (powerUp === 'extraTube' && sameLevel) game().markAdTubeUsed();
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
  session.mode === 'level' &&
  session.status !== 'won' &&
  canSkip({
    stuck: session.status === 'stuck' || session.pausedFrom === 'stuck',
    restartsThisLevel: session.restartsThisLevel,
    elapsedMs: elapsedOf(session, now),
  });

/**
 * Watches the SKIP_LEVEL ad; on `earned` the level counts as done with 1★ and no coins. Daily
 * boards cannot be skipped (a skip would buy the day's streak and reward).
 */
export const skipWithAd = async (): Promise<boolean> => {
  const before = game().session;
  if (before === null || before.status === 'won' || before.mode !== 'level') return false;
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

/** The interstitial pacing input for the session the player is leaving with Next. */
const interstitialState = (): InterstitialState => {
  const session = game().session;
  const owner = progress();
  const won = session !== null && session.status === 'won';
  return {
    trigger: 'next',
    mode: session?.mode ?? 'level',
    completedLevel: won ? session.levelNumber : 0,
    skipped: session?.result?.skipped ?? false,
    entitlements: owner.entitlements,
    ads: owner.ads,
    sessionCount: owner.sessionCount,
    firstSessionStartedAt: owner.firstSessionStartedAt,
  };
};

let nextInFlight = false;

/** Starts the player's next level, unless a locked chapter blocks it (the screen shows the gate). */
const startNextLevel = (now: number): void => {
  if (currentProgressionGate() !== null) return;
  startLevel(levelNow(progress().level), 'level', now);
};

/**
 * Next on the win (or skip) screen: loads the player's next level, which was prepared during the
 * win animation. This is the only place an interstitial may appear (spec §9, §13): when
 * `shouldShowInterstitial` allows it and one is loaded, it plays first and the level loads when it
 * closes; showing one restarts the cadence counter and stamps its time. When no ad is allowed the
 * level starts synchronously (returns null); otherwise the returned promise settles once the level
 * has started. Level mode only: the daily win overlay has no Next.
 */
export const onNextPressed = (now: number = Date.now()): Promise<void> | null => {
  if (nextInFlight) return null;
  const state = interstitialState();
  if (!shouldShowInterstitial(state, now)) {
    startNextLevel(now);
    return null;
  }
  nextInFlight = true;
  const run = async (): Promise<void> => {
    try {
      const shown = await ads.showInterstitial();
      if (shown) {
        progress().recordInterstitial(Date.now());
        track('ad_interstitial_shown', { level: state.completedLevel });
      }
    } finally {
      nextInFlight = false;
      startNextLevel(Date.now());
    }
  };
  return run();
};

// ---------------------------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------------------------

/**
 * Pauses the live game and flushes its snapshot whenever the app leaves the foreground, so a
 * kill never loses a move. A full-screen AdMob ad also sends the app to the background; the game
 * is not paused for it, so a power-up earned from the ad still applies to the live board. Returns
 * the unsubscribe function.
 */
export const initGameLifecycle = (): (() => void) => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state !== 'background') return;
    if (!isAdShowing()) game().pause(Date.now());
    void flushGameSnapshot();
  });
  return () => subscription.remove();
};
