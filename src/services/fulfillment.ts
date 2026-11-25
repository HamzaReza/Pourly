/**
 * Purchase fulfillment (spec §12): runs purchases and Restore through the IAP provider, grants
 * what was bought, keeps entitlements in sync with the store and tells the player what happened
 * with localized toasts. The rules themselves live in `fulfillmentCore.ts` (pure).
 *
 * - Consumables and the Starter Pack are granted once per store transaction id.
 * - Remove Ads and VIP are entitlement-only: `no_ads` / `vip` come from customer info.
 * - A pending payment is remembered; its transaction is granted when the store later reports it.
 * - `routeFulfillment` decides client vs server grant in one place (phase 9 adds sign-in).
 */
import { AppState } from 'react-native';

import { USE_SERVER_FULFILLMENT } from '@/config/constants';
import type { RewardBundle } from '@/config/economy';
import { PRODUCT_IDS, PRODUCTS, type ProductId } from '@/config/products';
import { useProgressStore } from '@/state/progressStore';
import { showToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import { track } from './analytics';
import {
  pendingTransactionsToFulfill,
  routeFulfillment,
  shouldResync,
  type GrantResult,
} from './fulfillmentCore';
import { getIapProvider } from './iap';
import type { CustomerSnapshot, PurchaseFailure, StoreProduct, StoreTransaction } from './iapTypes';

const progress = () => useProgressStore.getState();

// ---------------------------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------------------------

/** Reports whether the player is signed in. Guests only until phase 9 installs its auth check. */
let isSignedIn: () => boolean = () => false;

/** Phase 9: lets the auth service tell fulfillment whether the player is signed in. */
export const setSignedInResolver = (resolver: () => boolean): void => {
  isSignedIn = resolver;
};

export type TransactionResult = GrantResult | { readonly kind: 'awaitingServer' };

/**
 * Fulfills one store transaction. Signed-in players with server fulfillment on wait for the
 * Cloud Function's grant (keyed by the same transaction id); everyone else is granted here.
 */
export const fulfillTransaction = (
  transaction: StoreTransaction,
  now: number = Date.now(),
): TransactionResult => {
  const route = routeFulfillment({
    signedIn: isSignedIn(),
    serverFulfillment: USE_SERVER_FULFILLMENT,
  });
  if (route === 'server') return { kind: 'awaitingServer' };
  return progress().fulfillTransaction(transaction, now);
};

// ---------------------------------------------------------------------------------------------
// Customer info
// ---------------------------------------------------------------------------------------------

/** Applies customer info: entitlements, then any pending purchase that has now completed. */
export const applyCustomerSnapshot = (
  snapshot: CustomerSnapshot,
  now: number = Date.now(),
): void => {
  progress().setEntitlements(snapshot.entitlements, now);
  progress().prunePendingPurchases(now);
  for (const transaction of pendingTransactionsToFulfill(progress(), snapshot.transactions)) {
    const result = fulfillTransaction(transaction, now);
    if (result.kind === 'granted' || result.kind === 'awaitingServer') {
      track('iap_success', { productId: transaction.productId });
      showToast('iap.pendingComplete');
    }
  }
};

// ---------------------------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------------------------

export type BuyResult =
  | {
      readonly kind: 'granted';
      readonly productId: ProductId;
      readonly reward: RewardBundle;
      readonly themeId: string | null;
    }
  /** Remove Ads or VIP is now active. */
  | { readonly kind: 'entitled'; readonly productId: ProductId }
  /** Signed-in purchase: the server grants it. */
  | { readonly kind: 'awaitingServer' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'pending' }
  /** The store says the player owns it already: offer Restore Purchases. */
  | { readonly kind: 'alreadyOwned'; readonly productId: ProductId }
  | { readonly kind: 'failed'; readonly reason: PurchaseFailure }
  /** The transaction was already granted (delivered twice): nothing more to do. */
  | { readonly kind: 'duplicate' }
  /** Another purchase is still running. */
  | { readonly kind: 'busy' };

const FAILURE_TOASTS = {
  network: 'iap.networkError',
  store: 'iap.storeError',
  unknown: 'iap.unknownError',
} as const;

let purchaseInFlight = false;

const entitledToast = (productId: ProductId): void => {
  showToast(PRODUCTS[productId].entitlement === 'vip' ? 'iap.vipActive' : 'iap.adsRemoved');
};

const settleTransaction = (productId: ProductId, result: TransactionResult): BuyResult => {
  switch (result.kind) {
    case 'granted':
      track('iap_success', { productId });
      return { kind: 'granted', productId, reward: result.reward, themeId: result.themeId };
    case 'entitlementOnly':
      track('iap_success', { productId });
      entitledToast(productId);
      return { kind: 'entitled', productId };
    case 'awaitingServer':
      track('iap_success', { productId });
      showToast('iap.awaitingServer');
      return { kind: 'awaitingServer' };
    case 'duplicate':
      track('iap_failed', { productId, reason: 'alreadyGranted' });
      return { kind: 'duplicate' };
    case 'alreadyOwned':
      track('iap_failed', { productId, reason: 'alreadyGranted' });
      return { kind: 'alreadyOwned', productId };
    case 'invalid':
      logger.warn('Purchase without a transaction id', productId);
      track('iap_failed', { productId, reason: 'unknown' });
      showToast(FAILURE_TOASTS.unknown);
      return { kind: 'failed', reason: 'unknown' };
  }
};

/** Buys a product and fulfills it (toasts for every outcome except a cancel and a grant). */
export const buyProduct = async (productId: ProductId): Promise<BuyResult> => {
  if (purchaseInFlight) return { kind: 'busy' };
  purchaseInFlight = true;
  const startedAt = Date.now();
  track('iap_started', { productId });
  try {
    const outcome = await getIapProvider().purchase(productId);
    const now = Date.now();
    switch (outcome.kind) {
      case 'success': {
        // Grant this transaction before the snapshot, so a purchase that was pending earlier is
        // not reported as a completed pending payment instead.
        const result = fulfillTransaction(outcome.transaction, now);
        applyCustomerSnapshot(outcome.customer, now);
        return settleTransaction(productId, result);
      }
      case 'pending':
        progress().markPurchasePending(productId, startedAt, now);
        showToast('iap.pending');
        return { kind: 'pending' };
      case 'cancelled':
        track('iap_failed', { productId, reason: 'cancelled' });
        return { kind: 'cancelled' };
      case 'alreadyOwned':
        track('iap_failed', { productId, reason: 'alreadyOwned' });
        return { kind: 'alreadyOwned', productId };
      case 'failed':
        track('iap_failed', { productId, reason: outcome.reason });
        showToast(FAILURE_TOASTS[outcome.reason]);
        return { kind: 'failed', reason: outcome.reason };
    }
  } catch (error: unknown) {
    logger.warn('Purchase failed', productId, error);
    track('iap_failed', { productId, reason: 'unknown' });
    showToast(FAILURE_TOASTS.unknown);
    return { kind: 'failed', reason: 'unknown' };
  } finally {
    purchaseInFlight = false;
  }
};

// ---------------------------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------------------------

export type RestoreResult =
  | { readonly kind: 'restored'; readonly restoredAny: boolean }
  | { readonly kind: 'failed'; readonly reason: PurchaseFailure };

/**
 * Restore Purchases: re-syncs entitlements (Remove Ads, VIP) and the Starter Pack's theme.
 * Consumables (coins, hints, undos) are never restored.
 */
export const restorePurchases = async (): Promise<RestoreResult> => {
  try {
    const outcome = await getIapProvider().restore();
    if (outcome.kind === 'failed') {
      showToast(outcome.reason === 'network' ? 'iap.networkError' : 'iap.restoreFailed');
      return outcome;
    }
    const now = Date.now();
    const { customer } = outcome;
    applyCustomerSnapshot(customer, now);
    progress().restoreProducts(customer.ownedProductIds, now);
    const restoredAny =
      customer.entitlements.noAds ||
      customer.entitlements.vip ||
      customer.ownedProductIds.includes(PRODUCT_IDS.starterPack);
    showToast(restoredAny ? 'iap.restored' : 'iap.nothingToRestore');
    return { kind: 'restored', restoredAny };
  } catch (error: unknown) {
    logger.warn('Restore failed', error);
    showToast('iap.restoreFailed');
    return { kind: 'failed', reason: 'unknown' };
  }
};

// ---------------------------------------------------------------------------------------------
// Products and lifecycle
// ---------------------------------------------------------------------------------------------

/** Store products with localized prices (initializes the provider on first use). */
export const loadStoreProducts = async (): Promise<readonly StoreProduct[]> => {
  const provider = getIapProvider();
  await provider.init();
  return provider.getProducts();
};

/** Whether purchases can work in this build. */
export const purchasesAvailable = (): boolean => getIapProvider().isAvailable();

/**
 * Starts the store connection (call after the first frame): initializes the provider, syncs
 * entitlements, listens for customer-info updates and re-syncs on foreground at most once a
 * minute. Returns the cleanup function.
 */
export const startPurchases = (): (() => void) => {
  const provider = getIapProvider();
  if (!provider.isAvailable()) return () => undefined;
  let lastSyncAt = 0;
  const sync = (): void => {
    lastSyncAt = Date.now();
    provider
      .refresh()
      .then((snapshot) => {
        if (snapshot !== null) applyCustomerSnapshot(snapshot);
      })
      .catch((error: unknown) => logger.warn('Entitlement sync failed', error));
  };
  const unsubscribe = provider.subscribe((snapshot) => applyCustomerSnapshot(snapshot));
  provider
    .init()
    .then(sync)
    .catch((error: unknown) => logger.warn('Purchases could not start', error));
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' && shouldResync(lastSyncAt, Date.now())) sync();
  });
  return () => {
    unsubscribe();
    subscription.remove();
  };
};
