import { AppState, type AppStateStatus } from 'react-native';

import { track } from '@/services/analytics';
import {
  applyCustomerSnapshot,
  buyProduct,
  fulfillTransaction,
  loadStoreProducts,
  purchasesAvailable,
  restorePurchases,
  setSignedInResolver,
  startPurchases,
} from '@/services/fulfillment';
import { setIapProvider, unavailableIapProvider } from '@/services/iap';
import { createDefaultProgress } from '@/state/progressModel';
import { useProgressStore } from '@/state/progressStore';
import { currentToast, dismissToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import {
  createFakeIap,
  snapshot,
  STORE_PRODUCTS,
  success,
  transaction,
  type FakeIap,
} from '../test-utils/fakeIap';

jest.mock('@/services/analytics', () => ({ track: jest.fn() }));

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();

let iap: FakeIap;

const progress = () => useProgressStore.getState();
const toastKey = () => currentToast()?.key ?? null;
const clearToasts = () => {
  for (let toast = currentToast(); toast !== null; toast = currentToast()) dismissToast(toast.id);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  useProgressStore.setState(createDefaultProgress(NOW));
  clearToasts();
  setSignedInResolver(() => false);
  iap = createFakeIap();
  setIapProvider(iap);
});

describe('buyProduct', () => {
  it('grants a coin pack once, even if the transaction is delivered twice', async () => {
    iap.purchase.mockResolvedValueOnce(success('coins_500', 'GPA.A'));
    const result = await buyProduct('coins_500');
    expect(result).toEqual({
      kind: 'granted',
      productId: 'coins_500',
      reward: { coins: 500 },
      themeId: null,
    });
    expect(progress().coins).toBe(600);
    expect(track).toHaveBeenCalledWith('iap_started', { productId: 'coins_500' });
    expect(track).toHaveBeenCalledWith('iap_success', { productId: 'coins_500' });
    expect(fulfillTransaction(transaction('coins_500', 'GPA.A'))).toEqual({ kind: 'duplicate' });
    iap.purchase.mockResolvedValueOnce(success('coins_500', 'GPA.A'));
    await expect(buyProduct('coins_500')).resolves.toEqual({ kind: 'duplicate' });
    expect(progress().coins).toBe(600);
    expect(toastKey()).toBeNull();
  });

  it('grants the Starter Pack (items, Aurora, flag) once', async () => {
    useProgressStore.setState({ level: 9, starterPackExpiresAt: NOW + 1000 });
    iap.purchase.mockResolvedValueOnce(success('starter_pack', 'GPA.S'));
    const result = await buyProduct('starter_pack');
    expect(result).toMatchObject({ kind: 'granted', themeId: 'aurora' });
    expect(progress()).toMatchObject({ coins: 1600, hints: 13, undos: 10 });
    expect(progress().starterPackPurchased).toBe(true);
    expect(progress().ownedThemes).toContain('aurora');
    iap.purchase.mockResolvedValueOnce(success('starter_pack', 'GPA.S2'));
    await expect(buyProduct('starter_pack')).resolves.toEqual({
      kind: 'alreadyOwned',
      productId: 'starter_pack',
    });
    expect(progress().coins).toBe(1600);
  });

  it('activates Remove Ads and VIP from the entitlements, with a toast', async () => {
    iap.purchase.mockResolvedValueOnce(
      success('remove_ads', 'GPA.R', snapshot({ entitlements: { noAds: true, vip: false } })),
    );
    await expect(buyProduct('remove_ads')).resolves.toEqual({
      kind: 'entitled',
      productId: 'remove_ads',
    });
    expect(progress().entitlements.noAds).toBe(true);
    expect(toastKey()).toBe('iap.adsRemoved');
    clearToasts();
    iap.purchase.mockResolvedValueOnce(
      success('vip_monthly', 'GPA.V', snapshot({ entitlements: { noAds: true, vip: true } })),
    );
    await buyProduct('vip_monthly');
    expect(progress().entitlements.vip).toBe(true);
    expect(toastKey()).toBe('iap.vipActive');
  });

  it('is silent on cancel and offers nothing but a result on already owned', async () => {
    iap.purchase.mockResolvedValueOnce({ kind: 'cancelled' });
    await expect(buyProduct('coins_500')).resolves.toEqual({ kind: 'cancelled' });
    expect(toastKey()).toBeNull();
    expect(track).toHaveBeenLastCalledWith('iap_failed', {
      productId: 'coins_500',
      reason: 'cancelled',
    });
    iap.purchase.mockResolvedValueOnce({ kind: 'alreadyOwned' });
    await expect(buyProduct('remove_ads')).resolves.toEqual({
      kind: 'alreadyOwned',
      productId: 'remove_ads',
    });
    expect(toastKey()).toBeNull();
  });

  it.each([
    ['network', 'iap.networkError'],
    ['store', 'iap.storeError'],
    ['unknown', 'iap.unknownError'],
  ] as const)('shows a toast for a %s failure', async (reason, key) => {
    iap.purchase.mockResolvedValueOnce({ kind: 'failed', reason });
    await expect(buyProduct('coins_500')).resolves.toEqual({ kind: 'failed', reason });
    expect(toastKey()).toBe(key);
    expect(track).toHaveBeenLastCalledWith('iap_failed', { productId: 'coins_500', reason });
  });

  it('treats a throwing provider as an unknown failure', async () => {
    iap.purchase.mockRejectedValueOnce(new Error('native'));
    await expect(buyProduct('coins_500')).resolves.toEqual({ kind: 'failed', reason: 'unknown' });
    expect(toastKey()).toBe('iap.unknownError');
  });

  it('rejects a second purchase while one is running', async () => {
    let finish: () => void = () => undefined;
    iap.purchase.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ kind: 'cancelled' });
        }),
    );
    const first = buyProduct('coins_500');
    await expect(buyProduct('coins_1500')).resolves.toEqual({ kind: 'busy' });
    finish();
    await first;
    iap.purchase.mockResolvedValueOnce({ kind: 'cancelled' });
    await expect(buyProduct('coins_1500')).resolves.toEqual({ kind: 'cancelled' });
  });

  it('remembers a pending payment and grants it when the store reports it', async () => {
    jest.useFakeTimers({ now: NOW });
    iap.purchase.mockResolvedValueOnce({ kind: 'pending' });
    await expect(buyProduct('coins_4000')).resolves.toEqual({ kind: 'pending' });
    expect(toastKey()).toBe('iap.pending');
    expect(progress().pendingPurchases).toEqual([{ productId: 'coins_4000', since: NOW }]);
    clearToasts();
    const later = snapshot({ transactions: [transaction('coins_4000', 'GPA.P', NOW + 60_000)] });
    applyCustomerSnapshot(later, NOW + 60_000);
    expect(progress().coins).toBe(4100);
    expect(progress().pendingPurchases).toEqual([]);
    expect(toastKey()).toBe('iap.pendingComplete');
    expect(track).toHaveBeenLastCalledWith('iap_success', { productId: 'coins_4000' });
    applyCustomerSnapshot(later, NOW + 120_000);
    expect(progress().coins).toBe(4100);
    jest.useRealTimers();
  });

  it('grants the purchase itself, not a pending completion, when it was pending before', async () => {
    useProgressStore.setState({ pendingPurchases: [{ productId: 'coins_500', since: NOW }] });
    const tx = transaction('coins_500', 'GPA.SAME', NOW);
    iap.purchase.mockResolvedValueOnce({
      kind: 'success',
      transaction: tx,
      customer: snapshot({ transactions: [tx] }),
    });
    await expect(buyProduct('coins_500')).resolves.toMatchObject({ kind: 'granted' });
    expect(progress().coins).toBe(600);
    expect(toastKey()).toBeNull();
  });
});

