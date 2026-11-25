/**
 * Firestore security rules (firebase/firestore.rules) against the emulator. Run with
 * `yarn test:rules` (starts the Firestore emulator; needs Java 21+ via JAVA_HOME).
 */
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

let env: RulesTestEnvironment;

const progress = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  schemaVersion: 1,
  level: 7,
  stars: { 1: 3, 2: 2 },
  coins: 120,
  hints: 3,
  undos: 0,
  extraTubes: 1,
  streak: 2,
  bestStreak: 4,
  lastDailyDate: '2026-11-24',
  dailyHistory: { '2026-11-24': { stars: 3, moves: 20 } },
  giftDayIndex: 3,
  lastGiftDate: null,
  ownedThemes: ['classic'],
  activeTheme: 'classic',
  processedTransactions: ['GPA.1'],
  starterPackPurchased: false,
  updatedAt: serverTimestamp(),
  lastWriterInstall: 'install-a',
  ...overrides,
});

const grant = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'purchase',
  transactionId: 'GPA.9',
  productId: 'coins_500',
  coins: 500,
  hints: 0,
  undos: 0,
  extraTubes: 0,
  themeId: null,
  eventId: 'evt',
  eventType: 'NON_RENEWING_PURCHASE',
  environment: 'SANDBOX',
  createdAt: new Date(),
  applied: false,
  appliedAt: null,
  claimedBy: null,
  ...overrides,
});

const alice = (): Firestore => env.authenticatedContext('alice').firestore();
const bob = (): Firestore => env.authenticatedContext('bob').firestore();
const guest = (): Firestore => env.unauthenticatedContext().firestore();

const seed = async (path: string, data: Record<string, unknown>): Promise<void> => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
};

const claim = (installId: unknown = 'install-a') => ({
  applied: true,
  appliedAt: serverTimestamp(),
  claimedBy: installId,
});

beforeAll(async () => {
  // Denied writes are expected here; keep the SDK from logging each one.
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-pourly',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

describe('users/{uid} cloud save', () => {
  it('lets the owner create, update and read a valid save', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), progress()));
    await assertSucceeds(setDoc(doc(alice(), 'users/alice'), progress({ coins: 0, level: 8 })));
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
  });

  it('denies other users and signed-out clients', async () => {
    await seed('users/alice', { coins: 1 });
    await assertFails(getDoc(doc(bob(), 'users/alice')));
    await assertFails(getDoc(doc(guest(), 'users/alice')));
    await assertFails(setDoc(doc(bob(), 'users/alice'), progress()));
    await assertFails(setDoc(doc(guest(), 'users/alice'), progress()));
  });

  it.each([
    ['negative coins', { coins: -1 }],
    ['fractional coins', { coins: 1.5 }],
    ['string hints', { hints: '3' }],
    ['level 0', { level: 0 }],
    ['unknown schema type', { schemaVersion: 'one' }],
    ['entitlements field', { entitlements: { vip: true } }],
    ['client clock updatedAt', { updatedAt: 5 }],
    ['bad date', { lastDailyDate: 'yesterday' }],
    ['long theme id', { activeTheme: 'x'.repeat(33) }],
    ['empty install id', { lastWriterInstall: '' }],
    ['non-boolean starter pack flag', { starterPackPurchased: 'yes' }],
    [
      '201 transaction ids',
      { processedTransactions: Array.from({ length: 201 }, (_, i) => `t${i}`) },
    ],
    ['51 themes', { ownedThemes: Array.from({ length: 51 }, (_, i) => `theme${i}`) }],
    [
      '121 daily results',
      {
        dailyHistory: Object.fromEntries(
          Array.from({ length: 121 }, (_, i) => [`d${i}`, { stars: 1, moves: 1 }]),
        ),
      },
    ],
  ])('rejects %s', async (_name, overrides) => {
    await assertFails(setDoc(doc(alice(), 'users/alice'), progress(overrides)));
  });

  it('rejects a save with a missing field', async () => {
    const { coins: _coins, ...withoutCoins } = progress();
    await assertFails(setDoc(doc(alice(), 'users/alice'), withoutCoins));
  });

  it('accepts the size limits exactly', async () => {
    await assertSucceeds(
      setDoc(
        doc(alice(), 'users/alice'),
        progress({
          processedTransactions: Array.from({ length: 200 }, (_, i) => `t${i}`),
          ownedThemes: Array.from({ length: 50 }, (_, i) => `theme${i}`),
          lastWriterInstall: 'i'.repeat(64),
        }),
      ),
    );
  });

  it('never lets a client delete the save', async () => {
    await seed('users/alice', { coins: 1 });
    await assertFails(deleteDoc(doc(alice(), 'users/alice')));
  });
});

