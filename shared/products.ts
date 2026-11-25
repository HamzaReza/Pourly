/**
 * Store products and what each one grants: the single table shared by the app
 * (`src/config/products.ts` re-exports it) and the Cloud Functions (`functions/` copies this file
 * into `functions/src/shared/` before every build). It must stay free of imports so both
 * toolchains can compile it.
 */

export const PRODUCT_IDS = {
  coins500: 'coins_500',
  coins1500: 'coins_1500',
  coins4000: 'coins_4000',
  removeAds: 'remove_ads',
  starterPack: 'starter_pack',
  vipWeekly: 'vip_weekly',
  vipMonthly: 'vip_monthly',
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

export const ENTITLEMENTS = {
  noAds: 'no_ads',
  vip: 'vip',
} as const;

export type EntitlementId = (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS];

export const OFFERING_ID = 'default';

export type ProductKind = 'consumable' | 'nonConsumable' | 'subscription';

/** Inventory a purchase adds. Same shape as the app's `RewardBundle`. */
export interface ProductGrant {
  coins?: number;
  hints?: number;
  undos?: number;
  extraTubes?: number;
}

export interface ProductDefinition {
  id: ProductId;
  kind: ProductKind;
  /** Inventory granted once per store transaction. Empty for entitlement-only products. */
  grant: ProductGrant;
  /** Theme unlocked by the purchase, if any. */
  themeId?: string;
  /** Entitlement the store attaches to the product, if any. */
  entitlement?: EntitlementId;
}

export const STARTER_PACK_CONTENTS = {
  coins: 1500,
  hints: 10,
  undos: 10,
  themeId: 'aurora',
} as const;

export const PRODUCTS: Readonly<Record<ProductId, ProductDefinition>> = {
  coins_500: { id: 'coins_500', kind: 'consumable', grant: { coins: 500 } },
  coins_1500: { id: 'coins_1500', kind: 'consumable', grant: { coins: 1500 } },
  coins_4000: { id: 'coins_4000', kind: 'consumable', grant: { coins: 4000 } },
  remove_ads: {
    id: 'remove_ads',
    kind: 'nonConsumable',
    grant: {},
    entitlement: ENTITLEMENTS.noAds,
  },
  starter_pack: {
    id: 'starter_pack',
    kind: 'nonConsumable',
    grant: {
      coins: STARTER_PACK_CONTENTS.coins,
      hints: STARTER_PACK_CONTENTS.hints,
      undos: STARTER_PACK_CONTENTS.undos,
    },
    themeId: STARTER_PACK_CONTENTS.themeId,
  },
  vip_weekly: { id: 'vip_weekly', kind: 'subscription', grant: {}, entitlement: ENTITLEMENTS.vip },
  vip_monthly: {
    id: 'vip_monthly',
    kind: 'subscription',
    grant: {},
    entitlement: ENTITLEMENTS.vip,
  },
};

export const COIN_PACK_IDS: readonly ProductId[] = [
  PRODUCT_IDS.coins500,
  PRODUCT_IDS.coins1500,
  PRODUCT_IDS.coins4000,
];

export const VIP_PRODUCT_IDS: readonly ProductId[] = [
  PRODUCT_IDS.vipWeekly,
  PRODUCT_IDS.vipMonthly,
];

export const isProductId = (value: string): value is ProductId =>
  Object.prototype.hasOwnProperty.call(PRODUCTS, value);

/** Whether a product adds inventory (consumables and the Starter Pack), so it needs a grant. */
export const grantsInventory = (product: ProductDefinition): boolean =>
  Boolean(
    product.grant.coins || product.grant.hints || product.grant.undos || product.grant.extraTubes,
  );
