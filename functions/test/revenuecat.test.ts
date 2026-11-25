import { describe, expect, it } from 'vitest';

import {
  baseProductId,
  decideWebhookEvent,
  grantAmounts,
  grantDocId,
  type WebhookDecision,
} from '../src/revenuecat.js';

const UID = 'AbCdEf1234567890abcdef123456';

const body = (event: Record<string, unknown>) => ({
  api_version: '1.0',
  event: {
    id: 'evt-1',
    environment: 'PRODUCTION',
    store: 'PLAY_STORE',
    app_user_id: UID,
    ...event,
  },
});

const grant = (decision: WebhookDecision) => {
  if (decision.kind !== 'grant') throw new Error(`expected a grant, got ${decision.kind}`);
  return decision.plan;
};

const skipReason = (decision: WebhookDecision) =>
  decision.kind === 'skip' ? decision.reason : decision.kind;

describe('purchases', () => {
  it('grants a consumable keyed by the store transaction id', () => {
    const plan = grant(
      decideWebhookEvent(
        body({
          type: 'NON_RENEWING_PURCHASE',
          product_id: 'coins_1500',
          transaction_id: 'GPA.1234-5678-9012-34567',
        }),
      ),
    );
    expect(plan).toEqual({
      uid: UID,
      docId: 'GPA.1234-5678-9012-34567',
      type: 'purchase',
      transactionId: 'GPA.1234-5678-9012-34567',
      productId: 'coins_1500',
      amounts: { coins: 1500, hints: 0, undos: 0, extraTubes: 0 },
      themeId: null,
      eventId: 'evt-1',
      eventType: 'NON_RENEWING_PURCHASE',
      environment: 'PRODUCTION',
    });
  });

  it('grants the Starter Pack with its items and theme', () => {
    const plan = grant(
      decideWebhookEvent(
        body({ type: 'INITIAL_PURCHASE', product_id: 'starter_pack', transaction_id: 'GPA.2' }),
      ),
    );
    expect(plan.amounts).toEqual({ coins: 1500, hints: 10, undos: 10, extraTubes: 0 });
    expect(plan.themeId).toBe('aurora');
  });

  it('reads the base product id of Play identifiers', () => {
    expect(baseProductId('vip_weekly:weekly')).toBe('vip_weekly');
    expect(baseProductId('coins_500')).toBe('coins_500');
  });
});

describe('refunds', () => {
  it.each([
    [
      'a customer-support cancellation',
      { type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' },
    ],
    ['a REFUND event', { type: 'REFUND' }],
  ])('writes a negative grant for %s', (_name, event) => {
    const plan = grant(
      decideWebhookEvent(body({ ...event, product_id: 'coins_500', transaction_id: 'GPA.3' })),
    );
    expect(plan.type).toBe('refund');
    expect(plan.docId).toBe('GPA.3_refund');
    expect(plan.transactionId).toBe('GPA.3');
    expect(plan.amounts).toEqual({ coins: -500, hints: 0, undos: 0, extraTubes: 0 });
    expect(plan.themeId).toBeNull();
  });

  it('negates every Starter Pack item and keeps zeros positive', () => {
    expect(grantAmounts('starter_pack', 'refund')).toEqual({
      coins: -1500,
      hints: -10,
      undos: -10,
      extraTubes: 0,
    });
    expect(Object.is(grantAmounts('coins_500', 'refund').hints, 0)).toBe(true);
    expect(grantDocId('T', 'refund')).toBe('T_refund');
    expect(grantDocId('T', 'purchase')).toBe('T');
  });
});

describe('events without a grant', () => {
  it.each([
    ['TEST', {}, 'test'],
    ['TRANSFER', { transferred_from: ['$RCAnonymousID:a'], transferred_to: [UID] }, 'transfer'],
    ['RENEWAL', { product_id: 'vip_weekly:weekly', transaction_id: 'GPA.4..0' }, 'noGrantForEvent'],
    ['PRODUCT_CHANGE', { product_id: 'vip_monthly', transaction_id: 'GPA.5' }, 'noGrantForEvent'],
    [
      'CANCELLATION',
      { cancel_reason: 'UNSUBSCRIBE', product_id: 'vip_weekly', transaction_id: 'GPA.6' },
      'noGrantForEvent',
    ],
    ['EXPIRATION', { product_id: 'vip_weekly', transaction_id: 'GPA.7' }, 'noGrantForEvent'],
    ['REFUND_REVERSED', { product_id: 'coins_500', transaction_id: 'GPA.8' }, 'noGrantForEvent'],
    ['SOMETHING_NEW', { product_id: 'coins_500', transaction_id: 'GPA.9' }, 'unsupportedEvent'],
  ])('acknowledges %s', (type, event, reason) => {
    expect(skipReason(decideWebhookEvent(body({ type, ...event })))).toBe(reason);
  });

  it('never grants entitlement-only products (Remove Ads, VIP)', () => {
    for (const product_id of ['remove_ads', 'vip_weekly:weekly', 'vip_monthly']) {
      expect(
        skipReason(
          decideWebhookEvent(
            body({ type: 'INITIAL_PURCHASE', product_id, transaction_id: 'GPA.1' }),
          ),
        ),
      ).toBe('entitlementOnly');
    }
  });

  it('skips anonymous RevenueCat users', () => {
    expect(
      skipReason(
        decideWebhookEvent(
          body({
            type: 'NON_RENEWING_PURCHASE',
            app_user_id: '$RCAnonymousID:abc',
            product_id: 'coins_500',
            transaction_id: 'GPA.1',
          }),
        ),
      ),
    ).toBe('anonymousUser');
  });

  it.each([
    ['a path-like user id', { app_user_id: 'users/x' }, 'invalidUser'],
    ['an empty user id', { app_user_id: '' }, 'invalidUser'],
    ['an unknown product', { product_id: 'gems' }, 'unknownProduct'],
    ['a missing transaction id', { transaction_id: '' }, 'missingTransactionId'],
    ['a transaction id with a slash', { transaction_id: 'a/b' }, 'missingTransactionId'],
  ])('skips %s', (_name, overrides, reason) => {
    expect(
      skipReason(
        decideWebhookEvent(
          body({
            type: 'INITIAL_PURCHASE',
            product_id: 'coins_500',
            transaction_id: 'GPA.1',
            ...overrides,
          }),
        ),
      ),
    ).toBe(reason);
  });
});

describe('invalid bodies', () => {
  it.each([null, {}, { event: 'x' }, { event: {} }, { event: { type: '' } }])(
    'rejects %j',
    (value) => {
      expect(decideWebhookEvent(value).kind).toBe('invalid');
    },
  );
});