describe('users/{uid}/grants', () => {
  beforeEach(async () => {
    await seed('users/alice/grants/GPA.9', grant());
  });

  it('lets the owner read and query unapplied grants', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/grants/GPA.9')));
    await assertSucceeds(
      getDocs(query(collection(alice(), 'users/alice/grants'), where('applied', '==', false))),
    );
  });

  it('lets the owner query the grants claimed by an install', async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(alice(), 'users/alice/grants'),
          where('claimedBy', '==', 'install-a'),
          orderBy('appliedAt', 'desc'),
          limit(50),
        ),
      ),
    );
  });

  it('hides grants from other users', async () => {
    await assertFails(getDoc(doc(bob(), 'users/alice/grants/GPA.9')));
    await assertFails(getDocs(collection(bob(), 'users/alice/grants')));
  });

  it('lets the owner claim a grant in a transaction', async () => {
    const db = alice();
    await assertSucceeds(
      runTransaction(db, async (transaction) => {
        const ref = doc(db, 'users/alice/grants/GPA.9');
        const snapshot = await transaction.get(ref);
        if (snapshot.get('applied') !== false) throw new Error('already applied');
        transaction.update(ref, claim());
      }),
    );
  });

  it('requires claimedBy to be a 1–64 character string', async () => {
    const ref = doc(alice(), 'users/alice/grants/GPA.9');
    await assertFails(updateDoc(ref, { applied: true, appliedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, claim('')));
    await assertFails(updateDoc(ref, claim('x'.repeat(65))));
    await assertFails(updateDoc(ref, claim(42)));
    await assertSucceeds(updateDoc(ref, claim('x'.repeat(64))));
  });

  it('allows no other change', async () => {
    const ref = doc(alice(), 'users/alice/grants/GPA.9');
    await assertFails(updateDoc(ref, { ...claim(), coins: 99999 }));
    await assertFails(updateDoc(ref, { coins: 99999 }));
    await assertFails(updateDoc(ref, { applied: true, appliedAt: 5, claimedBy: 'install-a' }));
    await assertFails(updateDoc(ref, { ...claim(), applied: false }));
  });

  it('cannot claim a grant twice or re-assign the claim', async () => {
    await seed('users/alice/grants/GPA.8', grant({ applied: true, claimedBy: 'install-a' }));
    const ref = doc(alice(), 'users/alice/grants/GPA.8');
    await assertFails(updateDoc(ref, claim('install-b')));
    await assertFails(updateDoc(ref, { claimedBy: 'install-b' }));
  });

  it('denies other users claiming a grant', async () => {
    await assertFails(updateDoc(doc(bob(), 'users/alice/grants/GPA.9'), claim()));
  });

  it('never lets a client create or delete a grant', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/grants/fake'), grant()));
    await assertFails(deleteDoc(doc(alice(), 'users/alice/grants/GPA.9')));
  });
});

describe('everything else', () => {
  it('is denied', async () => {
    await seed('other/x', { a: 1 });
    await assertFails(getDoc(doc(alice(), 'other/x')));
    await assertFails(setDoc(doc(alice(), 'other/y'), { a: 1 }));
    await assertFails(setDoc(doc(alice(), 'users/alice/secrets/s'), { a: 1 }));
  });
});
