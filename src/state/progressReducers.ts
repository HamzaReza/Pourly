/**
 * Pure reducers behind the progress store actions. Each takes the current state and returns the
 * next one (or null when the action cannot apply), so the rules are unit-testable without the
 * store or storage.
 */
import type { RewardBundle } from '@/config/economy';
import { applyDailyCompletion, type DailyCompletionOutcome } from '@/game/daily';
import { dailyChallengeReward } from '@/game/economy';
import { claimFreeCoins } from '@/game/freeCoins';
import { claimGift, claimVipBonus, type GiftClaim, type VipBonusClaim } from '@/game/gifts';
import { starterPackWindowToOpen } from '@/game/starterPack';
import { effectiveThemeId, themeStatus } from '@/game/themeUnlocks';
import { isThemeId } from '@/render/themes';
import { daysBetween } from '@/utils/date';

import { createDefaultProgress, type ProgressState, type StarCount } from './progressModel';

export interface CompleteLevelInput {
  readonly level: number;
  readonly stars: StarCount;
  /** Coins already computed by `winReward`. */
  readonly coins: number;
}

const bestStars = (current: StarCount | undefined, stars: StarCount): StarCount =>
  current === undefined || stars > current ? stars : current;

const wholeNonNegative = (value: number | undefined): number =>
  value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, Math.floor(value));

/**
 * A finished level: best stars kept, `level` advanced past it (replays never move it back),
 * coins granted, the 3★ streak (review prompt) updated and the interstitial counter bumped.
 */
export const applyCompleteLevel = (
  state: ProgressState,
  { level, stars, coins }: CompleteLevelInput,
  now: number,
): ProgressState => ({
  ...state,
  stars: { ...state.stars, [level]: bestStars(state.stars[level], stars) },
  level: Math.max(state.level, level + 1),
  coins: state.coins + wholeNonNegative(coins),
  review: {
    ...state.review,
    threeStarStreak: stars === 3 ? state.review.threeStarStreak + 1 : 0,
  },
  ads: { ...state.ads, levelsSinceInterstitial: state.ads.levelsSinceInterstitial + 1 },
  updatedAt: now,
});

/**
 * A level skipped with the SKIP_LEVEL ad: completed with 1★ unless better stars exist, no coins.
 * It breaks the 3★ streak and does not count toward the interstitial cadence (stuck flow).
 */
export const applySkipLevel = (
  state: ProgressState,
  level: number,
  now: number,
): ProgressState => ({
  ...state,
  stars: { ...state.stars, [level]: state.stars[level] ?? 1 },
  level: Math.max(state.level, level + 1),
  review: { ...state.review, threeStarStreak: 0 },
  updatedAt: now,
});

/** Spends coins; null when the balance is too low or the amount is invalid. */
export const applySpendCoins = (
  state: ProgressState,
  amount: number,
  now: number,
): ProgressState | null => {
  if (!Number.isInteger(amount) || amount < 0 || state.coins < amount) return null;
  return { ...state, coins: state.coins - amount, updatedAt: now };
};

/** Adds every field of a reward bundle (negative or fractional values are ignored). */
export const applyGrant = (
  state: ProgressState,
  bundle: RewardBundle,
  now: number,
): ProgressState => ({
  ...state,
  coins: state.coins + wholeNonNegative(bundle.coins),
  hints: state.hints + wholeNonNegative(bundle.hints),
  undos: state.undos + wholeNonNegative(bundle.undos),
  extraTubes: state.extraTubes + wholeNonNegative(bundle.extraTubes),
  updatedAt: now,
});

export type ConsumableItem = 'hints' | 'undos' | 'extraTubes';

/** Uses one inventory item; null when none is left. */
export const applyConsume = (
  state: ProgressState,
  item: ConsumableItem,
  now: number,
): ProgressState | null => {
  if (state[item] <= 0) return null;
  return { ...state, [item]: state[item] - 1, updatedAt: now };
};

export const applyMarkTutorialDone = (state: ProgressState, now: number): ProgressState =>
  state.tutorialDone ? state : { ...state, tutorialDone: true, updatedAt: now };

