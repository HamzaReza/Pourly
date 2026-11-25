/**
 * Product table. The definitions live in `shared/products.ts`, the single source used by both the
 * app and the Cloud Functions (`functions/` copies it before each build).
 */
export {
  COIN_PACK_IDS,
  ENTITLEMENTS,
  grantsInventory,
  isProductId,
  OFFERING_ID,
  PRODUCT_IDS,
  PRODUCTS,
  STARTER_PACK_CONTENTS,
  VIP_PRODUCT_IDS,
  type EntitlementId,
  type ProductDefinition,
  type ProductGrant,
  type ProductId,
  type ProductKind,
} from '../../shared/products';
