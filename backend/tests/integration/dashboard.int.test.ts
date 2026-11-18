/**
 * Dashboard calculations against real PostgreSQL. A small fixture with hand-computed expected
 * values is built from scratch; every metric and chart series is asserted against it.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectPrisma, getPrisma } from '../../src/db/prisma.js';
import { ensureUser, seedAccessControl } from '../../src/db/seed-core.js';
import { resetDomainData } from '../helpers/reset-domain.js';

const app = createApp();
const prisma = getPrisma();

const PASSWORD = 'Dashboard-Pass-2026';
const ADMIN = 'dash-admin@test.local';
const ASSISTANT = 'dash-assistant@test.local';
const VIEWER = 'dash-viewer@test.local'; // dashboard.read only
const OUTSIDER = 'dash-outsider@test.local'; // no permissions at all

const DAY = 86_400_000;
const now = new Date();
const curMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const prevMonthMid = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Month key of an instant in a time zone — computed independently of PostgreSQL. */
function monthKey(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  return `${y}-${m}`;
}
function lastMonths(count: number, timeZone: string): string[] {
  const [y, m] = monthKey(new Date(), timeZone).split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

const loanEvents: { issuedAt: Date; returnedAt: Date | null }[] = [];
let cookies: Record<string, string> = {};

async function login(email: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD });
  expect(res.status).toBe(200);
  const raw = res.headers['set-cookie'] as unknown as string[];
  return raw.find((c) => c.startsWith('dlms_session='))!.split(';')[0]!;
}

