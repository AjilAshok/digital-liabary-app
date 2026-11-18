import { getEnv } from '../../config/env.js';
import { getPrisma } from '../../db/prisma.js';
import { Errors } from '../../lib/errors.js';
import { signSessionToken } from '../../lib/jwt.js';
import { verifyAgainstDummy, verifyPassword } from '../../lib/password.js';
import { recordAudit, recordAuditSafe, type AuditRequestContext } from '../audit/audit.service.js';
import { normalizeEmail, type LoginInput } from './auth.schemas.js';
import type { AuthContext, AuthUserDto } from './auth.types.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const userWithAccess = {
  roles: {
    include: {
      role: { include: { permissions: { include: { permission: { select: { code: true } } } } } },
    },
  },
} as const;

interface UserAccessShape {
  roles: { role: { code: string; permissions: { permission: { code: string } }[] } }[];
}

function flattenAccess(user: UserAccessShape): { roles: string[]; permissions: string[] } {
  const roles = user.roles.map((ur) => ur.role.code).sort();
  const permissions = new Set<string>();
  for (const ur of user.roles) {
    for (const rp of ur.role.permissions) permissions.add(rp.permission.code);
  }
  return { roles, permissions: [...permissions].sort() };
}

export interface LoginResult {
  token: string;
  user: AuthUserDto;
}

export async function login(input: LoginInput, ctx: AuditRequestContext): Promise<LoginResult> {
  const env = getEnv();
  const prisma = getPrisma();
  const email = normalizeEmail(input.email);
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { email }, include: userWithAccess });

  if (!user || !user.isActive) {
    await verifyAgainstDummy(input.password);
    await recordAuditSafe(
      {
        action: 'auth.login_failed',
        entityType: 'User',
        entityId: user?.id ?? null,
        metadata: { email, reason: user ? 'inactive' : 'unknown_email' },
      },
      ctx,
    );
    throw Errors.invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil > now) {
    await recordAuditSafe(
      {
        action: 'auth.login_blocked',
        entityType: 'User',
        entityId: user.id,
        metadata: { lockedUntil: user.lockedUntil.toISOString() },
      },
      { ...ctx, userId: user.id },
    );
    throw Errors.accountLocked();
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    // Atomic increment so concurrent failures are all counted.
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    const lockNow = updated.failedLoginCount >= env.AUTH_MAX_FAILED_LOGINS;
    if (lockNow) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: new Date(now.getTime() + env.AUTH_LOCKOUT_MINUTES * 60_000),
        },
      });
    }
    await recordAuditSafe(
      {
        action: lockNow ? 'auth.account_locked' : 'auth.login_failed',
        entityType: 'User',
        entityId: user.id,
        metadata: { reason: 'bad_password', failedCount: updated.failedLoginCount },
      },
      { ...ctx, userId: user.id },
    );
    throw Errors.invalidCredentials();
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    await recordAudit(
      { action: 'auth.login', entityType: 'User', entityId: user.id },
      { ...ctx, userId: user.id },
      tx,
    );
    return u;
  });

  const token = signSessionToken(
    { sub: user.id, ver: updatedUser.tokenVersion },
    {
      secret: env.JWT_SECRET,
      issuer: env.JWT_ISSUER,
      expiresInMinutes: env.JWT_EXPIRES_IN_MINUTES,
    },
  );

  const access = flattenAccess(user);
  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: access.roles,
      permissions: access.permissions,
      lastLoginAt: updatedUser.lastLoginAt?.toISOString() ?? null,
    },
  };
}

/** Loads the current access context for a session token; null when the session must be rejected. */
export async function loadAuthContext(
  userId: string,
  tokenVersion: number,
): Promise<AuthContext | null> {
  if (!UUID_RE.test(userId)) return null;
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    include: userWithAccess,
  });
  if (!user || !user.isActive || user.tokenVersion !== tokenVersion) return null;
  const access = flattenAccess(user);
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: access.roles,
    permissions: new Set(access.permissions),
  };
}

export async function getCurrentUser(userId: string): Promise<AuthUserDto> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    include: userWithAccess,
  });
  if (!user) throw Errors.unauthenticated();
  const access = flattenAccess(user);
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    roles: access.roles,
    permissions: access.permissions,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

/** Revokes every session of the user by bumping tokenVersion. */
export async function revokeAllSessions(userId: string, ctx: AuditRequestContext): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await recordAudit(
      { action: 'auth.logout_all', entityType: 'User', entityId: userId },
      { ...ctx, userId },
      tx,
    );
  });
}
