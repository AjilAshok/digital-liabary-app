import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { JWT_AUDIENCE, signSessionToken, verifySessionToken } from '../../src/lib/jwt.js';

const opts = { secret: 's'.repeat(40), issuer: 'test-issuer', expiresInMinutes: 5 };

describe('session tokens', () => {
  it('round-trips subject and token version', () => {
    const token = signSessionToken({ sub: 'user-1', ver: 3 }, opts);
    expect(verifySessionToken(token, opts)).toEqual({ sub: 'user-1', ver: 3 });
  });

  it('rejects a token signed with another secret', () => {
    const token = signSessionToken({ sub: 'user-1', ver: 0 }, { ...opts, secret: 'o'.repeat(40) });
    expect(verifySessionToken(token, opts)).toBeNull();
  });

  it('rejects a token from another issuer', () => {
    const token = signSessionToken({ sub: 'user-1', ver: 0 }, { ...opts, issuer: 'other' });
    expect(verifySessionToken(token, opts)).toBeNull();
  });

  it('rejects an expired token', () => {
    const token = jwt.sign({ ver: 0 }, opts.secret, {
      subject: 'user-1',
      issuer: opts.issuer,
      audience: JWT_AUDIENCE,
      expiresIn: -10,
    });
    expect(verifySessionToken(token, opts)).toBeNull();
  });

  it('rejects the "none" algorithm', () => {
    const unsigned = jwt.sign({ ver: 0, sub: 'user-1', iss: opts.issuer, aud: JWT_AUDIENCE }, '', {
      algorithm: 'none',
    });
    expect(verifySessionToken(unsigned, opts)).toBeNull();
  });

  it('rejects a token without a numeric version claim', () => {
    const token = jwt.sign({}, opts.secret, {
      subject: 'user-1',
      issuer: opts.issuer,
      audience: JWT_AUDIENCE,
    });
    expect(verifySessionToken(token, opts)).toBeNull();
  });

  it('rejects garbage', () => {
    expect(verifySessionToken('not-a-jwt', opts)).toBeNull();
  });
});
