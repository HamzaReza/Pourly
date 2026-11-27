import AsyncStorage from '@react-native-async-storage/async-storage';

import { initI18n } from '@/i18n';
import { selectIapProviderKind, unavailableIapProvider, type IapEnvironment } from '@/services/iap';
import {
  getMockPurchase,
  MOCK_PENDING_SETTLE_MS,
  mockIapProvider,
  resolveMockPurchase,
} from '@/services/iap.mock';
import {
  baseProductId,
  createRevenueCatProvider,
  failureReason,
  mapPurchaseError,
  parseBillingPeriod,
  toCustomerSnapshot,
} from '@/services/iap.revenuecat';
import type { CustomerSnapshot } from '@/services/iapTypes';

import { flushPromises } from '../test-utils/fakeAdmob';
import { createFakePurchases, customerInfo, storePackage } from '../test-utils/fakePurchases';

const env = (overrides: Partial<IapEnvironment>): IapEnvironment => ({
  isExpoGo: false,
  hasNativeModule: true,
  hasApiKey: true,
  isDev: false,
  ...overrides,
});

describe('selectIapProviderKind', () => {
  it('follows the provider matrix', () => {
    expect(selectIapProviderKind(env({ isExpoGo: true, hasNativeModule: false }))).toBe('mock');
    expect(selectIapProviderKind(env({ isExpoGo: true }))).toBe('mock');
    expect(selectIapProviderKind(env({}))).toBe('revenuecat');
    expect(selectIapProviderKind(env({ isDev: true }))).toBe('revenuecat');
    expect(selectIapProviderKind(env({ isDev: true, hasApiKey: false }))).toBe('mock');
    expect(selectIapProviderKind(env({ isDev: true, hasNativeModule: false }))).toBe('mock');
    expect(selectIapProviderKind(env({ hasApiKey: false }))).toBe('unavailable');
    expect(selectIapProviderKind(env({ hasNativeModule: false }))).toBe('unavailable');
  });

  it('has an unavailable provider that never throws', async () => {
    expect(unavailableIapProvider.isAvailable()).toBe(false);
    await expect(unavailableIapProvider.getProducts()).resolves.toEqual([]);
    await expect(unavailableIapProvider.purchase('coins_500')).resolves.toEqual({
      kind: 'failed',
      reason: 'store',
    });
    await expect(unavailableIapProvider.refresh()).resolves.toBeNull();
  });
});

