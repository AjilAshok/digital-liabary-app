import type { RequestHandler } from 'express';
import { Errors } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence-in-depth for cookie sessions (the cookie is already SameSite=Strict).
 * For state-changing requests that carry an Origin header, the origin must be the API's own
 * host or an explicitly allowed origin.
 */
export function originCheck(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.header('origin');
    if (!origin) return next();
    if (allowed.has(origin)) return next();
    try {
      const originHost = new URL(origin).host;
      if (originHost === req.header('host')) return next();
    } catch {
      // fall through
    }
    next(Errors.forbidden('Cross-origin request rejected'));
  };
}