beforeAll(async () => {
  await resetDomainData(prisma);
  await seedAccessControl(prisma);
  const adminId = (
    await ensureUser(prisma, {
      email: ADMIN,
      password: PASSWORD,
      fullName: 'Dash Admin',
      roleCode: 'ADMIN',
    })
  ).id;
  await ensureUser(prisma, {
    email: ASSISTANT,
    password: PASSWORD,
    fullName: 'Dash Assistant',
    roleCode: 'ASSISTANT',
  });

  // Custom roles to prove permission-dependent behaviour.
  const dashRead = await prisma.permission.findUniqueOrThrow({ where: { code: 'dashboard.read' } });
  const viewerRole = await prisma.role.upsert({
    where: { code: 'TEST_DASH_VIEWER' },
    update: {},
    create: {
      code: 'TEST_DASH_VIEWER',
      name: 'Dashboard viewer',
      permissions: { create: { permissionId: dashRead.id } },
    },
  });
  const noneRole = await prisma.role.upsert({
    where: { code: 'TEST_NO_PERMS' },
    update: {},
    create: { code: 'TEST_NO_PERMS', name: 'No permissions' },
  });
  for (const [email, roleId] of [
    [VIEWER, viewerRole.id],
    [OUTSIDER, noneRole.id],
  ] as const) {
    if (!(await prisma.user.findUnique({ where: { email } }))) {
      const u = await ensureUser(prisma, {
        email,
        password: PASSWORD,
        fullName: email,
        roleCode: 'ASSISTANT',
      });
      await prisma.userRole.deleteMany({ where: { userId: u.id } });
      await prisma.userRole.create({ data: { userId: u.id, roleId } });
    }
  }

  // ── Catalogue ────────────────────────────────────────────────────────────
  const science = await prisma.category.create({
    data: { name: 'Science', normalizedName: 'science' },
  });
  const history = await prisma.category.create({
    data: { name: 'History', normalizedName: 'history' },
  });
  const book = (title: string, categoryId: string | null, archived = false) =>
    prisma.book.create({
      data: {
        title,
        normalizedTitle: title.toLowerCase(),
        categoryId,
        archivedAt: archived ? new Date() : null,
        editions: { create: { archivedAt: archived ? new Date() : null } },
      },
      include: { editions: true },
    });
  const t1 = await book('Physics Basics', science.id);
  const t2 = await book('World History', history.id);
  const t3 = await book('Untitled Pamphlet', null);
  await book('Archived Work', null, true);
  const [e1, e2, e3] = [t1.editions[0]!.id, t2.editions[0]!.id, t3.editions[0]!.id];

  // ── Purchases ────────────────────────────────────────────────────────────
  const supplier = await prisma.supplier.create({ data: { name: 'S', normalizedName: 's' } });
  const purchase = (status: 'RECEIVED' | 'DRAFT' | 'CANCELLED', invoiceDate: Date, total: string) =>
    prisma.purchase.create({
      data: {
        supplierId: supplier.id,
        invoiceNumber: `INV-${status}-${ymd(invoiceDate)}`,
        invoiceDate,
        status,
        totalAmount: total,
        createdById: adminId,
      },
    });
  await purchase('RECEIVED', curMonthStart, '51.00');
  await purchase('RECEIVED', prevMonthMid, '12.25');
  await purchase('DRAFT', curMonthStart, '500.00'); // not received → excluded
  await purchase('CANCELLED', new Date(curMonthStart.getTime() + DAY), '700.00'); // excluded

  // ── Copies (expected values worked out in the comments) ─────────────────
  const copy = (
    accessionNumber: string,
    editionId: string,
    acquisitionType: 'LEGACY_OLD_STOCK' | 'PURCHASED_NEW' | 'DONATED' | 'TRANSFERRED',
    status:
      | 'AVAILABLE'
      | 'ISSUED'
      | 'RESERVED'
      | 'DAMAGED'
      | 'MISSING'
      | 'DISCARDED'
      | 'PENDING_VERIFICATION',
    price: string | null,
    extra: { acquisitionDate?: Date; archived?: boolean } = {},
  ) =>
    prisma.bookCopy.create({
      data: {
        accessionNumber,
        editionId,
        acquisitionType,
        status,
        acquisitionPrice: price,
        acquisitionDate: extra.acquisitionDate ?? null,
        archivedAt: extra.archived ? new Date() : null,
      },
    });
  const c1 = await copy('D-1', e1, 'LEGACY_OLD_STOCK', 'AVAILABLE', '10.00');
  const c2 = await copy('D-2', e1, 'LEGACY_OLD_STOCK', 'ISSUED', null);
  const c3 = await copy('D-3', e2, 'PURCHASED_NEW', 'AVAILABLE', '25.50', {
    acquisitionDate: curMonthStart,
  });
  const c4 = await copy('D-4', e2, 'PURCHASED_NEW', 'ISSUED', '25.50', {
    acquisitionDate: curMonthStart,
  });
  await copy('D-5', e3, 'DONATED', 'DAMAGED', '5.00');
  await copy('D-6', e3, 'LEGACY_OLD_STOCK', 'MISSING', null);
  await copy('D-7', e1, 'LEGACY_OLD_STOCK', 'DISCARDED', '99.00', { archived: true });
  await copy('D-8', e2, 'TRANSFERRED', 'PENDING_VERIFICATION', null);
  await copy('D-9', e1, 'PURCHASED_NEW', 'RESERVED', '12.25', { acquisitionDate: prevMonthMid });

  // ── Members & loans ──────────────────────────────────────────────────────
  const type = await prisma.memberType.create({
    data: {
      code: 'T',
      name: 'T',
      maxActiveLoans: 5,
      loanPeriodDays: 14,
      maxRenewals: 1,
      finePerDay: '0',
      reservationHoldDays: 3,
    },
  });
  const member = (n: string, status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED') =>
    prisma.member.create({
      data: { membershipNumber: n, fullName: `Member ${n}`, memberTypeId: type.id, status },
    });
  const m1 = await member('M1', 'ACTIVE');
  const m2 = await member('M2', 'ACTIVE');
  await member('M3', 'SUSPENDED');
  await member('M4', 'ARCHIVED');

  const loan = async (
    copyId: string,
    memberId: string,
    issuedAt: Date,
    dueAt: Date,
    returnedAt: Date | null,
  ) => {
    loanEvents.push({ issuedAt, returnedAt });
    return prisma.loan.create({
      data: {
        copyId,
        memberId,
        issuedById: adminId,
        issuedAt,
        dueAt,
        returnedAt,
        status: returnedAt ? 'RETURNED' : 'ACTIVE',
      },
    });
  };
  // L1: active and overdue (due in the previous month).
  await loan(c2.id, m1.id, prevMonthMid, new Date(prevMonthMid.getTime() + 10 * DAY), null);
  // L2: active, due in two weeks.
  await loan(
    c4.id,
    m2.id,
    new Date(now.getTime() - 60_000),
    new Date(now.getTime() + 14 * DAY),
    null,
  );
  // L3: issued last month, returned this month.
  await loan(
    c1.id,
    m1.id,
    prevMonthMid,
    new Date(prevMonthMid.getTime() + 10 * DAY),
    new Date(curMonthStart.getTime() + 3_600_000),
  );
  // L4: issued and returned last month.
  await loan(
    c3.id,
    m2.id,
    prevMonthMid,
    new Date(prevMonthMid.getTime() + 10 * DAY),
    new Date(prevMonthMid.getTime() + 2 * DAY),
  );

  await prisma.auditLog.createMany({
    data: [
      { userId: adminId, action: 'copy.created', entityType: 'BookCopy', entityId: c1.id },
      { userId: adminId, action: 'auth.login', entityType: 'User', entityId: adminId },
      { userId: adminId, action: 'auth.login_failed', entityType: 'User', entityId: adminId },
    ],
  });

  cookies = {
    admin: await login(ADMIN),
    assistant: await login(ASSISTANT),
    viewer: await login(VIEWER),
    outsider: await login(OUTSIDER),
  };
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('access control', () => {
  it('requires a session and dashboard.read', async () => {
    expect((await request(app).get('/api/v1/dashboard/summary')).status).toBe(401);
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Cookie', cookies['outsider']!);
    expect(res.status).toBe(403);
  });

  it('is available to every system role (assistant included)', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Cookie', cookies['assistant']!);
    expect(res.status).toBe(200);
  });
});

describe('GET /dashboard/summary', () => {
  let s: Record<string, any>;
  beforeAll(async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/summary')
      .set('Cookie', cookies['admin']!);
    expect(res.status).toBe(200);
    s = res.body;
  });

  it('counts titles and editions, excluding archived records', () => {
    expect(s['titles']).toEqual({ works: 3, editions: 3 });
  });

  it('counts physical holdings and discarded copies', () => {
    expect(s['copies'].holdings).toBe(8); // D-1..D-6, D-8, D-9
    expect(s['copies'].discarded).toBe(1); // D-7
  });

  it('counts available, issued, damaged and missing copies', () => {
    expect(s['copies']).toMatchObject({ available: 2, issued: 2, damaged: 1, missing: 1 });
    expect(s['copies'].byStatus).toEqual({
      AVAILABLE: 2,
      ISSUED: 2,
      RESERVED: 1,
      DAMAGED: 1,
      MISSING: 1,
      UNDER_REPAIR: 0,
      PENDING_VERIFICATION: 1,
    });
  });

  it('splits old (legacy) and new (purchased) stock', () => {
    expect(s['copies'].oldStock).toBe(3); // D-1, D-2, D-6
    expect(s['copies'].newStock).toBe(3); // D-3, D-4, D-9
    expect(s['copies'].byAcquisition).toMatchObject({ DONATED: 1, TRANSFERRED: 1, OTHER: 0 });
  });

  it('counts members (excluding archived) and active members', () => {
    expect(s['members']).toEqual({ total: 3, active: 2 });
  });

  it('counts active and overdue loans', () => {
    expect(s['loans']).toEqual({ active: 2, overdue: 1 });
  });

  it('sums inventory value exactly over holdings with known prices', () => {
    // 10.00 + 25.50 + 25.50 + 5.00 + 12.25 (D-7 is discarded and excluded)
    expect(s['inventoryValue']).toEqual({ amount: '78.25', pricedCopies: 5, unpricedCopies: 3 });
  });

  it('reports digitisation without a percentage until a register total is set', () => {
    expect(s['digitization']).toMatchObject({
      registerTotal: null,
      legacyDigitized: 4, // D-1, D-2, D-6 and the discarded D-7
      percent: null,
      pendingVerification: 1,
    });
  });

  it('cross-checks: issued copies equal active loans', () => {
    expect(s['copies'].issued).toBe(s['loans'].active);
  });
});

describe('GET /dashboard/charts', () => {
  let c: Record<string, any>;
  beforeAll(async () => {
    const res = await request(app).get('/api/v1/dashboard/charts').set('Cookie', cookies['admin']!);
    expect(res.status).toBe(200);
    c = res.body;
  });

  it('splits holdings into available / issued / reserved / not lendable', () => {
    expect(c['availability']).toEqual({ available: 2, issued: 2, reserved: 1, notLendable: 3 });
  });

  it('splits holdings by stock source', () => {
    expect(c['stockSource']).toEqual({ oldStock: 3, newStock: 3, donated: 1, other: 1 });
  });

  it('distributes holdings by category, uncategorised included, largest first', () => {
    expect(c['categories']).toEqual([
      { categoryId: expect.any(String), name: 'History', copies: 3, titles: 1 },
      { categoryId: expect.any(String), name: 'Science', copies: 3, titles: 1 },
      { categoryId: null, name: 'Uncategorised', copies: 2, titles: 1 },
    ]);
  });

  it('returns 12 calendar months ending with the current month', () => {
    const expected = lastMonths(12, 'UTC');
    expect(c['monthlyCirculation'].map((r: { month: string }) => r.month)).toEqual(expected);
    expect(c['monthlyPurchases'].map((r: { month: string }) => r.month)).toEqual(expected);
  });

  it('counts monthly issues and returns (hand-computed)', () => {
    const [cur, prev] = [c['monthlyCirculation'].at(-1), c['monthlyCirculation'].at(-2)];
    expect(cur).toEqual({ month: monthKey(now, 'UTC'), issued: 1, returned: 1 }); // L2 / L3
    expect(prev).toEqual({ month: monthKey(prevMonthMid, 'UTC'), issued: 3, returned: 1 }); // L1,L3,L4 / L4
    const totalIssued = c['monthlyCirculation'].reduce(
      (n: number, r: { issued: number }) => n + r.issued,
      0,
    );
    expect(totalIssued).toBe(4);
  });

  it('counts monthly received purchases, amounts and copies (drafts/cancelled excluded)', () => {
    const [cur, prev] = [c['monthlyPurchases'].at(-1), c['monthlyPurchases'].at(-2)];
    expect(cur).toEqual({
      month: monthKey(now, 'UTC'),
      purchases: 1,
      amount: '51.00',
      copiesReceived: 2,
    });
    expect(prev).toEqual({
      month: monthKey(prevMonthMid, 'UTC'),
      purchases: 1,
      amount: '12.25',
      copiesReceived: 1,
    });
  });

  it('honours the months parameter and validates it', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/charts?months=3')
      .set('Cookie', cookies['admin']!);
    expect(res.body.monthlyCirculation).toHaveLength(3);
    const bad = await request(app)
      .get('/api/v1/dashboard/charts?months=0')
      .set('Cookie', cookies['admin']!);
    expect(bad.status).toBe(422);
  });

  it('buckets months in the library time zone when one is configured', async () => {
    // An issue at 23:00 UTC on the last day of the previous month is "this month" in Asia/Kolkata.
    const edge = new Date(curMonthStart.getTime() - 3_600_000);
    const c2 = await prisma.bookCopy.findUniqueOrThrow({ where: { accessionNumber: 'D-6' } });
    const m1 = await prisma.member.findUniqueOrThrow({ where: { membershipNumber: 'M1' } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN } });
    await prisma.loan.create({
      data: {
        copyId: c2.id,
        memberId: m1.id,
        issuedById: admin.id,
        issuedAt: edge,
        dueAt: new Date(edge.getTime() + DAY),
        returnedAt: new Date(edge.getTime() + 1_800_000),
        status: 'RETURNED',
      },
    });
    loanEvents.push({ issuedAt: edge, returnedAt: new Date(edge.getTime() + 1_800_000) });
    await prisma.setting.create({ data: { key: 'library.timeZone', value: 'Asia/Kolkata' } });

    try {
      const res = await request(app)
        .get('/api/v1/dashboard/charts')
        .set('Cookie', cookies['admin']!);
      expect(res.body.timeZone).toBe('Asia/Kolkata');

      // Expected series computed independently with Intl for every fixture loan.
      const tz = 'Asia/Kolkata';
      const expected = lastMonths(12, tz).map((month) => ({
        month,
        issued: loanEvents.filter((l) => monthKey(l.issuedAt, tz) === month).length,
        returned: loanEvents.filter((l) => l.returnedAt && monthKey(l.returnedAt, tz) === month)
          .length,
      }));
      expect(res.body.monthlyCirculation).toEqual(expected);
    } finally {
      await prisma.setting.delete({ where: { key: 'library.timeZone' } });
    }
  });
});

