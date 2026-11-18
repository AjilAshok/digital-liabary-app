import { getPrisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { logger } from '../../lib/logger.js';

export interface AuditRequestContext {
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

/**
 * Appends an audit record. Pass the transaction client when the audited change is part of a
 * transaction so the audit row commits (or rolls back) together with the change.
 */
export async function recordAudit(
  entry: AuditEntry,
  ctx: AuditRequestContext,
  db: AuditWriter = getPrisma(),
): Promise<void> {
  await db.auditLog.create({
    data: {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before,
      after: entry.after,
      metadata: entry.metadata,
      userId: ctx.userId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      userAgent: ctx.userAgent?.slice(0, 500) ?? null,
      requestId: ctx.requestId ?? null,
    },
  });
}

/** Best-effort variant for events that must not fail the request (e.g. failed-login records). */
export async function recordAuditSafe(entry: AuditEntry, ctx: AuditRequestContext): Promise<void> {
  try {
    await recordAudit(entry, ctx);
  } catch (err) {
    logger.error({ err, action: entry.action }, 'Failed to write audit log');
  }
}
