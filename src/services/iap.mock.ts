/**
 * Mock store for Expo Go and development builds without a RevenueCat key. Every purchase opens a
 * clearly labelled "TEST PURCHASE" sheet (`MockPurchaseHost`, mounted in the root layout) where the
 * developer picks the outcome. Prices are fake but localized. Remove Ads, the Starter Pack and VIP
 * are remembered in AsyncStorage (development only), so entitlements survive restarts and Restore
 * Purchases has something to restore. A "pending" purchase completes a few seconds later through
 * the customer-info listener, like a real pending payment.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { STORAGE_KEYS } from '@/config/constants';
import {
  isProductId,
  PRODUCTS,
  PRODUCT_IDS,
  VIP_PRODUCT_IDS,
  type ProductId,
} from '@/config/products';
import { i18n } from '@/i18n';
import { logger } from '@/utils/logger';

import type { IapProvider } from './iap';
import type {
  BillingPeriod,
  CustomerSnapshot,
  PurchaseOutcome,
  StoreProduct,
  StoreTransaction,
} from './iapTypes';

/** Fake prices in US dollars, formatted for the active language. */
const MOCK_PRICES: Readonly<Record<ProductId, number>> = {
  coins_500: 0.99,
  coins_1500: 2.99,
  coins_4000: 6.99,
  remove_ads: 9.99,
  starter_pack: 2.49,
  vip_weekly: 2.99,
  vip_monthly: 7.99,
};

const MOCK_PERIODS: Readonly<Partial<Record<ProductId, BillingPeriod>>> = {
  vip_weekly: { unit: 'week', count: 1 },
  vip_monthly: { unit: 'month', count: 1 },
};

/** How long a mock pending payment takes to clear. */
export const MOCK_PENDING_SETTLE_MS = 4000;
/** Simulated store latency. */
const MOCK_LATENCY_MS = 300;
/** Remembered mock transactions. */
const MAX_MOCK_TRANSACTIONS = 50;

export type MockPurchaseChoice = 'succeed' | 'pending' | 'cancel' | 'networkError' | 'storeError';

export const MOCK_PURCHASE_CHOICES: readonly MockPurchaseChoice[] = [
  'succeed',
  'pending',
  'cancel',
  'networkError',
  'storeError',
];

export interface MockPurchaseRequest {
  readonly id: number;
  readonly productId: ProductId;
  readonly priceString: string;
}

interface MockStore {
  owned: ProductId[];
  transactions: StoreTransaction[];
}

type Listener = () => void;

let store: MockStore = { owned: [], transactions: [] };
let loadPromise: Promise<void> | null = null;
let current: MockPurchaseRequest | null = null;
let finish: ((choice: MockPurchaseChoice) => void) | null = null;
let nextId = 1;
const sheetListeners = new Set<Listener>();
const customerListeners = new Set<(snapshot: CustomerSnapshot) => void>();

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const priceOf = (productId: ProductId): string =>
  new Intl.NumberFormat(i18n.language || 'en', { style: 'currency', currency: 'USD' }).format(
    MOCK_PRICES[productId],
  );

const parseStore = (raw: string | null): MockStore => {
  if (raw === null) return { owned: [], transactions: [] };
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) return { owned: [], transactions: [] };
  const record = value as Record<string, unknown>;
  const owned = Array.isArray(record.owned)
    ? record.owned.filter((id): id is ProductId => typeof id === 'string' && isProductId(id))
    : [];
  const transactions: StoreTransaction[] = [];
  if (Array.isArray(record.transactions)) {
    for (const item of record.transactions) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const { transactionId, productId, purchasedAt } = entry;
      if (
        typeof transactionId === 'string' &&
        typeof productId === 'string' &&
        isProductId(productId) &&
        typeof purchasedAt === 'number'
      ) {
        transactions.push({ transactionId, productId, purchasedAt });
      }
    }
  }
  return { owned, transactions };
};

const load = (): Promise<void> => {
  loadPromise ??= AsyncStorage.getItem(STORAGE_KEYS.iapMock)
    .then((raw) => {
      store = parseStore(raw);
    })
    .catch((error: unknown) => {
      logger.warn('Mock store could not be read', error);
    });
  return loadPromise;
};