describe('RevenueCat helpers', () => {
  it('maps purchase errors', () => {
    expect(mapPurchaseError({ code: '1', userCancelled: true })).toEqual({ kind: 'cancelled' });
    expect(mapPurchaseError({ code: '0', userCancelled: true })).toEqual({ kind: 'cancelled' });
    expect(mapPurchaseError({ code: '20' })).toEqual({ kind: 'pending' });
    for (const code of ['6', '7', '13']) {
      expect(mapPurchaseError({ code })).toEqual({ kind: 'alreadyOwned' });
    }
    expect(mapPurchaseError({ code: '10' })).toEqual({ kind: 'failed', reason: 'network' });
    expect(mapPurchaseError({ code: '35' })).toEqual({ kind: 'failed', reason: 'network' });
    for (const code of ['2', '3', '4', '5', '18', '32']) {
      expect(failureReason(code)).toBe('store');
    }
    expect(mapPurchaseError(new Error('boom'))).toEqual({ kind: 'failed', reason: 'unknown' });
    expect(mapPurchaseError('nope')).toEqual({ kind: 'failed', reason: 'unknown' });
  });

  it('parses product ids and billing periods', () => {
    expect(baseProductId('vip_weekly:weekly')).toBe('vip_weekly');
    expect(baseProductId('coins_500')).toBe('coins_500');
    expect(parseBillingPeriod('P1W')).toEqual({ unit: 'week', count: 1 });
    expect(parseBillingPeriod('P3M')).toEqual({ unit: 'month', count: 3 });
    expect(parseBillingPeriod('P1Y')).toEqual({ unit: 'year', count: 1 });
    expect(parseBillingPeriod('P7D')).toEqual({ unit: 'day', count: 7 });
    expect(parseBillingPeriod(null)).toBeNull();
    expect(parseBillingPeriod('P0W')).toBeNull();
    expect(parseBillingPeriod('PT1H')).toBeNull();
  });

  it('builds a store-neutral customer snapshot', () => {
    const info = customerInfo({
      active: ['no_ads', 'vip'],
      transactions: [
        { id: 'GPA.1', product: 'coins_500', date: '2026-11-24T10:00:00Z' },
        { id: 'GPA.2', product: 'unknown_product' },
        { id: '', product: 'coins_500' },
        { id: 'GPA.3', product: 'coins_1500', date: 'not a date' },
      ],
      owned: ['remove_ads', 'vip_weekly:weekly', 'something_else'],
    });
    expect(toCustomerSnapshot(info, 42)).toEqual<CustomerSnapshot>({
      entitlements: { noAds: true, vip: true },
      transactions: [
        {
          transactionId: 'GPA.1',
          productId: 'coins_500',
          purchasedAt: Date.parse('2026-11-24T10:00:00Z'),
        },
        { transactionId: 'GPA.3', productId: 'coins_1500', purchasedAt: 42 },
      ],
      ownedProductIds: ['remove_ads', 'vip_weekly'],
    });
    expect(toCustomerSnapshot(customerInfo(), 0).entitlements).toEqual({
      noAds: false,
      vip: false,
    });
  });
});

describe('RevenueCat provider', () => {
  const packages = [
    storePackage('coins_500', '1,09 €'),
    storePackage('vip_weekly:weekly', '2,29 €', 'P1W'),
    storePackage('not_ours', '9 €'),
  ];

  it('configures lazily, once, and maps the default offering', async () => {
    const fake = createFakePurchases(packages);
    const load = jest.fn(() => Promise.resolve(fake.module));
    const provider = createRevenueCatProvider('goog_key', load);
    expect(load).not.toHaveBeenCalled();
    await expect(provider.refresh()).resolves.toBeNull();
    await provider.init();
    await provider.init();
    expect(load).toHaveBeenCalledTimes(1);
    expect(fake.api.configure).toHaveBeenCalledWith({ apiKey: 'goog_key' });
    expect(fake.api.addCustomerInfoUpdateListener).toHaveBeenCalledTimes(1);
    await expect(provider.getProducts()).resolves.toEqual([
      { id: 'coins_500', title: 'coins_500', priceString: '1,09 €', billingPeriod: null },
      {
        id: 'vip_weekly',
        title: 'vip_weekly:weekly',
        priceString: '2,29 €',
        billingPeriod: { unit: 'week', count: 1 },
      },
    ]);
  });

  it('purchases a package and reports its transaction', async () => {
    const fake = createFakePurchases(packages);
    fake.api.purchasePackage.mockResolvedValueOnce({
      productIdentifier: 'coins_500',
      customerInfo: customerInfo({ active: ['no_ads'] }),
      transaction: { transactionIdentifier: 'GPA.9', purchaseDate: '2026-11-24T12:00:00Z' },
    });
    const provider = createRevenueCatProvider('k', () => Promise.resolve(fake.module));
    const outcome = await provider.purchase('coins_500');
    expect(fake.api.purchasePackage).toHaveBeenCalledWith(packages[0]);
    expect(outcome).toMatchObject({
      kind: 'success',
      transaction: { transactionId: 'GPA.9', productId: 'coins_500' },
      customer: { entitlements: { noAds: true, vip: false } },
    });
    fake.api.purchasePackage.mockRejectedValueOnce({ code: '20', userCancelled: false });
    await expect(provider.purchase('coins_500')).resolves.toEqual({ kind: 'pending' });
    await expect(provider.purchase('remove_ads')).resolves.toEqual({
      kind: 'failed',
      reason: 'store',
    });
  });

  it('reports load failures, offering errors, restore and listener updates', async () => {
    const failing = createRevenueCatProvider('k', () => Promise.reject(new Error('no module')));
    await expect(failing.purchase('coins_500')).resolves.toEqual({
      kind: 'failed',
      reason: 'unknown',
    });
    const fake = createFakePurchases(packages);
    fake.api.getOfferings.mockRejectedValueOnce({ code: '10' });
    const provider = createRevenueCatProvider('k', () => Promise.resolve(fake.module));
    await expect(provider.purchase('coins_500')).resolves.toEqual({
      kind: 'failed',
      reason: 'network',
    });
    fake.api.restorePurchases.mockResolvedValueOnce(customerInfo({ active: ['vip'] }));
    await expect(provider.restore()).resolves.toMatchObject({
      kind: 'restored',
      customer: { entitlements: { vip: true } },
    });
    fake.api.restorePurchases.mockRejectedValueOnce({ code: '35' });
    await expect(provider.restore()).resolves.toEqual({ kind: 'failed', reason: 'network' });
    const seen: CustomerSnapshot[] = [];
    const stop = provider.subscribe((next) => seen.push(next));
    fake.push(customerInfo({ active: ['no_ads'] }));
    stop();
    fake.push(customerInfo());
    expect(seen.map((s) => s.entitlements.noAds)).toEqual([true]);
    fake.api.getCustomerInfo.mockRejectedValueOnce(new Error('offline'));
    await expect(provider.refresh()).resolves.toBeNull();
  });
});

