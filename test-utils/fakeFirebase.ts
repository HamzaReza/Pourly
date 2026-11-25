/**
 * In-memory fakes for the Firebase JS SDK surface the app uses (Firestore documents, queries,
 * snapshots and transactions; Auth; callable Functions), injected with `setFirebaseLoader` or
 * passed straight to the cloud-save and grants services. Only what the app calls is modelled.
 */
import type { FirebaseModules, FirebaseServices } from '@/services/firebase';

export type FakeDoc = Record<string, unknown>;

interface Ref {
  readonly path: string;
}

type Constraint =
  | { readonly kind: 'where'; readonly field: string; readonly value: unknown }
  | { readonly kind: 'orderBy'; readonly field: string; readonly direction: 'asc' | 'desc' }
  | { readonly kind: 'limit'; readonly count: number };

interface FakeQuery {
  readonly collection: Ref;
  readonly constraints: readonly Constraint[];
}

/** Stand-in for `serverTimestamp()`; becomes an increasing number when a write commits. */
const SERVER_TIMESTAMP = Object.freeze({ fakeServerTimestamp: true });

const clone = (value: FakeDoc): FakeDoc => JSON.parse(JSON.stringify(value)) as FakeDoc;

export interface FakeFirestore {
  /** Every document by path (`users/u1`, `users/u1/grants/GPA.1`). */
  readonly docs: Map<string, FakeDoc>;
  /** The `firebase/firestore` functions the app calls. */
  readonly module: Record<string, unknown>;
  /** Re-delivers every listener's snapshot (as the SDK does after a server change). */
  notify: () => void;
  /** Makes the next `count` transactions reject (offline). */
  failTransactions: (count?: number) => void;
  /** Makes the next `count` `getDocs` calls reject. */
  failQueries: (count?: number) => void;
  readonly transactionCount: () => number;
  readonly listenerCount: () => number;
}

export const createFakeFirestore = (): FakeFirestore => {
  const docs = new Map<string, FakeDoc>();
  const listeners = new Set<() => void>();
  let failingTransactions = 0;
  let failingQueries = 0;
  let transactions = 0;
  let clock = 1_000;

  const resolveTimestamps = (data: FakeDoc): FakeDoc => {
    const out: FakeDoc = {};
    for (const [key, value] of Object.entries(data)) {
      out[key] = value === SERVER_TIMESTAMP ? (clock += 1) : value;
    }
    return out;
  };

  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };

  const run = (q: FakeQuery): { id: string; data: FakeDoc }[] => {
    const depth = q.collection.path.split('/').length + 1;
    let rows = [...docs.entries()]
      .filter(([path]) => path.startsWith(`${q.collection.path}/`))
      .filter(([path]) => path.split('/').length === depth)
      .map(([path, data]) => ({ id: path.split('/').at(-1) ?? '', data }));
    for (const constraint of q.constraints) {
      if (constraint.kind === 'where') {
        rows = rows.filter((row) => row.data[constraint.field] === constraint.value);
      } else if (constraint.kind === 'orderBy') {
        const sign = constraint.direction === 'desc' ? -1 : 1;
        rows.sort(
          (a, b) =>
            sign * (Number(a.data[constraint.field] ?? 0) - Number(b.data[constraint.field] ?? 0)),
        );
      } else {
        rows = rows.slice(0, constraint.count);
      }
    }
    return rows;
  };

  const querySnapshot = (q: FakeQuery) => ({
    docs: run(q).map((row) => ({ id: row.id, data: () => clone(row.data) })),
  });

  const module = {
    serverTimestamp: () => SERVER_TIMESTAMP,
    doc: (_db: unknown, ...parts: string[]): Ref => ({ path: parts.join('/') }),
    collection: (_db: unknown, ...parts: string[]): Ref => ({ path: parts.join('/') }),
    where: (field: string, _op: '==', value: unknown): Constraint => ({
      kind: 'where',
      field,
      value,
    }),
    orderBy: (field: string, direction: 'asc' | 'desc' = 'asc'): Constraint => ({
      kind: 'orderBy',
      field,
      direction,
    }),
    limit: (count: number): Constraint => ({ kind: 'limit', count }),
    query: (collection: Ref, ...constraints: Constraint[]): FakeQuery => ({
      collection,
      constraints,
    }),
    getDocs: async (q: FakeQuery) => {
      if (failingQueries > 0) {
        failingQueries -= 1;
        throw Object.assign(new Error('offline'), { code: 'unavailable' });
      }
      return querySnapshot(q);
    },
    onSnapshot: (q: FakeQuery, next: (snapshot: ReturnType<typeof querySnapshot>) => void) => {
      const fire = (): void => next(querySnapshot(q));
      listeners.add(fire);
      fire();
      return () => {
        listeners.delete(fire);
      };
    },
    runTransaction: async <T>(_db: unknown, update: (transaction: unknown) => Promise<T>) => {
      transactions += 1;
      if (failingTransactions > 0) {
        failingTransactions -= 1;
        throw Object.assign(new Error('offline'), { code: 'unavailable' });
      }
      const writes: { path: string; data: FakeDoc; merge: boolean }[] = [];
      const transaction = {
        get: async (ref: Ref) => {
          const data = docs.get(ref.path);
          return {
            exists: () => data !== undefined,
            data: () => (data === undefined ? undefined : clone(data)),
            get: (field: string) => data?.[field],
          };
        },
        set: (ref: Ref, data: FakeDoc) => {
          writes.push({ path: ref.path, data, merge: false });
        },
        update: (ref: Ref, data: FakeDoc) => {
          writes.push({ path: ref.path, data, merge: true });
        },
      };
      const result = await update(transaction);
      for (const write of writes) {
        const data = resolveTimestamps(write.data);
        docs.set(write.path, write.merge ? { ...docs.get(write.path), ...data } : clone(data));
      }
      if (writes.length > 0) notify();
      return result;
    },
    initializeFirestore: () => ({ fake: 'db' }),
    getFirestore: () => ({ fake: 'db' }),
  };

  return {
    docs,
    module,
    notify,
    failTransactions: (count = 1) => {
      failingTransactions = count;
    },
    failQueries: (count = 1) => {
      failingQueries = count;
    },
    transactionCount: () => transactions,
    listenerCount: () => listeners.size,
  };
};

