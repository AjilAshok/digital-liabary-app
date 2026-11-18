import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  requireAnyPermission,
  requirePermissions,
  requireRole,
} from '../../src/middleware/authorize.js';
import { errorHandler } from '../../src/middleware/error-handler.js';
import type { AuthContext } from '../../src/modules/auth/auth.types.js';
import { PERMISSIONS } from '../../src/security/permissions.js';

function appWith(auth: AuthContext | undefined, guard: express.RequestHandler) {
  const app = express();
  app.use((req, _res, next) => {
    if (auth) req.auth = auth;
    next();
  });
  app.get('/x', guard, (_req, res) => res.json({ ok: true }));
  app.use(errorHandler);
  return app;
}

const ctx = (permissions: string[]): AuthContext => ({
  userId: 'u',
  email: 'u@test',
  fullName: 'U',
  roles: ['ADMIN'],
  permissions: new Set(permissions),
});

describe('requirePermissions', () => {
  it('returns 401 when unauthenticated', async () => {
    const res = await request(appWith(undefined, requirePermissions(PERMISSIONS.ROLES_READ))).get(
      '/x',
    );
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns 403 when any required permission is missing — role names grant nothing', async () => {
    const app = appWith(
      ctx([PERMISSIONS.ROLES_READ]),
      requirePermissions(PERMISSIONS.ROLES_READ, PERMISSIONS.USERS_MANAGE),
    );
    const res = await request(app).get('/x');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('passes when all permissions are held', async () => {
    const app = appWith(
      ctx([PERMISSIONS.ROLES_READ, PERMISSIONS.USERS_MANAGE]),
      requirePermissions(PERMISSIONS.ROLES_READ, PERMISSIONS.USERS_MANAGE),
    );
    expect((await request(app).get('/x')).status).toBe(200);
  });
});

describe('requireRole', () => {
  it('passes when the user holds one of the roles', async () => {
    const app = appWith(ctx([]), requireRole('ADMIN', 'LIBRARIAN'));
    expect((await request(app).get('/x')).status).toBe(200);
  });

  it('returns 403 for other roles and 401 when unauthenticated', async () => {
    expect((await request(appWith(ctx([]), requireRole('ASSISTANT'))).get('/x')).status).toBe(403);
    expect((await request(appWith(undefined, requireRole('ADMIN'))).get('/x')).status).toBe(401);
  });
});

describe('requireAnyPermission', () => {
  it('passes with one matching permission', async () => {
    const app = appWith(
      ctx([PERMISSIONS.REPORTS_READ]),
      requireAnyPermission(PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.REPORTS_READ),
    );
    expect((await request(app).get('/x')).status).toBe(200);
  });

  it('fails with none', async () => {
    const app = appWith(ctx([]), requireAnyPermission(PERMISSIONS.REPORTS_READ));
    expect((await request(app).get('/x')).status).toBe(403);
  });
});
