import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/constants';
import type { RewardBundle } from '@/config/economy';
import type { ProductId } from '@/config/products';
import type { GiftClaim, VipBonusClaim } from '@/game/gifts';
import {
  applyEntitlements,
  applyPendingPurchase,
  applyPrunePending,
  applyRestoredProducts,
  applyStoreTransaction,
  type GrantResult,
} from '@/services/fulfillmentCore';
import type { StoreEntitlements, StoreTransaction } from '@/services/iapTypes';

import { migrateProgress } from './migrations';
import { createDefaultProgress, PROGRESS_VERSION, type ProgressState } from './progressModel';
import {
  applyClaimFreeCoins,
  applyClaimGift,
  applyClaimVipBonus,
  applyCompleteLevel,
  applyConsume,
  applyDailyComplete,
  applyGrant,
  applyInterstitialShown,
  applyMarkTutorialDone,
  applyOpenStarterPackWindow,
  applyResetProgress,
  applyRewardedShown,
  applySetActiveTheme,
  applySkipLevel,
  applySpendCoins,
  applyThemeFallback,
  applyUnlockTheme,
  type CompleteLevelInput,
  type ConsumableItem,
  type DailyCompleteInput,
  type DailyCompleteResult,
} from './progressReducers';
import { createPersistStorage } from './storage';

export * from './progressModel';
export type {
  CompleteLevelInput,
  ConsumableItem,
  DailyCompleteInput,
  DailyCompleteOutcome,
  DailyCompleteResult,
} from './progressReducers';

/** Fields a generic patch may not touch: they are owned by migrations and `touchOpen`. */
type ProgressPatch = Partial<Omit<ProgressState, 'schemaVersion' | 'updatedAt'>>;

export interface ProgressActions {
  /** Records an app open: bumps the session count and open/seen timestamps (clock-rollback safe). */
  touchOpen: (now: number) => void;
  /** Shallow-merges fields and stamps `updatedAt`. */
  patch: (changes: ProgressPatch, now?: number) => void;
  /** Stars (best kept), next level, coins, 3★ streak and interstitial counter for a win. */
  completeLevel: (input: CompleteLevelInput, now?: number) => void;
  /** Completes `level` with 1★ (unless better stars exist) and no coins. */
  skipLevel: (level: number, now?: number) => void;
  /** Returns false (and changes nothing) when the balance is too low. */
  spendCoins: (amount: number, now?: number) => boolean;
  grant: (bundle: RewardBundle, now?: number) => void;
  /** Uses one inventory item; returns false when none is left. */
  consume: (item: ConsumableItem, now?: number) => boolean;
  markTutorialDone: (now?: number) => void;
  /** Stamps `ads.lastRewardedAt` after an earned rewarded ad. */
  recordRewardedAd: (now?: number) => void;
  /** Records a solved daily board; the reward is granted once per calendar day. */
  completeDaily: (input: DailyCompleteInput) => DailyCompleteResult;
  /** Claims and grants today's daily gift (VIP ×2). */
  claimGift: (today: string, now?: number) => GiftClaim;
  /** Claims and grants the VIP daily bonus. */
  claimVipBonus: (today: string, now?: number) => VipBonusClaim;
  /** Starts the 72-hour Starter Pack window once the player is eligible (idempotent). */
  openStarterPackWindow: (now?: number) => void;
  /** Buys a coin theme and applies it; false when locked otherwise or too expensive. */
  unlockTheme: (themeId: string, now?: number) => boolean;
  /** Applies an available theme; false when it is locked. */
  setActiveTheme: (themeId: string, now?: number) => boolean;
  /** Falls back to Classic when the active theme is no longer available (VIP lapsed). */
  enforceThemeEntitlements: (now?: number) => void;
  /** Clears play progress; purchases survive (see `applyResetProgress`). */
  resetProgress: (now?: number) => void;
  /** Stamps an interstitial that was shown (cadence and spacing, spec §13). */
  recordInterstitial: (now?: number) => void;
  /** Grants the FREE_COINS ad reward; returns the coins granted (0 when not allowed). */
  claimFreeCoins: (today: string, now?: number) => number;
  /** Grants a store transaction on the device, exactly once per transaction id. */
  fulfillTransaction: (transaction: StoreTransaction, now?: number) => GrantResult;
  /** Writes the store's entitlements (`no_ads`, `vip`). */
  setEntitlements: (entitlements: StoreEntitlements, now?: number) => void;
  /** Applies what Restore Purchases brings back (the Starter Pack's theme). */
  restoreProducts: (productIds: readonly ProductId[], now?: number) => void;
  /** Remembers a purchase whose payment is pending, started at `since`. */
  markPurchasePending: (productId: ProductId, since: number, now?: number) => void;
  /** Forgets pending purchases that are too old to complete. */
  prunePendingPurchases: (now?: number) => void;
}

export type ProgressStore = ProgressState & ProgressActions;

/** Pure reducer behind `touchOpen`, exported for tests. */
export const applyTouchOpen = (state: ProgressState, now: number): ProgressState => ({
  ...state,
  sessionCount: state.sessionCount + 1,
  firstSessionStartedAt: state.sessionCount === 0 ? now : state.firstSessionStartedAt,
  lastOpenAt: now,
  lastSeenAt: Math.max(state.lastSeenAt, now),
  updatedAt: Math.max(state.updatedAt, now),
});