export interface FakeUser {
  readonly uid: string;
  readonly email: string | null;
  readonly displayName: string | null;
}

export const fakeUser = (uid = 'uid-1', email: string | null = 'player@example.com'): FakeUser => ({
  uid,
  email,
  displayName: 'Player',
});

export interface FakeFirebase {
  readonly firestore: FakeFirestore;
  readonly modules: FirebaseModules;
  readonly auth: {
    currentUser: FakeUser | null;
    readonly initializeAuth: jest.Mock;
    readonly getReactNativePersistence: jest.Mock;
    readonly signInWithCredential: jest.Mock;
    readonly reauthenticateWithCredential: jest.Mock;
    readonly signOut: jest.Mock;
    /** Signs a user in or out as Firebase Auth would (calls the state listener). */
    setUser: (user: FakeUser | null) => void;
  };
  /** The callable behind `httpsCallable(functions, 'deleteMyAccount')`. */
  readonly deleteMyAccount: jest.Mock;
  readonly httpsCallable: jest.Mock;
}

/** A complete fake SDK for `setFirebaseLoader`. */
export const createFakeFirebase = (): FakeFirebase => {
  const firestore = createFakeFirestore();
  const authListeners = new Set<(user: FakeUser | null) => void>();
  const authInstance: { currentUser: FakeUser | null } = { currentUser: null };
  const setUser = (user: FakeUser | null): void => {
    authInstance.currentUser = user;
    for (const listener of [...authListeners]) listener(user);
  };
  const auth = {
    get currentUser() {
      return authInstance.currentUser;
    },
    set currentUser(user: FakeUser | null) {
      authInstance.currentUser = user;
    },
    initializeAuth: jest.fn(() => authInstance),
    getReactNativePersistence: jest.fn(() => ({ type: 'LOCAL' })),
    signInWithCredential: jest.fn(async (_auth: unknown, credential: { idToken: string }) => {
      const user = fakeUser(`uid-for-${credential.idToken}`);
      setUser(user);
      return { user };
    }),
    reauthenticateWithCredential: jest.fn(async (user: FakeUser) => ({ user })),
    signOut: jest.fn(async () => {
      setUser(null);
    }),
    setUser,
  };
  const deleteMyAccount = jest.fn(async () => ({ data: { deleted: true } }));
  const httpsCallable = jest.fn(() => deleteMyAccount);
  const modules = {
    app: {
      getApps: () => [],
      initializeApp: jest.fn(() => ({ name: '[DEFAULT]' })),
    },
    auth: {
      initializeAuth: auth.initializeAuth,
      getAuth: () => authInstance,
      getReactNativePersistence: auth.getReactNativePersistence,
      onAuthStateChanged: (_auth: unknown, next: (user: FakeUser | null) => void) => {
        authListeners.add(next);
        queueMicrotask(() => next(authInstance.currentUser));
        return () => {
          authListeners.delete(next);
        };
      },
      signInWithCredential: auth.signInWithCredential,
      reauthenticateWithCredential: auth.reauthenticateWithCredential,
      signOut: auth.signOut,
      GoogleAuthProvider: { credential: (idToken: string) => ({ idToken }) },
    },
    firestore: firestore.module,
    functions: {
      getFunctions: jest.fn(() => ({ region: 'us-central1' })),
      httpsCallable,
    },
    storage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
  } as unknown as FirebaseModules;
  return { firestore, modules, auth, deleteMyAccount, httpsCallable };
};

/** Services built on a fake Firestore, for calling the cloud-save and grants services directly. */
export const fakeServices = (firestore: FakeFirestore): FirebaseServices =>
  ({
    app: {},
    auth: {},
    db: { fake: 'db' },
    functions: {},
    sdk: { firestore: firestore.module },
  }) as unknown as FirebaseServices;

/** Lets pending promise chains settle (fake Firestore calls resolve in microtasks). */
export const settle = async (rounds = 20): Promise<void> => {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
};
