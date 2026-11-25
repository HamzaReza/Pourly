/**
 * Store-neutral purchase types shared by the IAP providers (`iap.ts`), the fulfillment core and
 * the Shop. No runtime code.
 */
import type { ProductId } from '@/config/products';

/** A subscription's billing period, parsed from the store's ISO 8601 duration. */
export interface BillingPeriod {
  readonly unit: 'day' | 'week' | 'month' | 'year';
  readonly count: number;
}

/** A product as the store sells it to this player. */
export interface StoreProduct {
  readonly id: ProductId;
  /** Store title (localized by the store). */
  readonly title: string;
  /** Localized price with its currency, straight from the store. */
  readonly priceString: string;
  /** Subscriptions only. */
  readonly billingPeriod: BillingPeriod | null;
}

/** One completed store transaction. */
export interface StoreTransaction {
  /** Store transaction id (Google Play order id); the fulfillment idempotency key. */
  readonly transactionId: string;
  readonly productId: ProductId;
  /** Epoch ms of the purchase as reported by the store. */
  readonly purchasedAt: number;
}

export interface StoreEntitlements {
  readonly noAds: boolean;
  readonly vip: boolean;
}

/** What the store knows about the player right now. */
export interface CustomerSnapshot {
  readonly entitlements: StoreEntitlements;
  /** Non-subscription transactions (consumables and one-time products). */
  readonly transactions: readonly StoreTransaction[];
  /** Every product the player ever bought that the store still reports. */
  readonly ownedProductIds: readonly ProductId[];
}

export type PurchaseFailure = 'network' | 'store' | 'unknown';

export type PurchaseOutcome =
  | {
      readonly kind: 'success';
      readonly transaction: StoreTransaction;
      readonly customer: CustomerSnapshot;
    }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'alreadyOwned' }
  | { readonly kind: 'failed'; readonly reason: PurchaseFailure };

export type RestoreOutcome =
  | { readonly kind: 'restored'; readonly customer: CustomerSnapshot }
  | { readonly kind: 'failed'; readonly reason: PurchaseFailure };
