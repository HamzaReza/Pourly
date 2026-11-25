/**
 * Pure purchase fulfillment rules (spec §12, §26.5). Every function takes the progress state and
 * returns the next one, so the rules are unit-testable without a store, a provider or React.
 *
 * Idempotency: a store transaction id is granted at most once. Granted ids are recorded in
 * `processedTransactions` (the latest 200); a transaction id seen again is a no-op. The Starter
 * Pack's items are granted once per player even if a second transaction ever arrives.
 */
import type { RewardBundle } from '@/config/economy';
import { PRODUCTS, PRODUCT_IDS, type ProductId } from '@/config/products';
import {
  MAX_PENDING_PURCHASES,
  MAX_PROCESSED_TRANSACTIONS,
  type PendingPurchase,
  type ProgressState,
} from '@/state/progressModel';
import { applyGrant, applyThemeFallback } from '@/state/progressReducers';

import type { StoreEntitlements, StoreTransaction } from './iapTypes';

// ---------------------------------------------------------------------------------------------
// Routing (client vs server grant)
// ---------------------------------------------------------------------------------------------

export type FulfillmentRoute = 'client' | 'server';

export interface FulfillmentContext {
  /** The player is signed in (phase 9 auth); guests are always fulfilled on the device. */
  readonly signedIn: boolean;
  /** `USE_SERVER_FULFILLMENT`: signed-in purchases are granted by the Cloud Function. */
  readonly serverFulfillment: boolean;
}

/**
 * The single decision point between a device grant and a server grant, keyed by the store
 * transaction id on both paths so `processedTransactions` dedupes either way. Signed-in players
 * wait for the server ledger when server fulfillment is on; everyone else is granted here.
 */
export const routeFulfillment = ({
  signedIn,
  serverFulfillment,
}: FulfillmentContext): FulfillmentRoute => (signedIn && serverFulfillment ? 'server' : 'client');

// ---------------------------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------------------------

export type GrantResult =
  | {
      readonly kind: 'granted';
      readonly reward: RewardBundle;
      /** Theme unlocked by the purchase, if it was not owned yet. */
      readonly themeId: string | null;
    }
  /** The transaction id was already fulfilled. */
  | { readonly kind: 'duplicate' }
  /** Remove Ads and VIP: nothing to grant, the entitlement comes from the store. */
  | { readonly kind: 'entitlementOnly' }
  /** A second Starter Pack transaction: the pack's items are granted only once. */
  | { readonly kind: 'alreadyOwned' }
  /** No usable transaction id. */
  | { readonly kind: 'invalid' };

export interface FulfillmentResult {
  readonly state: ProgressState;
  readonly result: GrantResult;
}

const isEmptyGrant = (bundle: RewardBundle): boolean =>
  !bundle.coins && !bundle.hints && !bundle.undos && !bundle.extraTubes;

/** Appends a transaction id, keeping the latest `MAX_PROCESSED_TRANSACTIONS`. */
export const rememberTransaction = (processed: readonly string[], id: string): string[] =>
  [...processed.filter((entry) => entry !== id), id].slice(-MAX_PROCESSED_TRANSACTIONS);

const withoutPending = (pending: readonly PendingPurchase[], productId: ProductId) =>
  pending.filter((entry) => entry.productId !== productId);

/** Grants a store transaction on the device (consumables and the Starter Pack), exactly once. */
export const applyStoreTransaction = (
  state: ProgressState,
  transaction: StoreTransaction,
  now: number,
): FulfillmentResult => {
  const product = PRODUCTS[transaction.productId];
  const pendingPurchases = withoutPending(state.pendingPurchases, product.id);
  if (isEmptyGrant(product.grant) && product.themeId === undefined) {
    return {
      state:
        pendingPurchases.length === state.pendingPurchases.length
          ? state
          : { ...state, pendingPurchases, updatedAt: now },
      result: { kind: 'entitlementOnly' },
    };
  }
  const id = transaction.transactionId.trim();
  if (id.length === 0) return { state, result: { kind: 'invalid' } };
  if (state.processedTransactions.includes(id)) return { state, result: { kind: 'duplicate' } };
  const processedTransactions = rememberTransaction(state.processedTransactions, id);
  const isStarterPack = product.id === PRODUCT_IDS.starterPack;
  if (isStarterPack && state.starterPackPurchased) {
    return {
      state: { ...state, processedTransactions, pendingPurchases, updatedAt: now },
      result: { kind: 'alreadyOwned' },
    };
  }
  const granted = applyGrant(state, product.grant, now);
  const themeId =
    product.themeId !== undefined && !granted.ownedThemes.includes(product.themeId)
      ? product.themeId
      : null;
  return {
    state: {
      ...granted,
      ownedThemes: themeId === null ? granted.ownedThemes : [...granted.ownedThemes, themeId],
      starterPackPurchased: granted.starterPackPurchased || isStarterPack,
      processedTransactions,
      pendingPurchases,
    },
    result: { kind: 'granted', reward: { ...product.grant }, themeId },
  };
};

// ---------------------------------------------------------------------------------------------
// Refunds (server grants)
// ---------------------------------------------------------------------------------------------

export type RefundResult =
  | {
      readonly kind: 'refunded';
      /** What was actually removed (balances never go below 0). */
      readonly removed: Required<RewardBundle>;
    }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'invalid' };

export interface RefundOutcome {
  readonly state: ProgressState;
  readonly result: RefundResult;
}

