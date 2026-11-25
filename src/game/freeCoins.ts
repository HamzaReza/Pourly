/**
 * "Free coins ▶" in the Shop (spec §10.4, §11): a FREE_COINS rewarded ad grants
 * `freeCoinsAdReward` coins, at most `freeCoinsAdDailyMax` times per local day and with a
 * `freeCoinsAdCooldownSec` cooldown between claims. Pure: the clock and the local date are
 * injected.
 *
 * Clock rollback: time is measured from `max(now, lastSeenAt)` and a claim moves `lastSeenAt`
 * forward, so turning the clock back never shortens the cooldown; a local date earlier than the
 * last claim's date blocks claims until that date comes back.
 */
import { ECONOMY } from '@/config/economy';
import type { AdsProgress } from '@/state/progressModel';
import { daysBetween } from '@/utils/date';

export type FreeCoinsFields = {
  readonly ads: Pick<AdsProgress, 'freeCoinsClaimsToday' | 'freeCoinsDate' | 'lastFreeCoinsAt'>;
  readonly lastSeenAt: number;
};

export type FreeCoinsStatus =
  | { readonly kind: 'ready'; readonly remainingToday: number }
  | { readonly kind: 'cooldown'; readonly remainingMs: number; readonly remainingToday: number }
  | { readonly kind: 'dailyCap' };

export const FREE_COINS_COOLDOWN_MS = ECONOMY.freeCoinsAdCooldownSec * 1000;

/** Latest trusted time: a rolled-back clock never moves time backwards. */
export const trustedNow = (lastSeenAt: number, now: number): number => Math.max(now, lastSeenAt);

/** Claims already made on `today` (0 when the last claim was on an earlier day). */
export const freeCoinsClaimsOn = (fields: FreeCoinsFields, today: string): number =>
  fields.ads.freeCoinsDate === today ? fields.ads.freeCoinsClaimsToday : 0;

export const freeCoinsStatus = (
  fields: FreeCoinsFields,
  today: string,
  now: number,
): FreeCoinsStatus => {
  const lastDate = fields.ads.freeCoinsDate;
  if (lastDate !== null) {
    const age = daysBetween(lastDate, today);
    if (Number.isNaN(age) || age < 0) return { kind: 'dailyCap' };
  }
  const claims = freeCoinsClaimsOn(fields, today);
  if (claims >= ECONOMY.freeCoinsAdDailyMax) return { kind: 'dailyCap' };
  const remainingToday = ECONOMY.freeCoinsAdDailyMax - claims;
  const last = fields.ads.lastFreeCoinsAt;
  if (last > 0) {
    const remainingMs = last + FREE_COINS_COOLDOWN_MS - trustedNow(fields.lastSeenAt, now);
    if (remainingMs > 0) return { kind: 'cooldown', remainingMs, remainingToday };
  }
  return { kind: 'ready', remainingToday };
};

export interface FreeCoinsClaim {
  /** The fields to merge into the progress state. */
  readonly ads: Pick<AdsProgress, 'freeCoinsClaimsToday' | 'freeCoinsDate' | 'lastFreeCoinsAt'>;
  readonly lastSeenAt: number;
  readonly coins: number;
}

/** The claim to record after an earned FREE_COINS ad, or null when a claim is not allowed now. */
export const claimFreeCoins = (
  fields: FreeCoinsFields,
  today: string,
  now: number,
): FreeCoinsClaim | null => {
  if (freeCoinsStatus(fields, today, now).kind !== 'ready') return null;
  const at = trustedNow(fields.lastSeenAt, now);
  return {
    ads: {
      freeCoinsClaimsToday: freeCoinsClaimsOn(fields, today) + 1,
      freeCoinsDate: today,
      lastFreeCoinsAt: at,
    },
    lastSeenAt: at,
    coins: ECONOMY.freeCoinsAdReward,
  };
};
