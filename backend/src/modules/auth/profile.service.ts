import { getEnv } from '../../config/env.js';
import { getPrisma } from '../../db/prisma.js';
import { AppError, Errors } from '../../lib/errors.js';
import { signSessionToken } from '../../lib/jwt.js';
import {
  paginated,
  toSkipTake,
  type Paginated,
  type PaginationQuery,
} from '../../lib/pagination.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { recordAudit, recordAuditSafe, type AuditRequestContext } from '../audit/audit.service.js';
import { getCurrentUser } from './auth.service.js';
import type { AuthUserDto } from './auth.types.js';
import type { ChangePasswordInput, UpdateProfileInput } from './profile.schemas.js';

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
  ctx: AuditRequestContext,
): Promise<AuthUserDto> {
  await getPrisma().$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { fullName: true },
    });
    await tx.user.update({ where: { id: userId }, data: { fullName: input.fullName } });
    await recordAudit(
      {
        action: 'user.profile_updated',
        entityType: 'User',
        entityId: userId,
        before: { fullName: before.fullName },
        after: { fullName: input.fullName },
      },
      ctx,
      tx,
    );
  });
  return getCurrentUser(userId);
}

/**
 * Changes the caller's password after re-verifying the current one. All other sessions are
 * revoked (tokenVersion bump); the caller receives a fresh token for the current session.
 */
export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
  ctx: AuditRequestContext,
): Promise<{ token: string }> {
  const env = getEnv();
  const prisma = getPrisma();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    await recordAuditSafe(
      { action: 'user.password_change_failed', entityType: 'User', entityId: userId },
      ctx,
    );
    throw new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', [
      { path: 'currentPassword', message: 'Current password is incorrect', code: 'custom' },
    ]);
  }

  const passwordHash = await hashPassword(input.newPassword);
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    await recordAudit(
      { action: 'user.password_changed', entityType: 'User', entityId: userId },
      ctx,
      tx,
    );
    return u;
  });

  return {
    token: signSessionToken(
      { sub: userId, ver: updated.tokenVersion },
      {
        secret: env.JWT_SECRET,
        issuer: env.JWT_ISSUER,
        expiresInMinutes: env.JWT_EXPIRES_IN_MINUTES,
      },
    ),
  };
}

export interface ActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

/** The caller's own audit trail (sign-ins, profile changes...), newest first. */
export async function listMyActivity(
  userId: string,
  query: PaginationQuery,
): Promise<Paginated<ActivityItem>> {
  if (!userId) throw Errors.unauthenticated();
  const prisma = getPrisma();
  const where = { userId };
  const [rows, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(query),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        ipAddress: true,
        createdAt: true,
      },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return paginated(
    rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total,
    query,
  );
}
