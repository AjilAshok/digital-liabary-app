import type { Request, RequestHandler } from 'express';
import { getEnv } from '../config/env.js';
import { Errors } from '../lib/errors.js';
import { verifySessionToken } from '../lib/jwt.js';
import { loadAuthContext } from '../modules/auth/auth.service.js';

function extractToken(req: Request): string | undefined {
  const env = getEnv();
  // Sessions travel only in the HttpOnly cookie; tokens are never exposed to JavaScript.
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const cookieToken = cookies?.[env.AUTH_COOKIE_NAME];
  return typeof cookieToken === 'string' && cookieToken.length > 0 ? cookieToken : undefined;
}

/**
 * Requires a valid session. Every request re-loads the user so that deactivation,
 * role changes and token revocation (tokenVersion) take effect immediately.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next(Errors.unauthenticated());

  const env = getEnv();
  const claims = verifySessionToken(token, { secret: env.JWT_SECRET, issuer: env.JWT_ISSUER });
  if (!claims) return next(Errors.unauthenticated('Session is invalid or has expired'));

  const auth = await loadAuthContext(claims.sub, claims.ver);
  if (!auth) return next(Errors.unauthenticated('Session is invalid or has expired'));

  req.auth = auth;
  next();
};

/** Like `authenticate`, but continues anonymously when there is no valid session. */
export const optionalAuthenticate: RequestHandler = async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  const env = getEnv();
  const claims = verifySessionToken(token, { secret: env.JWT_SECRET, issuer: env.JWT_ISSUER });
  if (claims) {
    const auth = await loadAuthContext(claims.sub, claims.ver);
    if (auth) req.auth = auth;
  }
  next();
};
