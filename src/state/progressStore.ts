import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/config/constants';
import type { RewardBundle } from '@/config/economy';
import type { ProductId } from '@/config/products';
import type { GiftClaim, VipBonusClaim } from '@/game/gifts';
import type { CloudProgress } from '@/services/cloudMerge';
import {
  applyEntitlements,
  applyPendingPurchase,
  applyPrunePending,
  applyRefund,
  applyRestoredProducts,
  applyStoreTransaction,
  type GrantResult,
  type RefundResult,
} from '@/services/fulfillmentCore';
import type { StoreEntitlements, StoreTransaction } from '@/services/iapTypes';

import { migrateProgress } from './migrations';
import {
  createDefaultProgress,
  PROGRESS_VERSION,
  type Balances,
  type ProgressState,
} from './progressModel';
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
  applyNotificationPermission,
  applyNotificationPromptResult,
  applyNotificationToggle,
  applyOpenStarterPackWindow,
  applyResetProgress,
  applyReviewPrompted,
  applyRewardedShown,
  applySetActiveTheme,
  applySkipLevel,
  applySpendCoins,
  applyThemeFallback,
  applyTouchForeground,
  applyUnlockTheme,
  type CompleteLevelInput,
  type ConsumableItem,
  type DailyCompleteInput,
  type DailyCompleteResult,
  type NotificationToggle,
} from './progressReducers';
import { createPersistStorage } from './storage';

export * from './progressModel';
export type {
  CompleteLevelInput,
  ConsumableItem,
  DailyCompleteInput,
  DailyCompleteOutcome,
  DailyCompleteResult,
  NotificationToggle,
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
  /** The app returned to the foreground: moves `lastOpenAt` (comeback notifications) to now. */
  touchForeground: (now: number) => void;
  /** Records an answered notification soft-prompt. */
  recordNotificationPrompt: (granted: boolean, now?: number) => void;
  /** Mirrors the OS notification permission. */
  setNotificationsGranted: (granted: boolean, now?: number) => void;
  /** Turns the daily or streak reminders on or off. */
  setNotificationToggle: (toggle: NotificationToggle, enabled: boolean, now?: number) => void;
  /** Records a store review request (60-day spacing, 3 at most). */
  recordReviewPrompt: (now?: number) => void;
  /** Takes back a refunded purchase's items once per refund id (server grant). */
  refundTransaction: (refundId: string, productId: ProductId, now?: number) => RefundResult;
  /** Writes a merged cloud save and its sync baseline. */
  applyCloudProgress: (cloud: CloudProgress, baseline: Balances, now?: number) => void;
  /** Sets or clears the cloud-sync baseline (`lastSyncedBalances`). */
  setSyncBaseline: (baseline: Balances | null) => void;
}

export type ProgressStore = ProgressState & ProgressActions;

/**
 * Pure reducer behind `applyCloudProgress`: the merged cloud fields replace the local ones, the
 * baseline is stored and an active theme that is no longer available falls back to Classic.
 */
export const applyCloudSave = (
  state: ProgressState,
  cloud: CloudProgress,
  baseline: Balances,
  now: number,
): ProgressState =>
  applyThemeFallback(
    {
      ...state,
      ...cloud,
      stars: { ...cloud.stars },
      dailyHistory: { ...state.dailyHistory, ...cloud.dailyHistory },
      ownedThemes: [...cloud.ownedThemes],
      processedTransactions: [...cloud.processedTransactions],
      lastSyncedBalances: { ...baseline },
      updatedAt: now,
    },
    now,
  );

/** Whether the player ever bought something (a granted transaction or a store entitlement). */
export const hasAnyPurchase = (state: ProgressState): boolean =>
  state.processedTransactions.length > 0 ||
  state.starterPackPurchased ||
  state.entitlements.noAds ||
  state.entitlements.vip;

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
    touchForeground: _touchForeground,
    recordNotificationPrompt: _recordNotificationPrompt,
    setNotificationsGranted: _setNotificationsGranted,
    setNotificationToggle: _setNotificationToggle,
    recordReviewPrompt: _recordReviewPrompt,
    refundTransaction: _refundTransaction,
    applyCloudProgress: _applyCloudProgress,
    setSyncBaseline: _setSyncBaseline,
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
      touchForeground: (now) => set((state) => applyTouchForeground(pickProgress(state), now)),
      recordNotificationPrompt: (granted, now = Date.now()) =>
        set((state) => applyNotificationPromptResult(pickProgress(state), granted, now)),
      setNotificationsGranted: (granted, now = Date.now()) => {
        const current = pickProgress(get());
        const next = applyNotificationPermission(current, granted, now);
        if (next !== current) set(next);
      },
      setNotificationToggle: (toggle, enabled, now = Date.now()) => {
        const current = pickProgress(get());
        const next = applyNotificationToggle(current, toggle, enabled, now);
        if (next !== current) set(next);
      },
      recordReviewPrompt: (now = Date.now()) =>
        set((state) => applyReviewPrompted(pickProgress(state), now)),
      refundTransaction: (refundId, productId, now = Date.now()) => {
        const current = pickProgress(get());
        const { state, result } = applyRefund(current, refundId, productId, now);
        if (state !== current) set(state);
        return result;
      },
      applyCloudProgress: (cloud, baseline, now = Date.now()) =>
        set((state) =>
          applyCloudSave(pickProgress(state), cloud, baseline, Math.max(state.updatedAt, now)),
        ),
      setSyncBaseline: (baseline) =>
        set({ lastSyncedBalances: baseline === null ? null : { ...baseline } }),
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

/**
 * Writes the current progress to storage now and resolves once it is stored. The persist
 * middleware starts the same write on every change without waiting for it; callers that must not
 * lose a change (a paid grant just applied) await this instead.
 */
export const flushProgress = async (): Promise<void> => {
  const { name, storage, version, partialize } = useProgressStore.persist.getOptions();
  if (name === undefined || storage === undefined || partialize === undefined) return;
  await storage.setItem(name, { state: partialize(useProgressStore.getState()), version });
};
