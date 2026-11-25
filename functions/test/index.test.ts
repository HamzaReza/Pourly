import { HttpsError } from 'firebase-functions/v2/https';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as functions from '../src/index.js';

const fake = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  const state = {
    secret: 'Bearer s3cret' as string | undefined,
    failWrites: false,
    deleteUserError: null as unknown,
    deleted: [] as string[],
    deletedUsers: [] as string[],
  };
  const ref = (path: string) => ({
    path,
    collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
  });
  const db = {
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: async <T>(
      update: (transaction: {
        get: (r: { path: string }) => Promise<{ exists: boolean }>;
        create: (r: { path: string }, data: Record<string, unknown>) => void;
      }) => Promise<T>,
    ): Promise<T> => {
      if (state.failWrites) throw new Error('firestore unavailable');
      const writes: [string, Record<string, unknown>][] = [];
      const result = await update({
        get: async (r) => ({ exists: docs.has(r.path) }),
        create: (r, data) => {
          writes.push([r.path, data]);
        },
      });
      for (const [path, data] of writes) docs.set(path, data);
      return result;
    },
    recursiveDelete: async (r: { path: string }) => {
      if (state.failWrites) throw new Error('firestore unavailable');
      state.deleted.push(r.path);
      for (const key of [...docs.keys()]) {
        if (key === r.path || key.startsWith(`${r.path}/`)) docs.delete(key);
      }
    },
  };
  return { docs, state, db };
});

vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn() }));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => fake.db,
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    deleteUser: async (uid: string) => {
      if (fake.state.deleteUserError !== null) throw fake.state.deleteUserError;
      fake.state.deletedUsers.push(uid);
    },
  }),
}));
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({
    name,
    value: () => {
      if (fake.state.secret === undefined) throw new Error('secret not set');
      return fake.state.secret;
    },
  }),
}));
vi.mock('firebase-functions/logger', () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('firebase-functions/v2/https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase-functions/v2/https')>();
  return {
    HttpsError: actual.HttpsError,
    onRequest: (_options: unknown, handler: unknown) => handler,
    onCall: (_options: unknown, handler: unknown) => handler,
  };
});

type Handler = (request: unknown, response: unknown) => Promise<void>;
type Callable = (request: unknown) => Promise<unknown>;
const webhook = functions.revenuecatWebhook as unknown as Handler;
const deleteMyAccount = functions.deleteMyAccount as unknown as Callable;

interface FakeResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  status: (code: number) => FakeResponse;
  send: (body: unknown) => FakeResponse;
  json: (body: unknown) => FakeResponse;
  set: (name: string, value: string) => FakeResponse;
}

const response = (): FakeResponse => {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    headers: {},
    status: (code) => {
      res.statusCode = code;
      return res;
    },
    send: (value) => {
      res.body = value;
      return res;
    },
    json: (value) => {
      res.body = value;
      return res;
    },
    set: (name, value) => {
      res.headers[name] = value;
      return res;
    },
  };
  return res;
};

const UID = 'AbCdEf1234567890abcdef123456';

const post = async (
  event: Record<string, unknown>,
  {
    method = 'POST',
    authorization = 'Bearer s3cret',
  }: { method?: string; authorization?: string } = {},
): Promise<FakeResponse> => {
  const res = response();
  await webhook(
    {
      method,
      body: { api_version: '1.0', event: { id: 'evt', app_user_id: UID, ...event } },
      get: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined),
    },
    res,
  );
  return res;
};

const coinsPurchase = {
  type: 'NON_RENEWING_PURCHASE',
  product_id: 'coins_500',
  transaction_id: 'GPA.1',
};

beforeEach(() => {
  fake.docs.clear();
  fake.state.secret = 'Bearer s3cret';
  fake.state.failWrites = false;
  fake.state.deleteUserError = null;
  fake.state.deleted = [];
  fake.state.deletedUsers = [];
});