/** Records an earned rewarded ad (interstitial spacing, spec §13). */
export const applyRewardedShown = (state: ProgressState, now: number): ProgressState => ({
  ...state,
  ads: { ...state.ads, lastRewardedAt: now },
  updatedAt: now,
});

/** An interstitial was shown: the cadence counter restarts and the spacing clock is stamped. */
export const applyInterstitialShown = (state: ProgressState, now: number): ProgressState => ({
  ...state,
  ads: { ...state.ads, lastInterstitialAt: now, levelsSinceInterstitial: 0 },
  updatedAt: now,
});

export interface FreeCoinsResult {
  readonly state: ProgressState;
  /** Coins granted (0 when no claim was allowed). */
  readonly coins: number;
}

/** Grants the FREE_COINS reward after an earned ad, within the cooldown and daily cap. */
export const applyClaimFreeCoins = (
  state: ProgressState,
  today: string,
  now: number,
): FreeCoinsResult => {
  const claim = claimFreeCoins(state, today, now);
  if (claim === null) return { state, coins: 0 };
  return {
    state: {
      ...state,
      coins: state.coins + claim.coins,
      ads: { ...state.ads, ...claim.ads },
      lastSeenAt: claim.lastSeenAt,
      updatedAt: now,
    },
    coins: claim.coins,
  };
};

/** Latest trusted time: a rolled-back clock never moves `lastSeenAt` backwards. */
const seen = (state: ProgressState, now: number): number => Math.max(state.lastSeenAt, now);

// ---------------------------------------------------------------------------------------------
// Daily challenge
// ---------------------------------------------------------------------------------------------

export interface DailyCompleteInput {
  /** Date of the daily board that was solved (`YYYY-MM-DD`). */
  readonly date: string;
  /** Player's local date at completion. */
  readonly today: string;
  readonly now: number;
  readonly stars: StarCount;
  readonly moves: number;
}

/** `stale`: the board belongs to a day before yesterday; it grants nothing. */
export type DailyCompleteOutcome = DailyCompletionOutcome | 'stale';

export interface DailyCompleteResult {
  readonly state: ProgressState;
  /** Coins granted (0 on a replay, a stale board or a clock rollback). */
  readonly coins: number;
  /** The streak after this completion. */
  readonly streak: number;
  readonly outcome: DailyCompleteOutcome;
}

/**
 * A solved daily board. The reward (`dailyChallengeCoins` + streak bonus, ×2 VIP) is granted once
 * per calendar day; the day goes into `dailyHistory`. The board's own date is credited, so a
 * board started before midnight and finished after it still counts for its day; a board older
 * than yesterday, a date in the future (clock rollback) or `now < lastSeenAt` grants nothing.
 */
export const applyDailyComplete = (
  state: ProgressState,
  { date, today, now, stars, moves }: DailyCompleteInput,
): DailyCompleteResult => {
  const unchanged = (outcome: DailyCompleteOutcome): DailyCompleteResult => ({
    state,
    coins: 0,
    streak: state.streak,
    outcome,
  });
  const age = daysBetween(date, today);
  if (Number.isNaN(age) || age < 0) return unchanged('clockRollback');
  if (age > 1) return unchanged('stale');
  const isVip = state.entitlements.vip;
  const completion = applyDailyCompletion(state, { today: date, now, isVip });
  if (!completion.rewardGranted) return unchanged(completion.outcome);
  const coins = dailyChallengeReward({ streak: completion.state.streak, isVip });
  return {
    state: {
      ...state,
      ...completion.state,
      coins: state.coins + coins,
      dailyHistory: { ...state.dailyHistory, [date]: { stars, moves: wholeNonNegative(moves) } },
      lastSeenAt: seen(state, now),
      updatedAt: now,
    },
    coins,
    streak: completion.state.streak,
    outcome: completion.outcome,
  };
};

// ---------------------------------------------------------------------------------------------
// Daily gift and VIP bonus
// ---------------------------------------------------------------------------------------------

export interface ClaimResult<C> {
  readonly state: ProgressState;
  readonly claim: C;
}

/** Claims today's gift and grants it (VIP ×2). */
export const applyClaimGift = (
  state: ProgressState,
  today: string,
  now: number,
): ClaimResult<GiftClaim> => {
  const claim = claimGift(state, { today, now, isVip: state.entitlements.vip });
  if (claim.kind !== 'granted') return { state, claim };
  return { state: { ...applyGrant(state, claim.reward, now), ...claim.state }, claim };
};

