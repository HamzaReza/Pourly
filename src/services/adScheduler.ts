/**
 * Interstitial pacing (spec §13). Pure: the caller passes the state and the clock.
 *
 * An interstitial may appear only when the player presses Next after finishing a level, and only
 * when every rule below allows it. Elapsed times that come out negative (a clock turned back)
 * count as "too recent", so a rolled-back clock can never cause an extra ad.
 */
import type { AdsProgress } from '@/state/progressModel';

export const INTERSTITIAL_RULES = {
  /** No interstitial follows a level before this one. */
  minLevel: 6,
  /** Completed levels needed since the last interstitial. */
  everyLevels: 3,
  minSinceInterstitialMs: 120_000,
  minSinceRewardedMs: 60_000,
  /** Ad-free start of the very first session. */
  firstSessionGraceMs: 5 * 60_000,
} as const;

export type InterstitialTrigger = 'next' | 'other';

export interface InterstitialState {
  readonly trigger: InterstitialTrigger;
  readonly mode: 'level' | 'daily';
  /** The level just finished (0 when none was). */
  readonly completedLevel: number;
  /** The level was skipped with the SKIP_LEVEL ad (the stuck flow). */
  readonly skipped: boolean;
  readonly entitlements: { readonly noAds: boolean; readonly vip: boolean };
  readonly ads: Pick<
    AdsProgress,
    'lastInterstitialAt' | 'lastRewardedAt' | 'levelsSinceInterstitial'
  >;
  readonly sessionCount: number;
  readonly firstSessionStartedAt: number;
}

export type InterstitialBlock =
  | 'notNext'
  | 'daily'
  | 'stuckFlow'
  | 'adFree'
  | 'tooEarlyLevel'
  | 'cadence'
  | 'recentInterstitial'
  | 'recentRewarded'
  | 'firstSession';

export type InterstitialVerdict =
  { readonly show: true } | { readonly show: false; readonly reason: InterstitialBlock };

const blocked = (reason: InterstitialBlock): InterstitialVerdict => ({ show: false, reason });

/** True while less than `minMs` has passed since `at` (or the clock went backwards). */
const tooRecent = (at: number, now: number, minMs: number): boolean => {
  const elapsed = now - at;
  return elapsed < minMs;
};

/** Every §13 rule, in order; the first one that fails is reported. */
export const interstitialVerdict = (state: InterstitialState, now: number): InterstitialVerdict => {
  if (state.trigger !== 'next') return blocked('notNext');
  if (state.mode !== 'level') return blocked('daily');
  if (state.skipped) return blocked('stuckFlow');
  if (state.entitlements.vip || state.entitlements.noAds) return blocked('adFree');
  if (state.completedLevel < INTERSTITIAL_RULES.minLevel) return blocked('tooEarlyLevel');
  if (state.ads.levelsSinceInterstitial < INTERSTITIAL_RULES.everyLevels) {
    return blocked('cadence');
  }
  if (
    state.ads.lastInterstitialAt > 0 &&
    tooRecent(state.ads.lastInterstitialAt, now, INTERSTITIAL_RULES.minSinceInterstitialMs)
  ) {
    return blocked('recentInterstitial');
  }
  if (
    state.ads.lastRewardedAt > 0 &&
    tooRecent(state.ads.lastRewardedAt, now, INTERSTITIAL_RULES.minSinceRewardedMs)
  ) {
    return blocked('recentRewarded');
  }
  if (
    state.sessionCount <= 1 &&
    tooRecent(state.firstSessionStartedAt, now, INTERSTITIAL_RULES.firstSessionGraceMs)
  ) {
    return blocked('firstSession');
  }
  return { show: true };
};

/** Whether an interstitial may be shown now. */
export const shouldShowInterstitial = (state: InterstitialState, now: number): boolean =>
  interstitialVerdict(state, now).show;
