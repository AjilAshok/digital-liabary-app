import type { CookieOptions, Request, Response } from 'express';
import { getEnv } from '../../config/env.js';
import { auditContext } from '../../lib/request-context.js';
import { recordAudit } from '../audit/audit.service.js';
import type { PaginationQuery } from '../../lib/pagination.js';
import type { LoginInput } from './auth.schemas.js';
import * as authService from './auth.service.js';
import type { ChangePasswordInput, UpdateProfileInput } from './profile.schemas.js';
import * as profileService from './profile.service.js';

export function sessionCookieOptions(): CookieOptions {
  const env = getEnv();
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api',
    maxAge: env.JWT_EXPIRES_IN_MINUTES * 60_000,
  };
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput, auditContext(req));
  res.cookie(getEnv().AUTH_COOKIE_NAME, result.token, sessionCookieOptions());
  res.json({ user: result.user });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions();
  res.clearCookie(getEnv().AUTH_COOKIE_NAME, clearOptions);
  if (req.auth) {
    await recordAudit(
      { action: 'auth.logout', entityType: 'User', entityId: req.auth.userId },
      auditContext(req),
    );
  }
  res.status(204).end();
}

export async function logoutAll(req: Request, res: Response): Promise<void> {
  await authService.revokeAllSessions(req.auth!.userId, auditContext(req));
  const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions();
  res.clearCookie(getEnv().AUTH_COOKIE_NAME, clearOptions);
  res.status(204).end();
}

export async function me(req: Request, res: Response): Promise<void> {
  res.json({ user: await authService.getCurrentUser(req.auth!.userId) });
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const user = await profileService.updateProfile(
    req.auth!.userId,
    req.body as UpdateProfileInput,
    auditContext(req),
  );
  res.json({ user });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const { token } = await profileService.changePassword(
    req.auth!.userId,
    req.body as ChangePasswordInput,
    auditContext(req),
  );
  // Other sessions are revoked; keep this one signed in with a fresh token.
  res.cookie(getEnv().AUTH_COOKIE_NAME, token, sessionCookieOptions());
  res.status(204).end();
}

export async function myActivity(req: Request, res: Response): Promise<void> {
  res.json(
    await profileService.listMyActivity(req.auth!.userId, res.locals['query'] as PaginationQuery),
  );
}
