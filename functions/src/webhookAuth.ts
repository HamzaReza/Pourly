import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string): Buffer => createHash('sha256').update(value, 'utf8').digest();

/**
 * Whether the webhook's `Authorization` header equals the configured secret. Both values are
 * hashed first so the comparison runs in constant time whatever their lengths. A missing or empty
 * secret never authorizes anything.
 */
export const authorizationMatches = (
  header: string | undefined,
  secret: string | undefined,
): boolean => {
  if (secret === undefined || secret.trim().length === 0) return false;
  if (header === undefined || header.length === 0) return false;
  return timingSafeEqual(digest(header), digest(secret));
};
