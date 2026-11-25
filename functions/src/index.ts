/**
 * Pourly Cloud Functions (Functions v2, Node 22, us-central1).
 *
 * - `revenuecatWebhook`: RevenueCat → server-side purchase fulfillment. Consumables and the
 *   Starter Pack become grant documents at `users/{uid}/grants/{transactionId}`; the app applies
 *   each grant once and marks it applied. Refunds write `{transactionId}_refund` with negative
 *   amounts. Entitlements (Remove Ads, VIP) are never written: the app reads them from RevenueCat.
 * - `deleteMyAccount`: deletes the caller's cloud save, grants and Auth user. It takes no
 *   parameters and only ever acts on `request.auth.uid`.
 */
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';

import { decideWebhookEvent, type GrantPlan } from './revenuecat.js';
import { authorizationMatches } from './webhookAuth.js';

initializeApp();

const REGION = 'us-central1';

const REVENUECAT_WEBHOOK_SECRET = defineSecret('REVENUECAT_WEBHOOK_SECRET');

const readSecret = (): string | undefined => {
  try {
    return REVENUECAT_WEBHOOK_SECRET.value();
  } catch (error: unknown) {
    logger.error('REVENUECAT_WEBHOOK_SECRET is not available', error);
    return undefined;
  }
};

/** Creates the grant document unless it exists (a webhook retry is a no-op). */
const writeGrant = async (plan: GrantPlan): Promise<'created' | 'exists'> => {
  const db = getFirestore();
  const ref = db.collection('users').doc(plan.uid).collection('grants').doc(plan.docId);
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return 'exists';
    transaction.create(ref, {
      type: plan.type,
      transactionId: plan.transactionId,
      productId: plan.productId,
      coins: plan.amounts.coins,
      hints: plan.amounts.hints,
      undos: plan.amounts.undos,
      extraTubes: plan.amounts.extraTubes,
      themeId: plan.themeId,
      eventId: plan.eventId,
      eventType: plan.eventType,
      environment: plan.environment,
      createdAt: FieldValue.serverTimestamp(),
      applied: false,
      appliedAt: null,
    });
    return 'created';
  });
};

export const revenuecatWebhook = onRequest(
  { region: REGION, secrets: [REVENUECAT_WEBHOOK_SECRET], maxInstances: 10 },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.set('Allow', 'POST').status(405).send('Method not allowed');
      return;
    }
    const secret = readSecret();
    if (secret === undefined || secret.trim().length === 0) {
      response.status(500).send('Webhook secret is not configured');
      return;
    }
    if (!authorizationMatches(request.get('authorization'), secret)) {
      logger.warn('Webhook rejected: bad Authorization header');
      response.status(401).send('Unauthorized');
      return;
    }

    const decision = decideWebhookEvent(request.body);
    if (decision.kind === 'invalid') {
      logger.warn('Webhook payload rejected', decision.message);
      response.status(400).send(decision.message);
      return;
    }
    if (decision.kind === 'skip') {
      logger.info('Webhook event acknowledged without a grant', {
        eventType: decision.eventType,
        reason: decision.reason,
      });
      response.status(200).json({ ok: true, granted: false, reason: decision.reason });
      return;
    }

    const { plan } = decision;
    try {
      const outcome = await writeGrant(plan);
      logger.info('Grant written', {
        uid: plan.uid,
        docId: plan.docId,
        type: plan.type,
        productId: plan.productId,
        outcome,
      });
      response.status(200).json({ ok: true, granted: outcome === 'created' });
    } catch (error: unknown) {
      // A non-2xx answer makes RevenueCat retry; the transaction keeps the retry idempotent.
      logger.error('Grant write failed', { uid: plan.uid, docId: plan.docId }, error);
      response.status(500).send('Could not store the grant');
    }
  },
);

const isAuthUserMissing = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === 'auth/user-not-found';

export const deleteMyAccount = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (uid === undefined) {
    throw new HttpsError('unauthenticated', 'Sign in to delete your account.');
  }
  const db = getFirestore();
  try {
    await db.recursiveDelete(db.collection('users').doc(uid));
  } catch (error: unknown) {
    logger.error('Deleting cloud data failed', { uid }, error);
    throw new HttpsError('internal', 'Could not delete your data. Please try again.');
  }
  try {
    await getAuth().deleteUser(uid);
  } catch (error: unknown) {
    if (!isAuthUserMissing(error)) {
      logger.error('Deleting the Auth user failed', { uid }, error);
      throw new HttpsError('internal', 'Could not delete your account. Please try again.');
    }
  }
  logger.info('Account deleted', { uid });
  return { deleted: true };
});
