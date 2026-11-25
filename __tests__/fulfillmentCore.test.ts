import {
  applyEntitlements,
  applyPendingPurchase,
  applyPrunePending,
  applyRestoredProducts,
  applyStoreTransaction,
  FOREGROUND_RESYNC_MS,
  PENDING_MATCH_TOLERANCE_MS,
  PENDING_MAX_AGE_MS,
  pendingTransactionsToFulfill,
  rememberTransaction,
  routeFulfillment,
  shouldResync,
} from '@/services/fulfillmentCore';
import { createDefaultProgress, type ProgressState } from '@/state/progressModel';

import { transaction } from '../test-utils/fakeIap';

const NOW = new Date(2026, 10, 24, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

const state = (overrides: Partial<ProgressState> = {}): ProgressState => ({
  ...createDefaultProgress(NOW),
  ...overrides,
});

describe('routeFulfillment', () => {
  it('sends only signed-in purchases with server fulfillment on to the server', () => {
    expect(routeFulfillment({ signedIn: true, serverFulfillment: true })).toBe('server');
    expect(routeFulfillment({ signedIn: true, serverFulfillment: false })).toBe('client');
    expect(routeFulfillment({ signedIn: false, serverFulfillment: true })).toBe('client');
    expect(routeFulfillment({ signedIn: false, serverFulfillment: false })).toBe('client');
  });
});

describe('applyStoreTransaction', () => {
  it('grants a coin pack once per transaction id', () => {
    const first = applyStoreTransaction(state(), transaction('coins_1500', 'GPA.1'), NOW);
    expect(first.result).toEqual({ kind: 'granted', reward: { coins: 1500 }, themeId: null });
    expect(first.state.coins).toBe(100 + 1500);
    expect(first.state.processedTransactions).toEqual(['GPA.1']);
    const again = applyStoreTransaction(first.state, transaction('coins_1500', 'GPA.1'), NOW);
    expect(again.result.kind).toBe('duplicate');
    expect(again.state).toBe(first.state);
    const next = applyStoreTransaction(first.state, transaction('coins_500', 'GPA.2'), NOW);
    expect(next.state.coins).toBe(2100);
  });

  it('refuses an empty transaction id for grantable products', () => {
    const before = state();
    const result = applyStoreTransaction(before, transaction('coins_500', '  '), NOW);
    expect(result).toEqual({ state: before, result: { kind: 'invalid' } });
  });

  it('treats Remove Ads and VIP as entitlement-only, whatever the id', () => {
    const before = state();
    for (const id of ['remove_ads', 'vip_weekly', 'vip_monthly'] as const) {
      const result = applyStoreTransaction(before, transaction(id, ''), NOW);
      expect(result).toEqual({ state: before, result: { kind: 'entitlementOnly' } });
    }
  });

  it('grants the Starter Pack items and Aurora once per player', () => {
    const first = applyStoreTransaction(state(), transaction('starter_pack', 'GPA.S1'), NOW);
    expect(first.result).toEqual({
      kind: 'granted',
      reward: { coins: 1500, hints: 10, undos: 10 },
      themeId: 'aurora',
    });
    expect(first.state).toMatchObject({
      coins: 1600,
      hints: 13,
      undos: 10,
      starterPackPurchased: true,
    });
    expect(first.state.ownedThemes).toEqual(['classic', 'aurora']);
    const second = applyStoreTransaction(first.state, transaction('starter_pack', 'GPA.S2'), NOW);
    expect(second.result.kind).toBe('alreadyOwned');
    expect(second.state.coins).toBe(1600);
    expect(second.state.processedTransactions).toEqual(['GPA.S1', 'GPA.S2']);
  });

  it('does not list Aurora twice when it is already owned', () => {
    const owned = state({ ownedThemes: ['classic', 'aurora'] });
    const result = applyStoreTransaction(owned, transaction('starter_pack'), NOW);
    expect(result.result).toMatchObject({ kind: 'granted', themeId: null });
    expect(result.state.ownedThemes).toEqual(['classic', 'aurora']);
  });

  it('clears the pending marker of the fulfilled product', () => {
    const pending = applyPendingPurchase(state(), 'coins_500', NOW, NOW);
    const done = applyStoreTransaction(pending, transaction('coins_500'), NOW);
    expect(done.state.pendingPurchases).toEqual([]);
    const ads = applyPendingPurchase(state(), 'remove_ads', NOW, NOW);
    expect(
      applyStoreTransaction(ads, transaction('remove_ads'), NOW).state.pendingPurchases,
    ).toEqual([]);
  });
});

describe('rememberTransaction', () => {
  it('keeps the latest 200 ids without duplicates', () => {
    let ids: string[] = [];
    for (let i = 0; i < 205; i += 1) ids = rememberTransaction(ids, `T${i}`);
    expect(ids).toHaveLength(200);
    expect(ids[0]).toBe('T5');
    expect(rememberTransaction(['a', 'b'], 'a')).toEqual(['b', 'a']);
  });
});

describe('pending purchases', () => {
  it('matches only unprocessed transactions of pending products, one per product', () => {
    const pending = applyPendingPurchase(state(), 'coins_500', NOW, NOW);
    const txs = [
      transaction('coins_500', 'NEW', NOW + 1000),
      transaction('coins_500', 'NEWER', NOW + 2000),
      transaction('coins_1500', 'OTHER', NOW + 1000),
      transaction('coins_500', 'TOO_OLD', NOW - PENDING_MATCH_TOLERANCE_MS - 1),
    ];
    expect(pendingTransactionsToFulfill(pending, txs).map((t) => t.transactionId)).toEqual(['NEW']);
    const processed = { ...pending, processedTransactions: ['NEW'] };
    expect(pendingTransactionsToFulfill(processed, txs).map((t) => t.transactionId)).toEqual([
      'NEWER',
    ]);
    expect(pendingTransactionsToFulfill(state(), txs)).toEqual([]);
  });

  it('accepts a store purchase time slightly before the start (clock skew)', () => {
    const pending = applyPendingPurchase(state(), 'coins_500', NOW, NOW);
    const skewed = [transaction('coins_500', 'SKEW', NOW - PENDING_MATCH_TOLERANCE_MS)];
    expect(pendingTransactionsToFulfill(pending, skewed)).toHaveLength(1);
  });

  it('replaces a product marker and prunes old ones', () => {
    const once = applyPendingPurchase(state(), 'coins_500', NOW - PENDING_MAX_AGE_MS - 1, NOW);
    const twice = applyPendingPurchase(once, 'coins_1500', NOW, NOW);
    expect(twice.pendingPurchases).toHaveLength(2);
    const pruned = applyPrunePending(twice, NOW);
    expect(pruned.pendingPurchases).toEqual([{ productId: 'coins_1500', since: NOW }]);
    expect(applyPrunePending(pruned, NOW)).toBe(pruned);
    const replaced = applyPendingPurchase(pruned, 'coins_1500', NOW + 5, NOW + 5);
    expect(replaced.pendingPurchases).toEqual([{ productId: 'coins_1500', since: NOW + 5 }]);
  });
});

describe('applyEntitlements', () => {
  it('writes no_ads and vip and is a no-op when unchanged', () => {
    const before = state();
    expect(applyEntitlements(before, { noAds: false, vip: false }, NOW)).toBe(before);
    const vip = applyEntitlements(before, { noAds: true, vip: true }, NOW);
    expect(vip.entitlements).toEqual({ noAds: true, vip: true });
  });

  it('falls back from Gold to Classic when VIP lapses', () => {
    const gold = state({ entitlements: { noAds: false, vip: true }, activeTheme: 'gold' });
    const lapsed = applyEntitlements(gold, { noAds: false, vip: false }, NOW + 1);
    expect(lapsed.activeTheme).toBe('classic');
    expect(lapsed.updatedAt).toBe(NOW + 1);
  });
});

describe('applyRestoredProducts', () => {
  it('restores the Starter Pack theme and flag but never its items', () => {
    const before = state();
    const restored = applyRestoredProducts(before, ['starter_pack', 'remove_ads'], NOW);
    expect(restored).toMatchObject({ starterPackPurchased: true, coins: 100, hints: 3, undos: 0 });
    expect(restored.ownedThemes).toContain('aurora');
    expect(applyRestoredProducts(restored, ['starter_pack'], NOW)).toBe(restored);
    expect(applyRestoredProducts(before, ['remove_ads'], NOW)).toBe(before);
  });
});

describe('shouldResync', () => {
  it('allows one foreground re-sync per minute, and one after a clock rollback', () => {
    expect(shouldResync(0, NOW)).toBe(true);
    expect(shouldResync(NOW, NOW + FOREGROUND_RESYNC_MS - 1)).toBe(false);
    expect(shouldResync(NOW, NOW + FOREGROUND_RESYNC_MS)).toBe(true);
    expect(shouldResync(NOW, NOW - DAY)).toBe(true);
  });
});