/** Claims the VIP daily bonus and grants it. */
export const applyClaimVipBonus = (
  state: ProgressState,
  today: string,
  now: number,
): ClaimResult<VipBonusClaim> => {
  const claim = claimVipBonus(state, { today, now, isVip: state.entitlements.vip });
  if (claim.kind !== 'granted') return { state, claim };
  return { state: { ...applyGrant(state, claim.reward, now), ...claim.state }, claim };
};

// ---------------------------------------------------------------------------------------------
// Starter pack
// ---------------------------------------------------------------------------------------------

/** Starts the 72-hour Starter Pack window the first time the player is eligible. */
export const applyOpenStarterPackWindow = (state: ProgressState, now: number): ProgressState => {
  const expiresAt = starterPackWindowToOpen(state, now);
  return expiresAt === null ? state : { ...state, starterPackExpiresAt: expiresAt, updatedAt: now };
};

// ---------------------------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------------------------

/** Buys a coin theme and applies it; null when it is not a locked coin theme or too expensive. */
export const applyUnlockTheme = (
  state: ProgressState,
  themeId: string,
  now: number,
): ProgressState | null => {
  if (!isThemeId(themeId)) return null;
  const status = themeStatus(themeId, state);
  if (status.kind !== 'coins') return null;
  const paid = applySpendCoins(state, status.price, now);
  if (paid === null) return null;
  return { ...paid, ownedThemes: [...paid.ownedThemes, themeId], activeTheme: themeId };
};

/** Applies an available theme; null when it is locked or unknown. */
export const applySetActiveTheme = (
  state: ProgressState,
  themeId: string,
  now: number,
): ProgressState | null => {
  if (effectiveThemeId(themeId, state) !== themeId) return null;
  return state.activeTheme === themeId ? state : { ...state, activeTheme: themeId, updatedAt: now };
};

/** Persists the Classic fallback when the active theme is no longer available (VIP lapsed). */
export const applyThemeFallback = (state: ProgressState, now: number): ProgressState => {
  const effective = effectiveThemeId(state.activeTheme, state);
  return effective === state.activeTheme
    ? state
    : { ...state, activeTheme: effective, updatedAt: now };
};

// ---------------------------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------------------------

/**
 * "Reset progress": everything earned by playing goes back to a new player's state (level 1,
 * stars, balances, streaks, daily history, gift cycle, bought coin themes, tutorial). Kept:
 * purchases (`entitlements`, `processedTransactions`, `pendingPurchases`, `starterPackPurchased`
 * and the Aurora theme it unlocks), the Starter Pack window (a reset must not reopen the offer), the install date,
 * session and clock stamps (rollback guard), ad pacing counters, notification permission state,
 * review-prompt history and the cloud-sync baseline. The active theme stays when it is still
 * available (Aurora, Gold), otherwise it returns to Classic.
 */
export const applyResetProgress = (state: ProgressState, now: number): ProgressState => {
  const fresh = createDefaultProgress(now);
  const ownedThemes = state.starterPackPurchased
    ? [...fresh.ownedThemes, 'aurora']
    : fresh.ownedThemes;
  const owner = {
    ownedThemes,
    entitlements: state.entitlements,
    starterPackPurchased: state.starterPackPurchased,
  };
  return {
    ...fresh,
    activeTheme: effectiveThemeId(state.activeTheme, owner),
    installDate: state.installDate,
    lastOpenAt: state.lastOpenAt,
    lastSeenAt: seen(state, now),
    sessionCount: state.sessionCount,
    firstSessionStartedAt: state.firstSessionStartedAt,
    ownedThemes,
    entitlements: { ...state.entitlements },
    processedTransactions: [...state.processedTransactions],
    pendingPurchases: state.pendingPurchases.map((entry) => ({ ...entry })),
    starterPackExpiresAt: state.starterPackExpiresAt,
    starterPackPurchased: state.starterPackPurchased,
    ads: { ...state.ads },
    notifications: { ...state.notifications },
    review: { ...state.review },
    lastSyncedBalances: state.lastSyncedBalances,
    updatedAt: now,
  };
};
