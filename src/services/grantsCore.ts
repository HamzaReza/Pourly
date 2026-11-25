/**
 * Server grants (spec §26.5), pure part. The `revenuecatWebhook` Cloud Function writes one
 * document per store transaction to `users/{uid}/grants/{id}`:
 *
 * - a purchase: id = the store transaction id (the same id the device records after a purchase),
 * - a refund: id = `{transactionId}_refund`, negative amounts.
 *
 * The device applies each grant through the fulfillment core keyed by the document id, so
 * `processedTransactions` dedupes it against a grant the device already made.
 */
import { isProductId, type ProductId } from '@/config/products';

export interface ServerGrant {
  /** Document id; the idempotency key recorded in `processedTransactions`. */
  readonly id: string;
  readonly type: 'purchase' | 'refund';
  readonly productId: ProductId;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readGrant = (id: string, data: Record<string, unknown>): ServerGrant | null => {
  if (id.length === 0) return null;
  const { type, productId } = data;
  if (type !== 'purchase' && type !== 'refund') return null;
  if (typeof productId !== 'string' || !isProductId(productId)) return null;
  return { id, type, productId };
};

/**
 * Reads a grant document waiting to be applied. Null when it is malformed, already applied, or
 * for a product this app version does not know (it then stays unapplied for a newer version).
 */
export const parseServerGrant = (id: string, data: unknown): ServerGrant | null =>
  isRecord(data) && data.applied === false ? readGrant(id, data) : null;

/**
 * Reads a grant this install claimed earlier (`applied: true`, `claimedBy` = this install id).
 * Used to recover a grant whose local apply was lost (app killed right after the claim).
 */
export const parseClaimedGrant = (
  id: string,
  data: unknown,
  installId: string,
): ServerGrant | null =>
  isRecord(data) && data.applied === true && data.claimedBy === installId
    ? readGrant(id, data)
    : null;

/**
 * Claimed grants that never reached this device's progress: their id is missing from
 * `processedTransactions` (the fulfillment core records every applied grant id there).
 */
export const grantsToRecover = (
  claimed: readonly ServerGrant[],
  processedTransactions: readonly string[],
): ServerGrant[] => claimed.filter((grant) => !processedTransactions.includes(grant.id));

/** Most claimed grants re-checked on each start (newest first by `appliedAt`). */
export const MAX_RECOVERED_GRANTS = 50;