describe('GET /dashboard/recent-activities', () => {
  it('lists due loans soonest first with overdue flags and member details', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/recent-activities')
      .set('Cookie', cookies['assistant']!);
    expect(res.status).toBe(200);
    const due = res.body.dueLoans as {
      accessionNumber: string;
      overdue: boolean;
      daysOverdue: number;
      member: unknown;
    }[];
    expect(due.map((d) => d.accessionNumber)).toEqual(['D-2', 'D-4']);
    expect(due[0]!.overdue).toBe(true);
    expect(due[0]!.daysOverdue).toBeGreaterThanOrEqual(1);
    expect(due[1]!.overdue).toBe(false);
    expect(due[0]!.member).toEqual({ fullName: 'Member M1', membershipNumber: 'M1' });
  });

  it('lists the most recently registered holdings', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/recent-activities')
      .set('Cookie', cookies['admin']!);
    expect(res.body.recentAdditions).toHaveLength(5);
    expect(res.body.recentAdditions[0].accessionNumber).toBe('D-9');
    expect(
      res.body.recentAdditions.map((a: { accessionNumber: string }) => a.accessionNumber),
    ).not.toContain('D-7');
  });

  it('shows security events only to users with audit-log access', async () => {
    const admin = await request(app)
      .get('/api/v1/dashboard/recent-activities')
      .set('Cookie', cookies['admin']!);
    const adminActions = admin.body.activity.map((a: { action: string }) => a.action) as string[];
    // Security events are visible to audit-log readers; routine sign-ins never clutter the feed.
    expect(adminActions).toContain('auth.login_failed');
    expect(adminActions).not.toContain('auth.login');

    const viewer = await request(app)
      .get('/api/v1/dashboard/recent-activities')
      .set('Cookie', cookies['viewer']!);
    const actions = viewer.body.activity.map((a: { action: string }) => a.action) as string[];
    expect(actions).toContain('copy.created');
    expect(actions.some((a) => a.startsWith('auth.') || a.startsWith('user.'))).toBe(false);
    // No members.read → member identity withheld.
    expect(viewer.body.dueLoans[0].member).toBeNull();
  });
});

