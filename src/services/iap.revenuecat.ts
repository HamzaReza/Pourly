/**
 * RevenueCat provider (`react-native-purchases` v11, verified against its type definitions).
 *
 * The SDK is loaded with a dynamic `import()` the first time `init` runs, so nothing native loads
 * in Expo Go or Jest. Packages come from the `default` offering and are matched to `products.ts`
 * by their store product id (Google Play subscriptions report `productId:basePlanId`). Entitlements
 * `no_ads` and `vip` are read from customer info.
 */
import type {
  CustomerInfo,
  CustomerInfoUpdateListener,
  PURCHASES_ERROR_CODE,
  PurchasesPackage,
  PurchasesStoreProduct,
} from 'react-native-purchases';

import { ENTITLEMENTS, OFFERING_ID, isProductId, type ProductId } from '@/config/products';
import { logger } from '@/utils/logger';

import type { IapProvider } from './iap';
import type {
  BillingPeriod,
  CustomerSnapshot,
  PurchaseFailure,
  PurchaseOutcome,
  RestoreOutcome,
  StoreProduct,
  StoreTransaction,
} from './iapTypes';

type PurchasesModule = typeof import('react-native-purchases');
type PurchasesApi = PurchasesModule['default'];

/** `PURCHASES_ERROR_CODE` values this app reacts to (checked against the v11 enum at compile time). */
const RC_ERROR = {
  purchaseCancelled: '1',
  storeProblem: '2',
  purchaseNotAllowed: '3',
  purchaseInvalid: '4',
  productNotAvailable: '5',
  productAlreadyPurchased: '6',
  receiptAlreadyInUse: '7',
  network: '10',
  receiptInUseByOtherSubscriber: '13',
  ineligible: '18',
  paymentPending: '20',
  productRequestTimedOut: '32',
  offlineConnection: '35',
} as const satisfies Record<string, `${PURCHASES_ERROR_CODE}`>;

