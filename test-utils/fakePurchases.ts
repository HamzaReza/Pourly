/**
 * A fake `react-native-purchases` module for the RevenueCat provider, injected through its
 * loader argument (the real SDK is never loaded in Jest).
 */
import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';

type PurchasesModule = typeof import('react-native-purchases');

export interface CustomerInfoInput {
  readonly active?: readonly string[];
  readonly transactions?: readonly { id: string; product: string; date?: string }[];
  readonly owned?: readonly string[];
}

export const customerInfo = ({
  active = [],
  transactions = [],
  owned = [],
}: CustomerInfoInput = {}): CustomerInfo =>
  ({
    entitlements: {
      active: Object.fromEntries(active.map((id) => [id, { identifier: id, isActive: true }])),
      all: {},
    },
    nonSubscriptionTransactions: transactions.map((entry) => ({
      transactionIdentifier: entry.id,
      productIdentifier: entry.product,
      purchaseDate: entry.date ?? '2026-11-24T12:00:00Z',
    })),
    allPurchasedProductIdentifiers: owned,
  }) as unknown as CustomerInfo;

export const storePackage = (
  identifier: string,
  priceString: string,
  subscriptionPeriod: string | null = null,
): PurchasesPackage =>
  ({
    identifier,
    product: { identifier, title: identifier, priceString, subscriptionPeriod },
  }) as unknown as PurchasesPackage;

export interface FakePurchases {
  readonly module: PurchasesModule;
  readonly api: {
    setLogHandler: jest.Mock;
    configure: jest.Mock;
    addCustomerInfoUpdateListener: jest.Mock;
    getOfferings: jest.Mock;
    purchasePackage: jest.Mock;
    restorePurchases: jest.Mock;
    getCustomerInfo: jest.Mock;
  };
  /** Calls the listener the provider registered with `addCustomerInfoUpdateListener`. */
  readonly push: (info: CustomerInfo) => void;
}

export const createFakePurchases = (packages: readonly PurchasesPackage[]): FakePurchases => {
  let listener: ((info: CustomerInfo) => void) | null = null;
  const api = {
    setLogHandler: jest.fn(),
    configure: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn((next: (info: CustomerInfo) => void) => {
      listener = next;
    }),
    getOfferings: jest.fn(() =>
      Promise.resolve({
        all: { default: { identifier: 'default', availablePackages: packages } },
        current: null,
      }),
    ),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(() => Promise.resolve(customerInfo())),
    getCustomerInfo: jest.fn(() => Promise.resolve(customerInfo())),
  };
  return {
    module: { default: api } as unknown as PurchasesModule,
    api,
    push: (info) => listener?.(info),
  };
};