describe('PUT /dashboard/digitization-target', () => {
  it('lets an administrator set the register total and recomputes progress', async () => {
    const res = await request(app)
      .put('/api/v1/dashboard/digitization-target')
      .set('Cookie', cookies['admin']!)
      .send({ registerTotal: 10 });
    expect(res.status).toBe(200);
    expect(res.body.digitization).toMatchObject({
      registerTotal: 10,
      legacyDigitized: 4,
      percent: 40,
      remaining: 6,
    });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'settings.updated' } });
    expect(audit?.after).toEqual({ value: 10 });
  });

  it('forbids users without settings.manage and validates input', async () => {
    const forbidden = await request(app)
      .put('/api/v1/dashboard/digitization-target')
      .set('Cookie', cookies['assistant']!)
      .send({ registerTotal: 5 });
    expect(forbidden.status).toBe(403);
    const invalid = await request(app)
      .put('/api/v1/dashboard/digitization-target')
      .set('Cookie', cookies['admin']!)
      .send({ registerTotal: -1 });
    expect(invalid.status).toBe(422);
  });

  it('clears the target with null', async () => {
    const res = await request(app)
      .put('/api/v1/dashboard/digitization-target')
      .set('Cookie', cookies['admin']!)
      .send({ registerTotal: null });
    expect(res.body.digitization.percent).toBeNull();
  });
});
