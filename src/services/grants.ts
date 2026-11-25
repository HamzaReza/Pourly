/**
 * Server grants listener (spec §26.5, signed-in players only). Listens to
 * `users/{uid}/grants` where `applied == false` and applies each grant exactly once:
 *
 * 1. Claim it in a Firestore transaction (`applied: true`, `appliedAt: serverTimestamp()`, the
 *    only change the rules allow). If another device claimed it first, this device skips it and
 *    receives the balances through cloud save instead, so a grant never lands twice.
 * 2. Apply it through the fulfillment core keyed by the document id: a purchase via
 *    `fulfillTransaction` (already granted on this device → duplicate, nothing added), a refund via
 *    `refundTransaction` (balances floored at 0).
 * 3. A positive grant shows a toast and the Reward overlay.
 */
import { useProgressStore } from '@/state/progressStore';
import { showToast } from '@/ui/toastQueue';
import { logger } from '@/utils/logger';

import type { FirebaseServices } from './firebase';
import { pushGrantNotice } from './grantNotices';
import { parseServerGrant, type ServerGrant } from './grantsCore';

const progress = () => useProgressStore.getState();

/** Marks the grant applied unless it already is; true when this device claimed it. */
const claimGrant = async (
  services: FirebaseServices,
  uid: string,
  grantId: string,
): Promise<boolean> => {
  const fs = services.sdk.firestore;
  const ref = fs.doc(services.db, 'users', uid, 'grants', grantId);
  return fs.runTransaction(services.db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists() || snapshot.get('applied') !== false) return false;
    transaction.update(ref, { applied: true, appliedAt: fs.serverTimestamp() });
    return true;
  });
};

/** Applies a claimed grant on the device (exported for the merge/grant flow tests). */
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

/** Starts the listener; returns the function that stops it. */
export const startGrantsListener = (uid: string, services: FirebaseServices): (() => void) => {
  const fs = services.sdk.firestore;
  const inFlight = new Set<string>();
  let stopped = false;

  const handle = async (grant: ServerGrant): Promise<void> => {
    if (inFlight.has(grant.id)) return;
    inFlight.add(grant.id);
    try {
      if (stopped || !(await claimGrant(services, uid, grant.id))) return;
      // Once claimed, the grant is applied even if the player signed out meanwhile: it is theirs.
      applyServerGrant(grant);
    } catch (error: unknown) {
      logger.warn('Could not apply a server grant', grant.id, error);
    } finally {
      inFlight.delete(grant.id);
    }
  };

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