const pickProgress = (state: ProgressStore): ProgressState => {
  const {
    touchOpen: _touchOpen,
    patch: _patch,
    completeLevel: _completeLevel,
    skipLevel: _skipLevel,
    spendCoins: _spendCoins,
    grant: _grant,
    consume: _consume,
    markTutorialDone: _markTutorialDone,
    recordRewardedAd: _recordRewardedAd,
    completeDaily: _completeDaily,
    claimGift: _claimGift,
    claimVipBonus: _claimVipBonus,
    openStarterPackWindow: _openStarterPackWindow,
    unlockTheme: _unlockTheme,
    setActiveTheme: _setActiveTheme,
    enforceThemeEntitlements: _enforceThemeEntitlements,
    resetProgress: _resetProgress,
    recordInterstitial: _recordInterstitial,
    claimFreeCoins: _claimFreeCoins,
    fulfillTransaction: _fulfillTransaction,
    setEntitlements: _setEntitlements,
    restoreProducts: _restoreProducts,
    markPurchasePending: _markPurchasePending,
    prunePendingPurchases: _prunePendingPurchases,
    ...data
  } = state;
  return data;
};

export const useProgressStore = create<ProgressStore>()(
  persist<ProgressStore, [], [], ProgressState>(
    (set, get) => ({
      ...createDefaultProgress(Date.now()),
      touchOpen: (now) => set((state) => applyTouchOpen(pickProgress(state), now)),
      patch: (changes, now = Date.now()) => set({ ...changes, updatedAt: now }),
      completeLevel: (input, now = Date.now()) =>
        set((state) => applyCompleteLevel(pickProgress(state), input, now)),
      skipLevel: (level, now = Date.now()) =>
        set((state) => applySkipLevel(pickProgress(state), level, now)),
      spendCoins: (amount, now = Date.now()) => {
        const next = applySpendCoins(pickProgress(get()), amount, now);
        if (next === null) return false;
        set(next);
        return true;
      },
      grant: (bundle, now = Date.now()) =>
        set((state) => applyGrant(pickProgress(state), bundle, now)),
      consume: (item, now = Date.now()) => {
        const next = applyConsume(pickProgress(get()), item, now);
        if (next === null) return false;
        set(next);
        return true;
      },
      markTutorialDone: (now = Date.now()) =>
        set((state) => applyMarkTutorialDone(pickProgress(state), now)),
      recordRewardedAd: (now = Date.now()) =>
        set((state) => applyRewardedShown(pickProgress(state), now)),
      completeDaily: (input) => {
        const result = applyDailyComplete(pickProgress(get()), input);
        set(result.state);
        return result;
      },
      claimGift: (today, now = Date.now()) => {
        const { state, claim } = applyClaimGift(pickProgress(get()), today, now);
        if (claim.kind === 'granted') set(state);
        return claim;
      },
      claimVipBonus: (today, now = Date.now()) => {
        const { state, claim } = applyClaimVipBonus(pickProgress(get()), today, now);
        if (claim.kind === 'granted') set(state);
        return claim;
      },
      openStarterPackWindow: (now = Date.now()) => {
        const current = pickProgress(get());
        const next = applyOpenStarterPackWindow(current, now);
        if (next !== current) set(next);
      },
      unlockTheme: (themeId, now = Date.now()) => {
        const next = applyUnlockTheme(pickProgress(get()), themeId, now);
        if (next === null) return false;
        set(next);
        return true;
      },
      setActiveTheme: (themeId, now = Date.now()) => {
        const current = pickProgress(get());
        const next = applySetActiveTheme(current, themeId, now);
        if (next === null) return false;
        if (next !== current) set(next);
        return true;
      },
      enforceThemeEntitlements: (now = Date.now()) => {
        const current = pickProgress(get());
        const next = applyThemeFallback(current, now);
        if (next !== current) set(next);
      },
      resetProgress: (now = Date.now()) => set(applyResetProgress(pickProgress(get()), now)),
      recordInterstitial: (now = Date.now()) =>
        set((state) => applyInterstitialShown(pickProgress(state), now)),
      claimFreeCoins: (today, now = Date.now()) => {
        const result = applyClaimFreeCoins(pickProgress(get()), today, now);
        if (result.coins > 0) set(result.state);
        return result.coins;
      },
      fulfillTransaction: (transaction, now = Date.now()) => {
        const current = pickProgress(get());
        const { state, result } = applyStoreTransaction(current, transaction, now);
        if (state !== current) set(state);
        return result;
      },
      setEntitlements: (entitlements, now = Date.now()) => {
        const current = pickProgress(get());
        const next = applyEntitlements(current, entitlements, now);
        if (next !== current) set(next);
      },
      restoreProducts: (productIds, now = Date.now()) => {
        const current = pickProgress(get());
        const next = applyRestoredProducts(current, productIds, now);
        if (next !== current) set(next);
      },
      markPurchasePending: (productId, since, now = Date.now()) =>
        set((state) => applyPendingPurchase(pickProgress(state), productId, since, now)),
      prunePendingPurchases: (now = Date.now()) => {
        const current = pickProgress(get());
        const next = applyPrunePending(current, now);
        if (next !== current) set(next);
      },
    }),
    {
      name: STORAGE_KEYS.progress,
      version: PROGRESS_VERSION,
      storage: createPersistStorage<ProgressState>(),
      partialize: pickProgress,
      migrate: (persisted, version) => migrateProgress(persisted, version),
      merge: (persisted, current) =>
        persisted === undefined
          ? current
          : { ...current, ...migrateProgress(persisted, PROGRESS_VERSION) },
    },
  ),
);
