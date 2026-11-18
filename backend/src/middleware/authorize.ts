import type { RequestHandler } from 'express';
import { Errors } from '../lib/errors.js';
import { authenticate } from './authenticate.js';
import type { PermissionCode, RoleCode } from '../security/permissions.js';

/**
 * Requires ALL listed permissions. Must run after `authenticate`.
 * There is deliberately no role-name bypass: admins pass because their role holds every permission.
 */
export function requirePermissions(...required: PermissionCode[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(Errors.unauthenticated());
    const missing = required.filter((p) => !req.auth!.permissions.has(p));
    if (missing.length > 0) return next(Errors.forbidden());
    next();
  };
}

/**
 * Requires the user to hold AT LEAST ONE of the listed roles.
 * Prefer `requirePermissions` for feature access (roles are configurable bundles of permissions).
 * Use this only for actions that are inherently tied to a role, e.g. administration-only consoles.
 */
export function requireRole(...anyOf: RoleCode[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(Errors.unauthenticated());
    if (!anyOf.some((r) => req.auth!.roles.includes(r))) return next(Errors.forbidden());
    next();
  };
}

/** Requires AT LEAST ONE of the listed permissions. */
export function requireAnyPermission(...anyOf: PermissionCode[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(Errors.unauthenticated());
    if (!anyOf.some((p) => req.auth!.permissions.has(p))) return next(Errors.forbidden());
    next();
  };
}

/**
 * `authenticate` + `requirePermissions` as one middleware, for routers mounted on a shared prefix
 * where a router-wide `use(authenticate)` would intercept unrelated routes.
 */
export function authorized(...required: PermissionCode[]): RequestHandler {
  const check = requirePermissions(...required);
  return (req, res, next) =>
    Promise.resolve(
      authenticate(req, res, (err?: unknown) => (err ? next(err) : check(req, res, next))),
    ).catch(next);
}
