/**
 * Meta-game actions behind Home, Shop, Themes and Settings: daily gift (with the DAILY_GIFT_X2 ad),
 * VIP daily bonus, free coins (FREE_COINS ad), theme unlocks and the progress reset. No React; screens render the typed results.
 */
import { REWARDED_PLACEMENTS } from '@/config/ads';
import type { RewardBundle } from '@/config/economy';
import { freeCoinsStatus } from '@/game/freeCoins';
import type { GiftClaim, VipBonusClaim } from '@/game/gifts';
import { themeStatus } from '@/game/themeUnlocks';
import { isThemeId } from '@/render/themes';
import { ads } from '@/services/ads';
import { track } from '@/services/analytics';

import { localToday } from './gameFlow';
import { flushGameSnapshot, useGameStore } from './gameStore';
import { prepareLevel } from './levelLoader';
import { useProgressStore } from './progressStore';

const progress = () => useProgressStore.getState();

/** Claims today's daily gift (VIP ×2). */
export const claimDailyGift = (now: number = Date.now()): GiftClaim =>
  progress().claimGift(localToday(now), now);

/**
 * Doubles a claimed gift with the DAILY_GIFT_X2 rewarded ad: the same reward is granted once more,
 * only on `earned`. The caller offers it once per claim.
 */
export const doubleGiftWithAd = async (reward: RewardBundle): Promise<boolean> => {
  const result = await ads.showRewarded(REWARDED_PLACEMENTS.DAILY_GIFT_X2);
  if (result !== 'earned') return false;
  progress().grant(reward);
  return true;
};

/**
 * Shop "Free coins ▶": shows the FREE_COINS rewarded ad when the cooldown and daily cap allow it
 * and grants `freeCoinsAdReward` only on `earned`. Returns the coins granted (0 otherwise).
 */
export const watchFreeCoinsAd = async (): Promise<number> => {
  if (freeCoinsStatus(progress(), localToday(), Date.now()).kind !== 'ready') return 0;
  const result = await ads.showRewarded(REWARDED_PLACEMENTS.FREE_COINS);
  if (result !== 'earned') return 0;
  const now = Date.now();
  return progress().claimFreeCoins(localToday(now), now);
};

/** Claims the VIP daily bonus (VIP only, once per local day). */
export const claimVipDailyBonus = (now: number = Date.now()): VipBonusClaim =>
  progress().claimVipBonus(localToday(now), now);

export type ThemeUnlockResult =
  | { readonly kind: 'unlocked' }
  | { readonly kind: 'notEnoughCoins'; readonly price: number }
  | { readonly kind: 'unavailable' };

/** Buys a coin theme with coins and applies it (emits `theme_unlocked`). */
export const unlockThemeWithCoins = (
  themeId: string,
  now: number = Date.now(),
): ThemeUnlockResult => {
  const owner = progress();
  if (!isThemeId(themeId)) return { kind: 'unavailable' };
  const status = themeStatus(themeId, owner);
  if (status.kind !== 'coins') return { kind: 'unavailable' };
  if (owner.coins < status.price) return { kind: 'notEnoughCoins', price: status.price };
  if (!owner.unlockTheme(themeId, now)) return { kind: 'notEnoughCoins', price: status.price };
  track('theme_unlocked', { themeId, via: 'coins' });
  return { kind: 'unlocked' };
};

/**
 * Settings → Reset progress: clears play progress (purchases survive, see `applyResetProgress`)
 * and both saved games, then gets level 1 ready.
 */
export const resetAllProgress = async (now: number = Date.now()): Promise<void> => {
  progress().resetProgress(now);
  useGameStore.getState().clearAll();
  await flushGameSnapshot();
  void prepareLevel(1);
};