describe('server routing', () => {
  it('leaves signed-in purchases to the server', async () => {
    setSignedInResolver(() => true);
    iap.purchase.mockResolvedValueOnce(success('coins_500'));
    await expect(buyProduct('coins_500')).resolves.toEqual({ kind: 'awaitingServer' });
    expect(progress().coins).toBe(100);
    expect(progress().processedTransactions).toEqual([]);
    expect(toastKey()).toBe('iap.awaitingServer');
  });
});

describe('entitlement sync', () => {
  it('writes entitlements from every snapshot, including a VIP lapse', () => {
    applyCustomerSnapshot(snapshot({ entitlements: { noAds: true, vip: true } }));
    expect(progress().entitlements).toEqual({ noAds: true, vip: true });
    useProgressStore.setState({ activeTheme: 'gold' });
    applyCustomerSnapshot(snapshot({ entitlements: { noAds: true, vip: false } }));
    expect(progress().entitlements).toEqual({ noAds: true, vip: false });
    expect(progress().activeTheme).toBe('classic');
  });

  it('never grants store history that was not pending', () => {
    applyCustomerSnapshot(snapshot({ transactions: [transaction('coins_4000', 'OLD', 0)] }));
    expect(progress().coins).toBe(100);
  });

  it('syncs at start, follows the listener and re-syncs on foreground once a minute', async () => {
    jest.useFakeTimers({ now: NOW });
    let onChange: (state: AppStateStatus) => void = () => undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      onChange = handler as (state: AppStateStatus) => void;
      return { remove };
    });
    iap.refresh.mockResolvedValue(snapshot({ entitlements: { noAds: true, vip: false } }));
    const stop = startPurchases();
    await jest.advanceTimersByTimeAsync(0);
    expect(iap.init).toHaveBeenCalled();
    expect(iap.refresh).toHaveBeenCalledTimes(1);
    expect(progress().entitlements.noAds).toBe(true);
    iap.emit(snapshot({ entitlements: { noAds: true, vip: true } }));
    expect(progress().entitlements.vip).toBe(true);
    onChange('active');
    expect(iap.refresh).toHaveBeenCalledTimes(1);
    jest.setSystemTime(NOW + 60_000);
    onChange('active');
    expect(iap.refresh).toHaveBeenCalledTimes(2);
    stop();
    expect(remove).toHaveBeenCalled();
    iap.emit(snapshot());
    expect(progress().entitlements.vip).toBe(true);
    jest.useRealTimers();
  });
});