const NETWORK_CODES: readonly string[] = [RC_ERROR.network, RC_ERROR.offlineConnection];
const STORE_CODES: readonly string[] = [
  RC_ERROR.storeProblem,
  RC_ERROR.purchaseNotAllowed,
  RC_ERROR.purchaseInvalid,
  RC_ERROR.productNotAvailable,
  RC_ERROR.ineligible,
  RC_ERROR.productRequestTimedOut,
];
const OWNED_CODES: readonly string[] = [
  RC_ERROR.productAlreadyPurchased,
  RC_ERROR.receiptAlreadyInUse,
  RC_ERROR.receiptInUseByOtherSubscriber,
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** The code and cancel flag of a RevenueCat rejection (`PurchasesError`), if it is one. */
const readError = (error: unknown): { code: string; userCancelled: boolean } => {
  if (!isRecord(error)) return { code: '', userCancelled: false };
  return {
    code: typeof error.code === 'string' ? error.code : '',
    userCancelled: error.userCancelled === true,
  };
};

/** Classifies a failed `purchasePackage`. */
export const mapPurchaseError = (error: unknown): Exclude<PurchaseOutcome, { kind: 'success' }> => {
  const { code, userCancelled } = readError(error);
  if (userCancelled || code === RC_ERROR.purchaseCancelled) return { kind: 'cancelled' };
  if (code === RC_ERROR.paymentPending) return { kind: 'pending' };
  if (OWNED_CODES.includes(code)) return { kind: 'alreadyOwned' };
  return { kind: 'failed', reason: failureReason(code) };
};

/** Network, store or unknown, from a RevenueCat error code. */
export const failureReason = (code: string): PurchaseFailure => {
  if (NETWORK_CODES.includes(code)) return 'network';
  if (STORE_CODES.includes(code)) return 'store';
  return 'unknown';
};

/** The Play product id of a store identifier (`vip_weekly:weekly` → `vip_weekly`). */
export const baseProductId = (identifier: string): string => identifier.split(':')[0] ?? '';

const PERIOD = /^P(\d+)([DWMY])$/;
const PERIOD_UNITS: Readonly<Record<string, BillingPeriod['unit']>> = {
  D: 'day',
  W: 'week',
  M: 'month',
  Y: 'year',
};

/** Parses an ISO 8601 subscription period such as `P1W` or `P1M`; null when absent or unusual. */
export const parseBillingPeriod = (iso: string | null): BillingPeriod | null => {
  if (iso === null) return null;
  const match = PERIOD.exec(iso);
  if (match === null) return null;
  const count = Number(match[1]);
  const unit = PERIOD_UNITS[match[2] ?? ''];
  return unit === undefined || !Number.isInteger(count) || count < 1 ? null : { unit, count };
};

const toStoreProduct = (id: ProductId, product: PurchasesStoreProduct): StoreProduct => ({
  id,
  title: product.title,
  priceString: product.priceString,
  billingPeriod: parseBillingPeriod(product.subscriptionPeriod),
});

const parseDate = (value: string | null, fallback: number): number => {
  const parsed = value === null ? Number.NaN : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** The store-neutral view of RevenueCat customer info. */
export const toCustomerSnapshot = (info: CustomerInfo, now: number): CustomerSnapshot => {
  const transactions: StoreTransaction[] = [];
  for (const transaction of info.nonSubscriptionTransactions) {
    const productId = baseProductId(transaction.productIdentifier);
    if (!isProductId(productId) || transaction.transactionIdentifier.length === 0) continue;
    transactions.push({
      transactionId: transaction.transactionIdentifier,
      productId,
      purchasedAt: parseDate(transaction.purchaseDate, now),
    });
  }
  const owned = new Set<ProductId>();
  for (const identifier of info.allPurchasedProductIdentifiers) {
    const productId = baseProductId(identifier);
    if (isProductId(productId)) owned.add(productId);
  }
  const active = info.entitlements.active;
  return {
    entitlements: {
      noAds: active[ENTITLEMENTS.noAds]?.isActive === true,
      vip: active[ENTITLEMENTS.vip]?.isActive === true,
    },
    transactions,
    ownedProductIds: [...owned],
  };
};

export type PurchasesLoader = () => Promise<PurchasesModule>;

const loadPurchases: PurchasesLoader = () => import('react-native-purchases');

/** Creates the RevenueCat provider. Nothing is loaded or configured until `init`. */
export const createRevenueCatProvider = (
  apiKey: string,
  load: PurchasesLoader = loadPurchases,
): IapProvider => {
  let api: PurchasesApi | null = null;
  let initPromise: Promise<PurchasesApi> | null = null;
  const packages = new Map<ProductId, PurchasesPackage>();
  const listeners = new Set<(snapshot: CustomerSnapshot) => void>();

  const onCustomerInfo: CustomerInfoUpdateListener = (info) => {
    const snapshot = toCustomerSnapshot(info, Date.now());
    for (const listener of listeners) listener(snapshot);
  };

  const ready = (): Promise<PurchasesApi> => {
    initPromise ??= load().then((module) => {
      const purchases = module.default;
      purchases.setLogHandler((_level, message) => logger.debug('[RevenueCat]', message));
      purchases.configure({ apiKey });
      purchases.addCustomerInfoUpdateListener(onCustomerInfo);
      api = purchases;
      return purchases;
    });
    initPromise.catch(() => {
      initPromise = null;
    });
    return initPromise;
  };

  const loadPackages = async (purchases: PurchasesApi): Promise<StoreProduct[]> => {
    const offerings = await purchases.getOfferings();
    const offering = offerings.all[OFFERING_ID] ?? offerings.current;
    packages.clear();
    const products: StoreProduct[] = [];
    for (const pkg of offering?.availablePackages ?? []) {
      const productId = baseProductId(pkg.product.identifier);
      if (!isProductId(productId) || packages.has(productId)) continue;
      packages.set(productId, pkg);
      products.push(toStoreProduct(productId, pkg.product));
    }
    return products;
  };

  return {
    kind: 'revenuecat',
    isAvailable: () => true,
    init: async () => {
      await ready();
    },
    getProducts: async () => loadPackages(await ready()),
    purchase: async (productId) => {
      let purchases: PurchasesApi;
      try {
        purchases = await ready();
      } catch (error: unknown) {
        logger.warn('RevenueCat is not ready', error);
        return { kind: 'failed', reason: 'unknown' };
      }
      try {
        if (!packages.has(productId)) await loadPackages(purchases);
      } catch (error: unknown) {
        return mapPurchaseError(error);
      }
      const pkg = packages.get(productId);
      if (pkg === undefined) return { kind: 'failed', reason: 'store' };
      try {
        const result = await purchases.purchasePackage(pkg);
        const now = Date.now();
        return {
          kind: 'success',
          transaction: {
            transactionId: result.transaction.transactionIdentifier,
            productId,
            purchasedAt: parseDate(result.transaction.purchaseDate, now),
          },
          customer: toCustomerSnapshot(result.customerInfo, now),
        };
      } catch (error: unknown) {
        return mapPurchaseError(error);
      }
    },
    restore: async (): Promise<RestoreOutcome> => {
      try {
        const purchases = await ready();
        const info = await purchases.restorePurchases();
        return { kind: 'restored', customer: toCustomerSnapshot(info, Date.now()) };
      } catch (error: unknown) {
        return { kind: 'failed', reason: failureReason(readError(error).code) };
      }
    },
    refresh: async () => {
      if (api === null) return null;
      try {
        return toCustomerSnapshot(await api.getCustomerInfo(), Date.now());
      } catch (error: unknown) {
        logger.warn('Customer info refresh failed', error);
        return null;
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
