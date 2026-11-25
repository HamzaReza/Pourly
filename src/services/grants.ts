/**
 * Server grants listener (spec §26.5, signed-in players only). Listens to
 * `users/{uid}/grants` where `applied == false` and applies each grant exactly once:
 *
 * 1. Claim it in a Firestore transaction (`applied: true`, `appliedAt: serverTimestamp()`,
 *    `claimedBy: <installId>`, the only change the rules allow). If another device claimed it first, this device skips it and
 *    receives the balances through cloud save instead, so a grant never lands twice.
 * 2. Apply it through the fulfillment core keyed by the document id: a purchase via
 *    `fulfillTransaction` (already granted on this device → duplicate, nothing added), a refund via
 *    `refundTransaction` (balances floored at 0).
 * 3. The progress store is flushed to storage at once.
 * 4. A positive grant shows a toast and the Reward overlay.
 *
 * Recovery: if the app dies between 1 and 3, the grant is claimed but not on the device. On every
 * start the listener re-reads the grants this install claimed and applies those whose id is not in
 * `processedTransactions` (idempotent by id).
 */
import { useCloudStore } from '@/state/cloudStore';
import { flushProgress, useProgressStore } from '@/state/progressStore';
import { showToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import type { FirebaseServices } from './firebase';
import { pushGrantNotice } from './grantNotices';
import {
  grantsToRecover,
  MAX_RECOVERED_GRANTS,
  parseClaimedGrant,
  parseServerGrant,
  type ServerGrant,
} from './grantsCore';

const progress = () => useProgressStore.getState();

/**
 * Marks the grant applied unless it already is, recording this install as the claimer; true when
 * this install claimed it.
 */
const claimGrant = async (
  services: FirebaseServices,
  uid: string,
  grantId: string,
  installId: string,
): Promise<boolean> => {
  const fs = services.sdk.firestore;
  const ref = fs.doc(services.db, 'users', uid, 'grants', grantId);
  return fs.runTransaction(services.db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.get('applied') !== false) return false;
    transaction.update(ref, {
      applied: true,
      appliedAt: fs.serverTimestamp(),
      claimedBy: installId,
    });
    return true;
  });
};

/** Applies a claimed grant on the device; the fulfillment core ignores an id it already applied. */
export const applyServerGrant = (grant: ServerGrant, now: number = Date.now()): void => {
  if (grant.type === 'refund') {
    const result = progress().refundTransaction(grant.id, grant.productId, now);
    if (result.kind === 'refunded') showToast('cloud.refundApplied');
    return;
  }
  const result = progress().fulfillTransaction(
    { transactionId: grant.id, productId: grant.productId, purchasedAt: now },
    now,
  );
  if (result.kind !== 'granted') return;
  showToast('cloud.grantArrived');
  pushGrantNotice({ id: grant.id, productId: grant.productId, reward: result.reward });
};

/**
 * Applies grants this install claimed but never applied (the app was killed between the claim and
 * the local apply): the latest `MAX_RECOVERED_GRANTS` claimed by this install whose id is missing
 * from `processedTransactions`. Resolves with the number recovered.
 */
export const recoverClaimedGrants = async (
  uid: string,
  services: FirebaseServices,
  installId: string,
): Promise<number> => {
  const fs = services.sdk.firestore;
  const claimedQuery = fs.query(
    fs.collection(services.db, 'users', uid, 'grants'),
    fs.where('claimedBy', '==', installId),
    fs.orderBy('appliedAt', 'desc'),
    fs.limit(MAX_RECOVERED_GRANTS),
  );
  const snapshot = await fs.getDocs(claimedQuery);
  const claimed: ServerGrant[] = [];
  for (const entry of snapshot.docs) {
    const grant = parseClaimedGrant(entry.id, entry.data(), installId);
    if (grant !== null) claimed.push(grant);
  }
  // Oldest first, so a purchase is restored before its refund.
  const missing = grantsToRecover(claimed, progress().processedTransactions).reverse();
  for (const grant of missing) {
    logger.info('Recovering a grant claimed by this install', grant.id);
    applyServerGrant(grant);
  }
  if (missing.length > 0) await flushProgress();
  return missing.length;
};

/**
 * Starts the listener (after recovering this install's claimed-but-unapplied grants); returns the
 * function that stops it.
 */
export const startGrantsListener = (uid: string, services: FirebaseServices): (() => void) => {
  const fs = services.sdk.firestore;
  const installId = useCloudStore.getState().installId;
  const inFlight = new Set<string>();
  let stopped = false;

  const handle = async (grant: ServerGrant): Promise<void> => {
    if (inFlight.has(grant.id)) return;
    inFlight.add(grant.id);
    try {
      if (stopped || !(await claimGrant(services, uid, grant.id, installId))) return;
      // Once claimed, the grant is applied even if the player signed out meanwhile: it is theirs.
      applyServerGrant(grant);
      await flushProgress();
    } catch (error: unknown) {
      logger.warn('Could not apply a server grant', grant.id, error);
    } finally {
      inFlight.delete(grant.id);
    }
  };

  recoverClaimedGrants(uid, services, installId).catch((error: unknown) =>
    logger.warn('Could not check claimed grants', error),
  );

  const grantsQuery = fs.query(
    fs.collection(services.db, 'users', uid, 'grants'),
    fs.where('applied', '==', false),
  );
  const unsubscribe = fs.onSnapshot(
    grantsQuery,
    (snapshot) => {
      for (const entry of snapshot.docs) {
        const grant = parseServerGrant(entry.id, entry.data());
        if (grant === null) {
          logger.warn('Ignoring a grant this version cannot apply', entry.id);
          continue;
        }
        void handle(grant);
      }
    },
    (error) => logger.warn('Grants listener failed', error),
  );
  return () => {
    stopped = true;
    unsubscribe();
  };
};