describe('restorePurchases', () => {
  it('restores Remove Ads and the Starter Pack theme, not its items', async () => {
    iap.restore.mockResolvedValueOnce({
      kind: 'restored',
      customer: snapshot({
        entitlements: { noAds: true, vip: false },
        ownedProductIds: ['remove_ads', 'starter_pack'],
      }),
    });
    await expect(restorePurchases()).resolves.toEqual({ kind: 'restored', restoredAny: true });
    expect(progress().entitlements.noAds).toBe(true);
    expect(progress().starterPackPurchased).toBe(true);
    expect(progress().ownedThemes).toContain('aurora');
    expect(progress().coins).toBe(100);
    expect(toastKey()).toBe('iap.restored');
  });

  it('says when there is nothing to restore, and toasts failures', async () => {
    await expect(restorePurchases()).resolves.toEqual({ kind: 'restored', restoredAny: false });
    expect(toastKey()).toBe('iap.nothingToRestore');
    clearToasts();
    iap.restore.mockResolvedValueOnce({ kind: 'failed', reason: 'network' });
    await restorePurchases();
    expect(toastKey()).toBe('iap.networkError');
    clearToasts();
    iap.restore.mockResolvedValueOnce({ kind: 'failed', reason: 'store' });
    await restorePurchases();
    expect(toastKey()).toBe('iap.restoreFailed');
  });
});

describe('products and availability', () => {
  it('initializes the provider before loading products', async () => {
    await expect(loadStoreProducts()).resolves.toBe(STORE_PRODUCTS);
    expect(iap.init.mock.invocationCallOrder[0]).toBeLessThan(
      iap.getProducts.mock.invocationCallOrder[0] ?? 0,
    );
    expect(purchasesAvailable()).toBe(true);
  });

  it('degrades gracefully when purchases are unavailable', async () => {
    setIapProvider(unavailableIapProvider);
    expect(purchasesAvailable()).toBe(false);
    expect(startPurchases()).toEqual(expect.any(Function));
    await expect(buyProduct('coins_500')).resolves.toEqual({ kind: 'failed', reason: 'store' });
    await expect(restorePurchases()).resolves.toEqual({ kind: 'failed', reason: 'store' });
  });
});