const save = (): void => {
  AsyncStorage.setItem(STORAGE_KEYS.iapMock, JSON.stringify(store)).catch((error: unknown) =>
    logger.warn('Mock store could not be saved', error),
  );
};

const snapshot = (): CustomerSnapshot => ({
  entitlements: {
    noAds: store.owned.includes(PRODUCT_IDS.removeAds),
    vip: store.owned.some((id) => VIP_PRODUCT_IDS.includes(id)),
  },
  transactions: [...store.transactions],
  ownedProductIds: [...store.owned],
});

const emitCustomer = (): void => {
  const next = snapshot();
  for (const listener of customerListeners) listener(next);
};

const emitSheet = (): void => {
  for (const listener of sheetListeners) listener();
};

const isOwned = (productId: ProductId): boolean => {
  if (PRODUCTS[productId].kind === 'consumable') return false;
  if (VIP_PRODUCT_IDS.includes(productId)) {
    return store.owned.some((id) => VIP_PRODUCT_IDS.includes(id));
  }
  return store.owned.includes(productId);
};

/** Records a completed purchase and returns its transaction. */
const complete = (productId: ProductId): StoreTransaction => {
  const transaction: StoreTransaction = {
    transactionId: `MOCK.${Date.now()}.${nextId}`,
    productId,
    purchasedAt: Date.now(),
  };
  nextId += 1;
  const kind = PRODUCTS[productId].kind;
  if (kind !== 'consumable' && !store.owned.includes(productId)) {
    store.owned = [...store.owned, productId];
  }
  if (kind !== 'subscription') {
    store.transactions = [...store.transactions, transaction].slice(-MAX_MOCK_TRANSACTIONS);
  }
  save();
  return transaction;
};

const ask = (productId: ProductId): Promise<MockPurchaseChoice> =>
  new Promise((resolve) => {
    current = { id: nextId, productId, priceString: priceOf(productId) };
    nextId += 1;
    finish = resolve;
    emitSheet();
  });

/** The purchase sheet on screen, or null. */
export const getMockPurchase = (): MockPurchaseRequest | null => current;

export const subscribeMockPurchase = (listener: Listener): (() => void) => {
  sheetListeners.add(listener);
  return () => {
    sheetListeners.delete(listener);
  };
};

/** Ends the sheet with the developer's choice. */
export const resolveMockPurchase = (choice: MockPurchaseChoice): void => {
  const done = finish;
  if (done === null) return;
  current = null;
  finish = null;
  emitSheet();
  done(choice);
};

const purchase = async (productId: ProductId): Promise<PurchaseOutcome> => {
  await load();
  if (current !== null) return { kind: 'failed', reason: 'store' };
  if (isOwned(productId)) return { kind: 'alreadyOwned' };
  const choice = await ask(productId);
  switch (choice) {
    case 'succeed': {
      const transaction = complete(productId);
      const customer = snapshot();
      emitCustomer();
      return { kind: 'success', transaction, customer };
    }
    case 'pending':
      setTimeout(() => {
        complete(productId);
        emitCustomer();
      }, MOCK_PENDING_SETTLE_MS);
      return { kind: 'pending' };
    case 'cancel':
      return { kind: 'cancelled' };
    case 'networkError':
      return { kind: 'failed', reason: 'network' };
    case 'storeError':
      return { kind: 'failed', reason: 'store' };
  }
};

const products = (): StoreProduct[] =>
  (Object.keys(PRODUCTS) as ProductId[]).map((id) => ({
    id,
    title: i18n.t(`shop.names.${id}`),
    priceString: priceOf(id),
    billingPeriod: MOCK_PERIODS[id] ?? null,
  }));

export const mockIapProvider: IapProvider = {
  kind: 'mock',
  isAvailable: () => true,
  init: load,
  getProducts: async () => {
    await Promise.all([load(), wait(MOCK_LATENCY_MS)]);
    return products();
  },
  purchase,
  restore: async () => {
    await Promise.all([load(), wait(MOCK_LATENCY_MS)]);
    return { kind: 'restored', customer: snapshot() };
  },
  refresh: async () => {
    await load();
    return snapshot();
  },
  subscribe: (listener) => {
    customerListeners.add(listener);
    return () => {
      customerListeners.delete(listener);
    };
  },
};
