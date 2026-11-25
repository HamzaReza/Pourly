import { describe, expect, it } from 'vitest';

import { authorizationMatches } from '../src/webhookAuth.js';

describe('authorizationMatches', () => {
  it('accepts exactly the configured header value', () => {
    expect(authorizationMatches('Bearer s3cret', 'Bearer s3cret')).toBe(true);
  });

  it('rejects any other value, including prefixes and different lengths', () => {
    expect(authorizationMatches('Bearer wrong', 'Bearer s3cret')).toBe(false);
    expect(authorizationMatches('Bearer s3cre', 'Bearer s3cret')).toBe(false);
    expect(authorizationMatches('Bearer s3cret ', 'Bearer s3cret')).toBe(false);
    expect(authorizationMatches('s3cret', 'Bearer s3cret')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(authorizationMatches(undefined, 'Bearer s3cret')).toBe(false);
    expect(authorizationMatches('', 'Bearer s3cret')).toBe(false);
  });

  it('never authorizes when the secret is missing or blank', () => {
    expect(authorizationMatches('anything', undefined)).toBe(false);
    expect(authorizationMatches('', '')).toBe(false);
    expect(authorizationMatches('   ', '   ')).toBe(false);
  });
});
