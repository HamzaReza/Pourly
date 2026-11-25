import {
  classifyGoogleError,
  requestGoogleIdToken,
  setGoogleSignInLoader,
  signOutOfGoogle,
} from '@/services/googleSignIn';
import { logger } from '@/utils/logger';

import {
  createFakeGoogleSignIn,
  GOOGLE_STATUS,
  googleError,
  type FakeGoogleSignIn,
} from '../test-utils/fakeAccounts';

const CODES = {
  playServices: GOOGLE_STATUS.PLAY_SERVICES_NOT_AVAILABLE,
  inProgress: GOOGLE_STATUS.IN_PROGRESS,
};

let google: FakeGoogleSignIn;

beforeEach(() => {
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  google = createFakeGoogleSignIn('id-token-1');
  setGoogleSignInLoader(() => Promise.resolve(google.module));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('classifyGoogleError', () => {
  it('maps the module codes to failure reasons', () => {
    expect(classifyGoogleError(googleError(CODES.playServices), CODES)).toBe('playServices');
    expect(classifyGoogleError(googleError(CODES.inProgress), CODES)).toBe('inProgress');
    expect(classifyGoogleError(googleError('7'), CODES)).toBe('network');
    expect(classifyGoogleError(googleError('10'), CODES)).toBe('unknown');
    expect(classifyGoogleError(new Error('plain'), CODES)).toBe('unknown');
    expect(classifyGoogleError(null, CODES)).toBe('unknown');
  });
});

describe('requestGoogleIdToken', () => {
  it('checks Play services, opens the picker and returns the ID token', async () => {
    expect(await requestGoogleIdToken()).toEqual({ kind: 'success', idToken: 'id-token-1' });
    expect(google.api.hasPlayServices).toHaveBeenCalledWith({ showPlayServicesUpdateDialog: true });
    expect(google.api.configure).toHaveBeenCalledTimes(1);
  });

  it('configures the module once', async () => {
    await requestGoogleIdToken();
    await requestGoogleIdToken();
    expect(google.api.configure).toHaveBeenCalledTimes(1);
  });

  it('reports a cancelled picker', async () => {
    google.cancelNext();
    expect(await requestGoogleIdToken()).toEqual({ kind: 'cancelled' });
  });

  it('fails without Play services, before opening the picker', async () => {
    google.api.hasPlayServices.mockRejectedValueOnce(googleError(CODES.playServices));
    expect(await requestGoogleIdToken()).toEqual({ kind: 'failed', reason: 'playServices' });
    expect(google.api.signIn).not.toHaveBeenCalled();
  });

  it('fails on a rejected picker or a missing token', async () => {
    google.api.signIn.mockRejectedValueOnce(googleError('7'));
    expect(await requestGoogleIdToken()).toEqual({ kind: 'failed', reason: 'network' });
    google.nextToken(null);
    expect(await requestGoogleIdToken()).toEqual({ kind: 'failed', reason: 'unknown' });
  });

  it('is unavailable when the native module is missing (Expo Go, Jest)', async () => {
    setGoogleSignInLoader(() => Promise.resolve(null));
    expect(await requestGoogleIdToken()).toEqual({ kind: 'failed', reason: 'unavailable' });
  });

  it('is unavailable when the module fails to load', async () => {
    setGoogleSignInLoader(() => Promise.reject(new Error('no module')));
    expect(await requestGoogleIdToken()).toEqual({ kind: 'failed', reason: 'unavailable' });
  });
});

describe('signOutOfGoogle', () => {
  it('signs out, revoking access only when asked', async () => {
    await signOutOfGoogle(false);
    expect(google.api.signOut).toHaveBeenCalledTimes(1);
    expect(google.api.revokeAccess).not.toHaveBeenCalled();
    await signOutOfGoogle(true);
    expect(google.api.revokeAccess).toHaveBeenCalledTimes(1);
  });

  it('never throws', async () => {
    google.api.signOut.mockRejectedValueOnce(new Error('offline'));
    await expect(signOutOfGoogle(false)).resolves.toBeUndefined();
  });
});