/**
 * Applies a refunded purchase (owner decision O7): the product's items are taken back once per
 * refund id (`{transactionId}_refund`), each balance floored at 0. Themes and the Starter Pack
 * flag stay (the theme may be in use; the offer must not reopen).
 */
export const applyRefund = (
  state: ProgressState,
  refundId: string,
  productId: ProductId,
  now: number,
): RefundOutcome => {
  const id = refundId.trim();
  if (id.length === 0) return { state, result: { kind: 'invalid' } };
  if (state.processedTransactions.includes(id)) return { state, result: { kind: 'duplicate' } };
  const { grant } = PRODUCTS[productId];
  const take = (balance: number, amount: number | undefined): number =>
    Math.min(balance, Math.max(0, Math.floor(amount ?? 0)));
  const removed = {
    coins: take(state.coins, grant.coins),
    hints: take(state.hints, grant.hints),
    undos: take(state.undos, grant.undos),
    extraTubes: take(state.extraTubes, grant.extraTubes),
  };
  return {
    state: {
      ...state,
      coins: state.coins - removed.coins,
      hints: state.hints - removed.hints,
      undos: state.undos - removed.undos,
      extraTubes: state.extraTubes - removed.extraTubes,
      processedTransactions: rememberTransaction(state.processedTransactions, id),
      updatedAt: now,
    },
    result: { kind: 'refunded', removed },
  };
};

// ---------------------------------------------------------------------------------------------
// Pending purchases
// ---------------------------------------------------------------------------------------------

/** A pending purchase is matched by transactions this long before it was started (clock skew). */
export const PENDING_MATCH_TOLERANCE_MS = 24 * 60 * 60 * 1000;
/** Pending purchases older than this are forgotten (Google Play cancels them well before). */
export const PENDING_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** Remembers a purchase the store reported as pending (payment not cleared yet). */
export const applyPendingPurchase = (
  state: ProgressState,
  productId: ProductId,
  since: number,
  now: number,
): ProgressState => ({
  ...state,
  pendingPurchases: [
    ...withoutPending(state.pendingPurchases, productId),
    { productId, since },
  ].slice(-MAX_PENDING_PURCHASES),
  updatedAt: now,
});

/** Drops pending purchases older than `PENDING_MAX_AGE_MS`. */
export const applyPrunePending = (state: ProgressState, now: number): ProgressState => {
  const kept = state.pendingPurchases.filter((entry) => now - entry.since <= PENDING_MAX_AGE_MS);
  return kept.length === state.pendingPurchases.length
    ? state
    : { ...state, pendingPurchases: kept, updatedAt: now };
};

/**
 * Transactions that complete a pending purchase: not yet processed, for a product the player is
 * waiting on, and not older than that purchase (minus the clock-skew tolerance). Only these are
 * granted from the store's history; anything else in it was granted when it was bought.
 */
export const pendingTransactionsToFulfill = (
  state: Pick<ProgressState, 'pendingPurchases' | 'processedTransactions'>,
  transactions: readonly StoreTransaction[],
): StoreTransaction[] => {
  const out: StoreTransaction[] = [];
  for (const transaction of transactions) {
    const pending = state.pendingPurchases.find(
      (entry) => entry.productId === transaction.productId,
    );
    if (pending === undefined) continue;
    if (state.processedTransactions.includes(transaction.transactionId)) continue;
    if (transaction.purchasedAt < pending.since - PENDING_MATCH_TOLERANCE_MS) continue;
    if (out.some((entry) => entry.productId === transaction.productId)) continue;
    out.push(transaction);
  }
  return out;
};

// ---------------------------------------------------------------------------------------------
// Entitlements and restored ownership
// ---------------------------------------------------------------------------------------------

/**
 * Writes the store's entitlements (`no_ads`, `vip`). When VIP lapses the Gold theme falls back to
 * Classic in the same update.
 */
export const applyEntitlements = (
  state: ProgressState,
  entitlements: StoreEntitlements,
  now: number,
): ProgressState => {
  if (
    state.entitlements.noAds === entitlements.noAds &&
    state.entitlements.vip === entitlements.vip
  ) {
    return state;
  }
  const next: ProgressState = {
    ...state,
    entitlements: { noAds: entitlements.noAds, vip: entitlements.vip },
    updatedAt: now,
  };
  return applyThemeFallback(next, now);
};

/**
 * Restore Purchases: a Starter Pack the store still reports brings back what is permanent about
 * it (the Aurora theme and the offer being done). Its coins, hints and undos are consumables and
 * are not granted again.
 */
export const applyRestoredProducts = (
  state: ProgressState,
  ownedProductIds: readonly ProductId[],
  now: number,
): ProgressState => {
  if (state.starterPackPurchased || !ownedProductIds.includes(PRODUCT_IDS.starterPack)) {
    return state;
  }
  const themeId = PRODUCTS.starter_pack.themeId;
  const ownedThemes =
    themeId === undefined || state.ownedThemes.includes(themeId)
      ? state.ownedThemes
      : [...state.ownedThemes, themeId];
  return { ...state, starterPackPurchased: true, ownedThemes, updatedAt: now };
};

// ---------------------------------------------------------------------------------------------
// Foreground re-sync
// ---------------------------------------------------------------------------------------------

/** Customer info is re-read on foreground at most once per minute. */
export const FOREGROUND_RESYNC_MS = 60_000;

/** Whether a foreground re-sync is due (a clock turned back allows one). */
export const shouldResync = (lastSyncAt: number, now: number): boolean =>
  now < lastSyncAt || now - lastSyncAt >= FOREGROUND_RESYNC_MS;
