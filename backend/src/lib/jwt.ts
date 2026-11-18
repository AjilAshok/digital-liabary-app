import jwt from 'jsonwebtoken';

export const JWT_AUDIENCE = 'digital-library-api';

export interface SessionClaims {
  /** User id. */
  sub: string;
  /** User.tokenVersion at issue time; a mismatch revokes the token. */
  ver: number;
}

export interface JwtOptions {
  secret: string;
  issuer: string;
  expiresInMinutes: number;
}

export function signSessionToken(claims: SessionClaims, opts: JwtOptions): string {
  return jwt.sign({ ver: claims.ver }, opts.secret, {
    algorithm: 'HS256',
    subject: claims.sub,
    issuer: opts.issuer,
    audience: JWT_AUDIENCE,
    expiresIn: opts.expiresInMinutes * 60,
  });
}

/** Returns the claims, or null for any invalid/expired/tampered token. */
export function verifySessionToken(
  token: string,
  opts: Pick<JwtOptions, 'secret' | 'issuer'>,
): SessionClaims | null {
  try {
    const payload = jwt.verify(token, opts.secret, {
      algorithms: ['HS256'],
      issuer: opts.issuer,
      audience: JWT_AUDIENCE,
    });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') return null;
    if (typeof payload['ver'] !== 'number') return null;
    return { sub: payload.sub, ver: payload['ver'] };
  } catch {
    return null;
  }
}