describe('mock store', () => {
  beforeAll(async () => {
    await initI18n('en');
  });

  it('prices every product, persists ownership and restores it', async () => {
    const products = await mockIapProvider.getProducts();
    expect(products.map((p) => p.priceString)).toContain('$0.99');
    expect(products.find((p) => p.id === 'vip_monthly')?.billingPeriod).toEqual({
      unit: 'month',
      count: 1,
    });
    const purchase = mockIapProvider.purchase('remove_ads');
    await flushPromises();
    expect(getMockPurchase()).toMatchObject({ productId: 'remove_ads', priceString: '$9.99' });
    resolveMockPurchase('succeed');
    await expect(purchase).resolves.toMatchObject({ kind: 'success' });
    await expect(mockIapProvider.purchase('remove_ads')).resolves.toEqual({ kind: 'alreadyOwned' });
    expect(JSON.parse((await AsyncStorage.getItem('pourly.iapMock')) ?? '{}').owned).toEqual([
      'remove_ads',
    ]);
    await expect(mockIapProvider.restore()).resolves.toMatchObject({
      kind: 'restored',
      customer: { entitlements: { noAds: true, vip: false }, ownedProductIds: ['remove_ads'] },
    });
  });

  it('simulates cancel, failures and a pending payment that completes later', async () => {
    const outcome = async (choice: Parameters<typeof resolveMockPurchase>[0]) => {
      const pending = mockIapProvider.purchase('coins_500');
      await flushPromises();
      resolveMockPurchase(choice);
      return pending;
    };
    await expect(outcome('cancel')).resolves.toEqual({ kind: 'cancelled' });
    await expect(outcome('networkError')).resolves.toEqual({ kind: 'failed', reason: 'network' });
    await expect(outcome('storeError')).resolves.toEqual({ kind: 'failed', reason: 'store' });
    jest.useFakeTimers();
    const seen: CustomerSnapshot[] = [];
    const stop = mockIapProvider.subscribe((next) => seen.push(next));
    await expect(outcome('pending')).resolves.toEqual({ kind: 'pending' });
    expect(seen).toHaveLength(0);
    jest.advanceTimersByTime(MOCK_PENDING_SETTLE_MS);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.transactions.at(-1)?.productId).toBe('coins_500');
    stop();
    jest.useRealTimers();
  });
});
