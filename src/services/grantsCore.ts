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

/**
 * Reads a grant document. Null when it is malformed, already applied, or for a product this app
 * version does not know (it then stays unapplied for a newer version).
 */
export const parseServerGrant = (id: string, data: unknown): ServerGrant | null => {
  if (id.length === 0 || !isRecord(data) || data.applied !== false) return null;
  const { type, productId } = data;
  if (type !== 'purchase' && type !== 'refund') return null;
  if (typeof productId !== 'string' || !isProductId(productId)) return null;
  return { id, type, productId };
};