describe('revenuecatWebhook', () => {
  it('writes an unapplied grant for a consumable purchase', async () => {
    const res = await post(coinsPurchase);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, granted: true });
    expect(fake.docs.get(`users/${UID}/grants/GPA.1`)).toMatchObject({
      type: 'purchase',
      transactionId: 'GPA.1',
      productId: 'coins_500',
      coins: 500,
      applied: false,
      appliedAt: null,
      claimedBy: null,
      createdAt: 'SERVER_TIMESTAMP',
    });
  });

  it('is idempotent when RevenueCat retries', async () => {
    await post(coinsPurchase);
    fake.docs.set(`users/${UID}/grants/GPA.1`, { applied: true, claimedBy: 'install-a' });
    const res = await post(coinsPurchase);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, granted: false });
    expect(fake.docs.get(`users/${UID}/grants/GPA.1`)).toEqual({
      applied: true,
      claimedBy: 'install-a',
    });
  });

  it('writes a separate negative grant for a refund', async () => {
    await post(coinsPurchase);
    const res = await post({
      type: 'CANCELLATION',
      cancel_reason: 'CUSTOMER_SUPPORT',
      product_id: 'coins_500',
      transaction_id: 'GPA.1',
    });
    expect(res.statusCode).toBe(200);
    expect(fake.docs.get(`users/${UID}/grants/GPA.1_refund`)).toMatchObject({
      type: 'refund',
      coins: -500,
    });
    expect(fake.docs.get(`users/${UID}/grants/GPA.1`)).toMatchObject({ coins: 500 });
  });

  it('acknowledges anonymous users and transfers without writing', async () => {
    expect((await post({ ...coinsPurchase, app_user_id: '$RCAnonymousID:x' })).body).toEqual({
      ok: true,
      granted: false,
      reason: 'anonymousUser',
    });
    expect((await post({ type: 'TRANSFER' })).statusCode).toBe(200);
    expect(fake.docs.size).toBe(0);
  });

  it('rejects a wrong or missing Authorization header', async () => {
    expect((await post(coinsPurchase, { authorization: 'Bearer nope' })).statusCode).toBe(401);
    expect((await post(coinsPurchase, { authorization: '' })).statusCode).toBe(401);
    expect(fake.docs.size).toBe(0);
  });

  it('answers 500 without a configured secret', async () => {
    fake.state.secret = undefined;
    expect((await post(coinsPurchase)).statusCode).toBe(500);
    fake.state.secret = '  ';
    expect((await post(coinsPurchase, { authorization: '  ' })).statusCode).toBe(500);
    expect(fake.docs.size).toBe(0);
  });

  it('accepts POST only', async () => {
    const res = await post(coinsPurchase, { method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('answers 400 for a body without an event', async () => {
    const res = response();
    await webhook({ method: 'POST', body: {}, get: () => 'Bearer s3cret' }, res);
    expect(res.statusCode).toBe(400);
  });

  it('answers 500 on a Firestore error so RevenueCat retries', async () => {
    fake.state.failWrites = true;
    expect((await post(coinsPurchase)).statusCode).toBe(500);
  });
});

describe('deleteMyAccount', () => {
  it('requires a signed-in caller', async () => {
    await expect(deleteMyAccount({ data: { uid: UID } })).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(deleteMyAccount({ data: {} })).rejects.toBeInstanceOf(HttpsError);
    expect(fake.state.deleted).toEqual([]);
  });

  it('deletes only the caller’s data and Auth user, ignoring any parameters', async () => {
    fake.docs.set(`users/${UID}`, { coins: 1 });
    fake.docs.set(`users/${UID}/grants/GPA.1`, { coins: 500 });
    fake.docs.set('users/other', { coins: 2 });
    const result = await deleteMyAccount({ auth: { uid: UID }, data: { uid: 'other' } });
    expect(result).toEqual({ deleted: true });
    expect(fake.state.deleted).toEqual([`users/${UID}`]);
    expect(fake.state.deletedUsers).toEqual([UID]);
    expect([...fake.docs.keys()]).toEqual(['users/other']);
  });

  it('succeeds again when the Auth user is already gone', async () => {
    fake.state.deleteUserError = Object.assign(new Error('gone'), { code: 'auth/user-not-found' });
    await expect(deleteMyAccount({ auth: { uid: UID } })).resolves.toEqual({ deleted: true });
  });

  it('reports other failures as internal errors', async () => {
    fake.state.deleteUserError = Object.assign(new Error('boom'), { code: 'auth/internal-error' });
    await expect(deleteMyAccount({ auth: { uid: UID } })).rejects.toMatchObject({
      code: 'internal',
    });
    fake.state.deleteUserError = null;
    fake.state.failWrites = true;
    await expect(deleteMyAccount({ auth: { uid: UID } })).rejects.toMatchObject({
      code: 'internal',
    });
  });
});
