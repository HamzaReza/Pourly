/**
 * Fakes for the account SDKs: `@react-native-google-signin/google-signin` (injected with
 * `setGoogleSignInLoader`) and the RevenueCat identity calls (`setPurchasesIdentityLoader`).
 */
type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');
type PurchasesModule = typeof import('react-native-purchases');

/** Status codes as the Android module reports them. */
export const GOOGLE_STATUS = {
  SIGN_IN_CANCELLED: '12501',
  IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  SIGN_IN_REQUIRED: '4',
  NULL_PRESENTER: 'NULL_PRESENTER',
} as const;

export const googleError = (code: string): Error & { code: string } =>
  Object.assign(new Error(`google ${code}`), { code });

export interface FakeGoogleSignIn {
  readonly module: GoogleSignInModule;
  readonly api: {
    readonly configure: jest.Mock;
    readonly hasPlayServices: jest.Mock;
    readonly signIn: jest.Mock;
    readonly signOut: jest.Mock;
    readonly revokeAccess: jest.Mock;
  };
  /** The next `signIn()` resolves with this ID token (null = a response without one). */
  nextToken: (idToken: string | null) => void;
  /** The next `signIn()` resolves `{ type: 'cancelled' }`. */
  cancelNext: () => void;
}

export const createFakeGoogleSignIn = (idToken = 'google-token'): FakeGoogleSignIn => {
  let token: string | null = idToken;
  const success = (value: string | null) => ({
    type: 'success',
    data: {
      idToken: value,
      serverAuthCode: null,
      scopes: [],
      user: {
        id: 'g1',
        name: 'Player',
        email: 'player@example.com',
        photo: null,
        familyName: null,
        givenName: null,
      },
    },
  });
  const api = {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn((): Promise<unknown> => Promise.resolve(success(token))),
    signOut: jest.fn(() => Promise.resolve(null)),
    revokeAccess: jest.fn(() => Promise.resolve(null)),
  };
  const module = {
    GoogleSignin: api,
    statusCodes: GOOGLE_STATUS,
    isSuccessResponse: (response: { type: string }) => response.type === 'success',
  } as unknown as GoogleSignInModule;
  return {
    module,
    api,
    nextToken: (value) => {
      token = value;
    },
    cancelNext: () => {
      api.signIn.mockImplementationOnce(() => Promise.resolve({ type: 'cancelled', data: null }));
    },
  };
};

export interface FakeRevenueCatIdentity {
  readonly module: PurchasesModule;
  readonly api: {
    readonly logIn: jest.Mock;
    readonly logOut: jest.Mock;
    readonly isAnonymous: jest.Mock;
  };
}

/** RevenueCat's static identity API; `isAnonymous` follows `logIn` / `logOut`. */
export const createFakeRevenueCatIdentity = (): FakeRevenueCatIdentity => {
  let anonymous = true;
  const api = {
    logIn: jest.fn((appUserId: string) => {
      anonymous = false;
      return Promise.resolve({ customerInfo: { appUserId }, created: false });
    }),
    logOut: jest.fn(() => {
      anonymous = true;
      return Promise.resolve({});
    }),
    isAnonymous: jest.fn(() => Promise.resolve(anonymous)),
  };
  return { module: { default: api } as unknown as PurchasesModule, api };
};
