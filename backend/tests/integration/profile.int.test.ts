import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectPrisma, getPrisma } from '../../src/db/prisma.js';
import { ensureUser, seedAccessControl } from '../../src/db/seed-core.js';

const app = createApp();
const prisma = getPrisma();

const LIBRARIAN = {
  email: 'librarian@test.local',
  password: 'Librarian-Pass-2026',
  fullName: 'Test Librarian',
};

function sessionCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith('dlms_session='));
  if (!cookie) throw new Error('No session cookie set');
  return cookie.split(';')[0]!;
}

async function login(password = LIBRARIAN.password): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: LIBRARIAN.email, password });
  expect(res.status).toBe(200);
  return sessionCookie(res);
}

beforeAll(async () => {
  await seedAccessControl(prisma);
  await ensureUser(prisma, { ...LIBRARIAN, roleCode: 'LIBRARIAN' });
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('roles', () => {
  it('gives LIBRARIAN catalogue/circulation permissions but not user administration', async () => {
    const cookie = await login();
    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
    expect(me.body.user.roles).toEqual(['LIBRARIAN']);
    expect(me.body.user.permissions).toContain('catalogue.write');
    expect(me.body.user.permissions).not.toContain('users.manage');
  });
});

describe('PATCH /auth/me', () => {
  it('updates the display name, normalising whitespace, and audits it', async () => {
    const cookie = await login();
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Cookie', cookie)
      .send({ fullName: '  Lib   Rarian ' });
    expect(res.status).toBe(200);
    expect(res.body.user.fullName).toBe('Lib Rarian');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'user.profile_updated', user: { email: LIBRARIAN.email } },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.after).toEqual({ fullName: 'Lib Rarian' });
  });

  it('rejects an empty name and unknown fields are ignored', async () => {
    const cookie = await login();
    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Cookie', cookie)
      .send({ fullName: '   ', email: 'hijack@test.local' });
    expect(res.status).toBe(422);
    const ok = await request(app)
      .patch('/api/v1/auth/me')
      .set('Cookie', cookie)
      .send({ fullName: 'Test Librarian', email: 'hijack@test.local' });
    expect(ok.body.user.email).toBe(LIBRARIAN.email);
  });

  it('requires a session', async () => {
    expect((await request(app).patch('/api/v1/auth/me').send({ fullName: 'x' })).status).toBe(401);
  });
});

describe('GET /auth/me/activity', () => {
  it('returns the caller’s own audit trail, paginated, newest first', async () => {
    const cookie = await login();
    const res = await request(app)
      .get('/api/v1/auth/me/activity?page=1&pageSize=2')
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2 });
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
    const [a, b] = res.body.data as { createdAt: string }[];
    expect(new Date(a!.createdAt) >= new Date(b!.createdAt)).toBe(true);
  });

  it('validates pagination', async () => {
    const cookie = await login();
    const res = await request(app)
      .get('/api/v1/auth/me/activity?pageSize=1000')
      .set('Cookie', cookie);
    expect(res.status).toBe(422);
  });
});

describe('POST /auth/change-password', () => {
  it('rejects a wrong current password with a field error', async () => {
    const cookie = await login();
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'Wrong-Pass-2026', newPassword: 'Brand-New-Pass-2026' });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('currentPassword');
  });

  it('rejects a weak new password', async () => {
    const cookie = await login();
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: LIBRARIAN.password, newPassword: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe('newPassword');
  });

  it('changes the password, keeps this session, revokes other sessions', async () => {
    const thisDevice = await login();
    const otherDevice = await login();
    const newPassword = 'Brand-New-Pass-2026';

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Cookie', thisDevice)
      .send({ currentPassword: LIBRARIAN.password, newPassword });
    expect(res.status).toBe(204);
    const refreshed = sessionCookie(res);

    expect((await request(app).get('/api/v1/auth/me').set('Cookie', refreshed)).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set('Cookie', otherDevice)).status).toBe(401);

    // Old password no longer works; new one does.
    const old = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: LIBRARIAN.email, password: LIBRARIAN.password });
    expect(old.status).toBe(401);
    await login(newPassword);
  });
});
