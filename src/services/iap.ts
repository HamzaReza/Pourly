/**
 * In-app purchase abstraction (spec §12). Screens and the fulfillment service call only this
 * module; the provider behind it is chosen once per app run:
 *
 * | Where                                         | Provider                      |
 * | --------------------------------------------- | ----------------------------- |
 * | Expo Go                                       | mock (`iap.mock.ts`)          |
 * | native module + RevenueCat key                | RevenueCat (`iap.revenuecat`) |
 * | development build without a key               | mock                          |
 * | release build without a key or native module  | unavailable (Shop says so)    |
 *
 * Nothing native loads at import time; the RevenueCat SDK is imported on `init`.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { NativeModules } from 'react-native';

import { PUBLIC_ENV } from '@/config/env';
import type { ProductId } from '@/config/products';
import { logger } from '@/utils/logger';

import { mockIapProvider } from './iap.mock';
import { createRevenueCatProvider } from './iap.revenuecat';
import type { CustomerSnapshot, PurchaseOutcome, RestoreOutcome, StoreProduct } from './iapTypes';

export type IapProviderKind = 'revenuecat' | 'mock' | 'unavailable';

/** What a store adapter implements. */
export interface IapProvider {
  readonly kind: IapProviderKind;
  /** False when purchases cannot work in this build (the Shop shows its unavailable state). */
  isAvailable: () => boolean;
  /** Loads and configures the SDK (idempotent). */
  init: () => Promise<void>;
  /** Products of the `default` offering with store prices. Rejects when the store is unreachable. */
  getProducts: () => Promise<readonly StoreProduct[]>;
  purchase: (productId: ProductId) => Promise<PurchaseOutcome>;
  /** Restore Purchases: re-syncs what the store account owns. */
  restore: () => Promise<RestoreOutcome>;
  /** Fresh customer info (entitlements), or null when it cannot be read now. */
  refresh: () => Promise<CustomerSnapshot | null>;
  /** Customer info pushed by the store (renewals, expirations, completed pending payments). */
  subscribe: (listener: (snapshot: CustomerSnapshot) => void) => () => void;
}

export interface IapEnvironment {
  readonly isExpoGo: boolean;
  readonly hasNativeModule: boolean;
  readonly hasApiKey: boolean;
  readonly isDev: boolean;
}

/** Provider choice (pure). */
export const selectIapProviderKind = (env: IapEnvironment): IapProviderKind => {
  if (env.isExpoGo) return 'mock';
  if (env.hasNativeModule && env.hasApiKey) return 'revenuecat';
  return env.isDev ? 'mock' : 'unavailable';
};

const STORE_UNAVAILABLE = { kind: 'failed', reason: 'store' } as const;

/** Release builds without a RevenueCat key: purchases are switched off, nothing crashes. */
export const unavailableIapProvider: IapProvider = {
  kind: 'unavailable',
  isAvailable: () => false,
  init: () => Promise.resolve(),
  getProducts: () => Promise.resolve([]),
  purchase: () => Promise.resolve(STORE_UNAVAILABLE),
  restore: () => Promise.resolve(STORE_UNAVAILABLE),
  refresh: () => Promise.resolve(null),
  subscribe: () => () => undefined,
};

const detectEnvironment = (): IapEnvironment => ({
  isExpoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  hasNativeModule: NativeModules.RNPurchases != null,
  hasApiKey: PUBLIC_ENV.revenueCatAndroidKey.length > 0,
  isDev: __DEV__,
});

const createProvider = (kind: IapProviderKind): IapProvider => {
  switch (kind) {
    case 'revenuecat':
      return createRevenueCatProvider(PUBLIC_ENV.revenueCatAndroidKey);
    case 'mock':
      return mockIapProvider;
    case 'unavailable':
      logger.warn('Purchases are disabled: no RevenueCat key or native module in this build');
      return unavailableIapProvider;
  }
};

let provider: IapProvider | null = null;

/** The provider for this run (chosen on first use). */
export const getIapProvider = (): IapProvider => {
  provider ??= createProvider(selectIapProviderKind(detectEnvironment()));
  return provider;
};

/** Installs a provider explicitly (tests and tools); the app otherwise picks one on first use. */
export const setIapProvider = (next: IapProvider): void => {
  provider = next;
};
