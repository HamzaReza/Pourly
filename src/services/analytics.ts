/**
 * Analytics abstraction (spec §18). `track` forwards typed events to the installed adapter; the
 * default adapter logs in development and does nothing in release builds. A real backend (for
 * example Firebase Analytics) plugs in with `setAnalyticsAdapter` without touching call sites.
 */
import type { RewardedPlacement } from '@/config/ads';
import { logger } from '@/utils/logger';

export type GameModeParam = 'level' | 'daily' | 'replay';

/** How a power-up was paid for. */
export type PaymentSource = 'free' | 'inventory' | 'coins' | 'ad';

/** Why a sign-in did not complete (`sign_in_failed`). */
export type SignInFailureReason =
  'cancelled' | 'playServices' | 'network' | 'inProgress' | 'unavailable' | 'unknown';

/** Parameters of every event, keyed by event name. */
export interface AnalyticsEvents {
  app_open: { session: number };
  level_start: { level: number; mode: GameModeParam; resumed: boolean };
  level_complete: {
    level: number;
    mode: GameModeParam;
    stars: number;
    moves: number;
    coins: number;
    durationSec: number;
    hintsUsed: number;
    undosUsed: number;
    skipped: boolean;
  };
  level_stuck: { level: number; moves: number };
  /** The chapter gate dialog opened (P12.7); `stars` held in the previous chapter. */
  chapter_gate_shown: { chapter: number; stars: number; target: number };
  chapter_unlocked: { chapter: number; method: 'stars' | 'coins'; coins: number };
  /** A completed level opened from the Levels screen; `bestStars` before this play. */
  replay_started: { level: number; bestStars: number };
  replay_completed: {
    level: number;
    stars: number;
    previousStars: number;
    improved: boolean;
    coins: number;
  };
  level_restart: { level: number; restarts: number };
  hint_used: { level: number; source: PaymentSource };
  undo_used: { level: number; source: PaymentSource };
  extra_tube_used: { level: number; source: PaymentSource };
  ad_rewarded_requested: { placement: RewardedPlacement };
  ad_rewarded_earned: { placement: RewardedPlacement };
  ad_interstitial_shown: { level: number };
  ad_load_failed: { format: 'rewarded' | 'interstitial'; code: string };
  shop_opened: { from: string };
  iap_started: { productId: string };
  iap_success: { productId: string };
  iap_failed: { productId: string; reason: string };
  notification_prompt_result: { granted: boolean; askedCount: number };
  daily_started: { date: string };
  daily_completed: { date: string; stars: number; moves: number };
  streak_extended: { streak: number };
  theme_unlocked: { themeId: string; via: string };
  setting_changed: { setting: string; value: string };
  tutorial_step: { level: number; step: number };
  sign_in_success: { method: 'google' };
  sign_in_failed: { method: 'google'; reason: SignInFailureReason };
  sign_out: { method: 'google' };
  account_deleted: { method: 'google' };
}

export type AnalyticsEvent = keyof AnalyticsEvents;

export type AnalyticsParams = Readonly<Record<string, string | number | boolean>>;

/** A backend. Receives the event name and its flat parameters. */
export interface AnalyticsAdapter {
  track: (event: AnalyticsEvent, params: AnalyticsParams) => void;
}

/** Logs in `__DEV__`, no-op in production. */
export const defaultAnalyticsAdapter: AnalyticsAdapter = {
  track: (event, params) => {
    if (__DEV__) logger.debug('analytics', event, params);
  },
};

let adapter: AnalyticsAdapter = defaultAnalyticsAdapter;

/** Installs a backend; pass `defaultAnalyticsAdapter` to restore the default. */
export const setAnalyticsAdapter = (next: AnalyticsAdapter): void => {
  adapter = next;
};

/** Sends one event. Never throws: a failing adapter must not break gameplay. */
export const track = <E extends AnalyticsEvent>(event: E, params: AnalyticsEvents[E]): void => {
  try {
    adapter.track(event, params);
  } catch (error: unknown) {
    logger.warn('Analytics adapter failed', event, error);
  }
};
