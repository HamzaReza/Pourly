/**
 * Daily gift and VIP daily bonus (spec §11, §12). Pure: the caller passes the player's local date
 * and the clock, and persists the returned fields.
 *
 * - The gift cycles through `ECONOMY.dailyGiftCycle`; index 6 is the day-7 chest. A missed day
 *   does not reset the cycle: the next claim simply continues where the player left off.
 * - One claim per local calendar day. VIP doubles the gift.
 * - Clock rollback (`now < lastSeenAt`, or `today` before the last claim date) grants nothing and
 *   keeps the state.
 */
import { DAILY_GIFT_CYCLE_LENGTH, ECONOMY, type RewardBundle } from '@/config/economy';
import type { ProgressState } from '@/state/progressModel';
import { daysBetween } from '@/utils/date';

import { scaleReward } from './economy';

const assertLocalDate = (localDate: string): void => {
  if (Number.isNaN(daysBetween(localDate, localDate))) {
    throw new Error(`Expected a local date as YYYY-MM-DD, got "${localDate}"`);
  }
};

/** Days from the last claim to `today`: null when never claimed (or the stored date is unreadable). */
const daysSince = (last: string | null, today: string): number | null => {
  if (last === null) return null;
  const gap = daysBetween(last, today);
  return Number.isNaN(gap) ? null : gap;
};

/** The stored index folded into the cycle (corrupt values never index out of range). */
export const giftCycleIndex = (giftDayIndex: number): number => {
  const whole = Number.isFinite(giftDayIndex) ? Math.floor(giftDayIndex) : 0;
  return ((whole % DAILY_GIFT_CYCLE_LENGTH) + DAILY_GIFT_CYCLE_LENGTH) % DAILY_GIFT_CYCLE_LENGTH;
};

/** Index of the day-7 chest in the cycle. */
export const CHEST_INDEX = DAILY_GIFT_CYCLE_LENGTH - 1;

/** The gift the next claim grants (before the VIP multiplier). */
export const nextGift = (giftDayIndex: number): RewardBundle => {
  const gift = ECONOMY.dailyGiftCycle[giftCycleIndex(giftDayIndex)];
  return gift === undefined ? {} : { ...gift };
};

export type GiftFields = Pick<ProgressState, 'giftDayIndex' | 'lastGiftDate' | 'lastSeenAt'>;

/** True when today's gift has not been claimed yet (a rolled-back date is not claimable). */
export const canClaimGift = (
  state: Pick<ProgressState, 'lastGiftDate'>,
  today: string,
): boolean => {
  assertLocalDate(today);
  const gap = daysSince(state.lastGiftDate, today);
  return gap === null || gap > 0;
};

export interface ClaimInput {
  /** Player's local date, `YYYY-MM-DD`. */
  readonly today: string;
  /** Current epoch ms. */
  readonly now: number;
  readonly isVip: boolean;
}

export type GiftClaim =
  | {
      readonly kind: 'granted';
      readonly reward: RewardBundle;
      /** 1-based day of the cycle that was claimed (7 = chest). */
      readonly day: number;
      readonly chest: boolean;
      readonly state: GiftFields;
    }
  | { readonly kind: 'alreadyClaimed' }
  | { readonly kind: 'clockRollback' };

/** Claims today's gift: the grant plus the new `giftDayIndex` / `lastGiftDate`. */
export const claimGift = (state: GiftFields, { today, now, isVip }: ClaimInput): GiftClaim => {
  assertLocalDate(today);
  if (now < state.lastSeenAt) return { kind: 'clockRollback' };
  const gap = daysSince(state.lastGiftDate, today);
  if (gap !== null && gap < 0) return { kind: 'clockRollback' };
  if (gap === 0) return { kind: 'alreadyClaimed' };
  const index = giftCycleIndex(state.giftDayIndex);
  const gift = nextGift(index);
  return {
    kind: 'granted',
    reward: isVip ? scaleReward(gift, ECONOMY.vipMultiplier) : gift,
    day: index + 1,
    chest: index === CHEST_INDEX,
    state: {
      giftDayIndex: (index + 1) % DAILY_GIFT_CYCLE_LENGTH,
      lastGiftDate: today,
      lastSeenAt: Math.max(state.lastSeenAt, now),
    },
  };
};

export type VipBonusFields = Pick<ProgressState, 'lastVipClaimDate' | 'lastSeenAt'>;

/** The VIP daily bonus: `vipDailyCoins` coins and `vipDailyHints` hints. */
export const VIP_DAILY_BONUS: RewardBundle = {
  coins: ECONOMY.vipDailyCoins,
  hints: ECONOMY.vipDailyHints,
};

/** True for a VIP who has not claimed today's bonus. */
export const canClaimVipBonus = (
  state: Pick<ProgressState, 'lastVipClaimDate'>,
  today: string,
  isVip: boolean,
): boolean => {
  assertLocalDate(today);
  if (!isVip) return false;
  const gap = daysSince(state.lastVipClaimDate, today);
  return gap === null || gap > 0;
};

export type VipBonusClaim =
  | { readonly kind: 'granted'; readonly reward: RewardBundle; readonly state: VipBonusFields }
  | { readonly kind: 'notVip' }
  | { readonly kind: 'alreadyClaimed' }
  | { readonly kind: 'clockRollback' };

/** Claims the VIP daily bonus once per local day. */
export const claimVipBonus = (
  state: VipBonusFields,
  { today, now, isVip }: ClaimInput,
): VipBonusClaim => {
  assertLocalDate(today);
  if (!isVip) return { kind: 'notVip' };
  if (now < state.lastSeenAt) return { kind: 'clockRollback' };
  const gap = daysSince(state.lastVipClaimDate, today);
  if (gap !== null && gap < 0) return { kind: 'clockRollback' };
  if (gap === 0) return { kind: 'alreadyClaimed' };
  return {
    kind: 'granted',
    reward: { ...VIP_DAILY_BONUS },
    state: { lastVipClaimDate: today, lastSeenAt: Math.max(state.lastSeenAt, now) },
  };
};
