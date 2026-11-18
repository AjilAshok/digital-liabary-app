import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectPrisma, getPrisma } from '../../src/db/prisma.js';
import { ensureUser, seedAccessControl } from '../../src/db/seed-core.js';
import { ALL_PERMISSIONS } from '../../src/security/permissions.js';

const app = createApp();
const prisma = getPrisma();

const ADMIN = { email: 'admin@test.local', password: 'Admin-Pass-2026', fullName: 'Test Admin' };
const ASSISTANT = {
  email: 'assistant@test.local',
  password: 'Assist-Pass-2026',
  fullName: 'Test Assistant',
};

function sessionCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('dlms_session='));
  if (!cookie) throw new Error('No session cookie set');
  return cookie.split(';')[0]!;
}

async function loginAs(user: { email: string; password: string }) {
  const res = await request(app).post('/api/v1/auth/login').send(user);
  expect(res.status).toBe(200);
  return sessionCookie(res);
}

beforeAll(async () => {
  await seedAccessControl(prisma);
  // Seeding twice must be idempotent.
  await seedAccessControl(prisma);
  await ensureUser(prisma, { ...ADMIN, roleCode: 'ADMIN' });
  await ensureUser(prisma, { ...ASSISTANT, roleCode: 'ASSISTANT' });
});

beforeEach(async () => {
  await prisma.user.updateMany({
    data: { failedLoginCount: 0, lockedUntil: null, isActive: true },
  });
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('seed', () => {
  it('creates the three system roles and the full permission catalogue', async () => {
    expect(await prisma.permission.count()).toBe(ALL_PERMISSIONS.length);
    const roles = await prisma.role.findMany({
      where: { isSystem: true },
      orderBy: { code: 'asc' },
    });
    expect(roles.map((r) => r.code)).toEqual(['ADMIN', 'ASSISTANT', 'LIBRARIAN']);
  });

  it('never overwrites an existing user password', async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
    const result = await ensureUser(prisma, {
      ...ADMIN,
      password: 'Another-Pass-2026',
      roleCode: 'ADMIN',
    });
    expect(result.created).toBe(false);
    const after = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });
});

describe('POST /auth/login', () => {
  it('signs in, sets a hardened HttpOnly cookie and returns the user without secrets', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: '  ADMIN@test.local ', password: ADMIN.password });

    expect(res.status).toBe(200);
    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).toMatch(/Path=\/api/);

    expect(res.body.user.email).toBe(ADMIN.email);
    expect(res.body.user.roles).toEqual(['ADMIN']);
    expect(res.body.user.permissions).toHaveLength(ALL_PERMISSIONS.length);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'auth.login', user: { email: ADMIN.email } },
    });
    expect(audit).not.toBeNull();
  });

  it('returns the same generic error for unknown email and wrong password', async () => {
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@test.local', password: 'Whatever-123' });
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ADMIN.email, password: 'Wrong-Pass-123' });

    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('records failed attempts in the audit log', async () => {
    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ASSISTANT.email, password: 'Wrong-Pass-123' });
    const failed = await prisma.auditLog.count({
      where: { action: 'auth.login_failed', user: { email: ASSISTANT.email } },
    });
    expect(failed).toBeGreaterThan(0);
  });

  it('locks the account after the configured number of failures (3 in tests)', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: ASSISTANT.email, password: 'Wrong-Pass-123' });
    }
    const locked = await request(app).post('/api/v1/auth/login').send(ASSISTANT);
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('rejects deactivated users with the generic error', async () => {
    await prisma.user.update({ where: { email: ASSISTANT.email }, data: { isActive: false } });
    const res = await request(app).post('/api/v1/auth/login').send(ASSISTANT);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('session lifecycle', () => {
  it('GET /auth/me returns the signed-in user', async () => {
    const cookie = await loginAs(ADMIN);
    const res = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ADMIN.email);
    expect(res.body.user.lastLoginAt).toBeTruthy();
  });

  it('logout clears the cookie', async () => {
    const cookie = await loginAs(ADMIN);
    const res = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(204);
    const cleared = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cleared).toMatch(/dlms_session=;/);
  });

  it('logout-all revokes previously issued tokens', async () => {
    const first = await loginAs(ADMIN);
    const second = await loginAs(ADMIN);
    expect((await request(app).post('/api/v1/auth/logout-all').set('Cookie', first)).status).toBe(
      204,
    );
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', second)).status).toBe(401);
  });

  it('deactivating a user invalidates their existing session immediately', async () => {
    const cookie = await loginAs(ASSISTANT);
    await prisma.user.update({ where: { email: ASSISTANT.email }, data: { isActive: false } });
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('backend authorization', () => {
  it('lets ADMIN list roles with permissions', async () => {
    const cookie = await loginAs(ADMIN);
    const res = await request(app).get('/api/v1/roles').set('Cookie', cookie);
    expect(res.status).toBe(200);
    const assistant = (res.body.data as { code: string; permissions: string[] }[]).find(
      (r) => r.code === 'ASSISTANT',
    );
    expect(assistant?.permissions).toContain('circulation.issue_return');
  });

  it('forbids ASSISTANT from listing roles', async () => {
    const cookie = await loginAs(ASSISTANT);
    const res = await request(app).get('/api/v1/roles').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('applies permission changes without re-login', async () => {
    const cookie = await loginAs(ASSISTANT);
    const role = await prisma.role.findUniqueOrThrow({ where: { code: 'ASSISTANT' } });
    const perm = await prisma.permission.findUniqueOrThrow({ where: { code: 'roles.read' } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
    try {
      expect((await request(app).get('/api/v1/roles').set('Cookie', cookie)).status).toBe(200);
    } finally {
      await prisma.rolePermission.delete({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      });
    }
  });
});

describe('health', () => {
  it('reports the database as ready', async () => {
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });
});
