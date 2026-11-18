import type { Request } from 'express';
import type { AuditRequestContext } from '../modules/audit/audit.service.js';

/** The correlation id assigned by the request-id middleware (pino-http types it loosely). */
export function requestIdOf(req: Request): string | undefined {
  return typeof req.id === 'string' || typeof req.id === 'number' ? String(req.id) : undefined;
}

export function auditContext(req: Request): AuditRequestContext {
  return {
    userId: req.auth?.userId ?? null,
    ipAddress: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
    requestId: requestIdOf(req) ?? null,
  };
}
