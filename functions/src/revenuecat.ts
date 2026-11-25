/**
 * Pure mapping from a RevenueCat webhook event to what the backend should do with it. No Firebase
 * imports, so every rule is unit-testable with plain payloads.
 *
 * Grants are keyed by the event's `transaction_id`. On Google Play that is the order id
 * (`GPA.…`), the same value the app's SDK reports as `transaction.transactionIdentifier` after a
 * purchase, so the app's `processedTransactions` dedupes a device grant against a server grant.
 */
import { grantsInventory, isProductId, PRODUCTS, type ProductId } from './shared/products.js';

/** Inventory amounts of a grant. Negative for a refund. */
export interface GrantAmounts {
  readonly coins: number;
  readonly hints: number;
  readonly undos: number;
  readonly extraTubes: number;
}

export type GrantType = 'purchase' | 'refund';

/** A grant document to create at `users/{uid}/grants/{docId}`. */
export interface GrantPlan {
  readonly uid: string;
  readonly docId: string;
  readonly type: GrantType;
  readonly transactionId: string;
  readonly productId: ProductId;
  readonly amounts: GrantAmounts;
  readonly themeId: string | null;
  readonly eventId: string;
  readonly eventType: string;
  readonly environment: string;
}

export type SkipReason =
  | 'test'
  | 'anonymousUser'
  | 'invalidUser'
  | 'unknownProduct'
  | 'entitlementOnly'
  | 'noGrantForEvent'
  | 'transfer'
  | 'missingTransactionId'
  | 'unsupportedEvent';

export type WebhookDecision =
  | { readonly kind: 'grant'; readonly plan: GrantPlan }
  | { readonly kind: 'skip'; readonly reason: SkipReason; readonly eventType: string }
  | { readonly kind: 'invalid'; readonly message: string };

/** Events that deliver a new purchase of a product. */
const PURCHASE_EVENTS: readonly string[] = ['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE'];

/**
 * Subscription and entitlement lifecycle events: entitlements come from RevenueCat customer info
 * on the device, so these are acknowledged without a grant.
 */
const LIFECYCLE_EVENTS: readonly string[] = [
  'RENEWAL',
  'PRODUCT_CHANGE',
  'CANCELLATION',
  'UNCANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
  'SUBSCRIPTION_EXTENDED',
  'REFUND_REVERSED',
  'TEMPORARY_ENTITLEMENT_GRANT',
];

/**
 * RevenueCat reports a refund as `CANCELLATION` with `cancel_reason: CUSTOMER_SUPPORT`. `REFUND`
 * (the name used in the spec) is accepted as well.
 */
const REFUND_CANCEL_REASON = 'CUSTOMER_SUPPORT';

const ANONYMOUS_PREFIX = '$RCAnonymousID:';
/** Firebase Auth uids: 1–128 characters, no path separators. */
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
/** Store transaction ids become document ids: printable, no `/`, bounded. */
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (source: Record<string, unknown>, key: string): string => {
  const value = source[key];
  return typeof value === 'string' ? value.trim() : '';
};

/** The Play product id of a store identifier (`vip_weekly:weekly` → `vip_weekly`). */
export const baseProductId = (identifier: string): string => identifier.split(':')[0] ?? '';

const whole = (value: number | undefined): number =>
  value !== undefined && Number.isInteger(value) && value > 0 ? value : 0;

/** The amounts a product grants, negated for a refund. */
export const grantAmounts = (productId: ProductId, type: GrantType): GrantAmounts => {
  const sign = type === 'refund' ? -1 : 1;
  const { grant } = PRODUCTS[productId];
  // `0 * -1` is `-0`; `|| 0` keeps stored zeros positive.
  return {
    coins: sign * whole(grant.coins) || 0,
    hints: sign * whole(grant.hints) || 0,
    undos: sign * whole(grant.undos) || 0,
    extraTubes: sign * whole(grant.extraTubes) || 0,
  };
};

/** Grant document id: the transaction id for a purchase, `{transactionId}_refund` for a refund. */
export const grantDocId = (transactionId: string, type: GrantType): string =>
  type === 'refund' ? `${transactionId}_refund` : transactionId;

/** Decides what to do with one webhook body (`{ api_version, event }`). */
export const decideWebhookEvent = (body: unknown): WebhookDecision => {
  if (!isRecord(body) || !isRecord(body.event)) {
    return { kind: 'invalid', message: 'Body has no event object' };
  }
  const event = body.event;
  const eventType = text(event, 'type');
  if (eventType.length === 0) return { kind: 'invalid', message: 'Event has no type' };
  if (eventType === 'TEST') return { kind: 'skip', reason: 'test', eventType };
  if (eventType === 'TRANSFER') return { kind: 'skip', reason: 'transfer', eventType };

  const isRefund =
    eventType === 'REFUND' ||
    (eventType === 'CANCELLATION' && text(event, 'cancel_reason') === REFUND_CANCEL_REASON);
  const isPurchase = PURCHASE_EVENTS.includes(eventType);
  if (!isRefund && !isPurchase) {
    return {
      kind: 'skip',
      reason: LIFECYCLE_EVENTS.includes(eventType) ? 'noGrantForEvent' : 'unsupportedEvent',
      eventType,
    };
  }

  const uid = text(event, 'app_user_id');
  if (uid.startsWith(ANONYMOUS_PREFIX)) return { kind: 'skip', reason: 'anonymousUser', eventType };
  if (!UID_PATTERN.test(uid)) return { kind: 'skip', reason: 'invalidUser', eventType };

  const productId = baseProductId(text(event, 'product_id'));
  if (!isProductId(productId)) return { kind: 'skip', reason: 'unknownProduct', eventType };
  if (!grantsInventory(PRODUCTS[productId])) {
    return { kind: 'skip', reason: 'entitlementOnly', eventType };
  }

  const transactionId = text(event, 'transaction_id');
  if (!TRANSACTION_ID_PATTERN.test(transactionId)) {
    return { kind: 'skip', reason: 'missingTransactionId', eventType };
  }

  const type: GrantType = isRefund ? 'refund' : 'purchase';
  return {
    kind: 'grant',
    plan: {
      uid,
      docId: grantDocId(transactionId, type),
      type,
      transactionId,
      productId,
      amounts: grantAmounts(productId, type),
      themeId: type === 'purchase' ? (PRODUCTS[productId].themeId ?? null) : null,
      eventId: text(event, 'id'),
      eventType,
      environment: text(event, 'environment'),
    },
  };
};
