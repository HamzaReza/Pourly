/**
 * Store fakes for purchase tests: snapshot and transaction builders, store products with a
 * non-USD price string (prices must come from the store), and a controllable `IapProvider`.
 */
import type { ProductId } from '@/config/products';
import type { IapProvider, IapProviderKind } from '@/services/iap';
import type {
  CustomerSnapshot,
  PurchaseOutcome,
  RestoreOutcome,
  StoreProduct,
  StoreTransaction,
} from '@/services/iapTypes';

export const snapshot = (overrides: Partial<CustomerSnapshot> = {}): CustomerSnapshot => ({
  entitlements: { noAds: false, vip: false },
  transactions: [],
  ownedProductIds: [],
  ...overrides,
});

export const transaction = (
  productId: ProductId,
  transactionId = `GPA.${productId}.1`,
  purchasedAt = 0,
): StoreTransaction => ({ transactionId, productId, purchasedAt });

/** Store catalog priced in euros with a comma decimal, as Google Play reports it in Germany. */
export const STORE_PRODUCTS: readonly StoreProduct[] = [
  { id: 'coins_500', title: 'Coins', priceString: '1,09 €', billingPeriod: null },
  { id: 'coins_1500', title: 'Coins', priceString: '3,29 €', billingPeriod: null },
  { id: 'coins_4000', title: 'Coins', priceString: '7,49 €', billingPeriod: null },
  { id: 'remove_ads', title: 'Remove Ads', priceString: '4,49 €', billingPeriod: null },
  { id: 'starter_pack', title: 'Starter Pack', priceString: '2,19 €', billingPeriod: null },
  {
    id: 'vip_weekly',
    title: 'VIP',
    priceString: '2,29 €',
    billingPeriod: { unit: 'week', count: 1 },
  },
  {
    id: 'vip_monthly',
    title: 'VIP',
    priceString: '6,49 €',
    billingPeriod: { unit: 'month', count: 1 },
  },
];

export interface FakeIap extends IapProvider {
  readonly purchase: jest.Mock<Promise<PurchaseOutcome>, [ProductId]>;
  readonly restore: jest.Mock<Promise<RestoreOutcome>, []>;
  readonly refresh: jest.Mock<Promise<CustomerSnapshot | null>, []>;
  readonly getProducts: jest.Mock<Promise<readonly StoreProduct[]>, []>;
  readonly init: jest.Mock<Promise<void>, []>;
  /** Pushes customer info to subscribers, like the SDK's listener. */
  emit: (next: CustomerSnapshot) => void;
}

/** A provider whose every call is a resolved Jest mock; override per test. */
export const createFakeIap = (kind: IapProviderKind = 'revenuecat'): FakeIap => {
  const listeners = new Set<(next: CustomerSnapshot) => void>();
  return {
    kind,
    isAvailable: () => kind !== 'unavailable',
    init: jest.fn(() => Promise.resolve()),
    getProducts: jest.fn(() => Promise.resolve(STORE_PRODUCTS)),
    purchase: jest.fn((_productId: ProductId) =>
      Promise.resolve<PurchaseOutcome>({ kind: 'cancelled' }),
    ),
    restore: jest.fn(() =>
      Promise.resolve<RestoreOutcome>({ kind: 'restored', customer: snapshot() }),
    ),
    refresh: jest.fn(() => Promise.resolve<CustomerSnapshot | null>(snapshot())),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit: (next) => {
      for (const listener of listeners) listener(next);
    },
  };
};

/** A successful purchase outcome for `productId`. */
export const success = (
  productId: ProductId,
  transactionId = `GPA.${productId}.1`,
  customer: CustomerSnapshot = snapshot(),
): PurchaseOutcome => ({
  kind: 'success',
  transaction: transaction(productId, transactionId),
  customer,
});
