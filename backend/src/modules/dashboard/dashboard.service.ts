import { getPrisma } from '../../db/prisma.js';
import { recordAudit, type AuditRequestContext } from '../audit/audit.service.js';
import {
  availabilitySplit,
  computeCopyMetrics,
  computeDigitization,
  resolveTimeZone,
  stockSourceSplit,
  topCategories,
  type CategoryCount,
  type CopyGroupRow,
} from './dashboard.calculations.js';

/** High-volume events excluded from the dashboard activity feed. */
const ROUTINE_ACTIONS = ['auth.login', 'auth.logout'];

export const SETTING_REGISTER_TOTAL = 'digitization.registerTotal';
export const SETTING_TIME_ZONE = 'library.timeZone';
export const SETTING_CURRENCY = 'library.currency';

async function readSettings(keys: string[]): Promise<Map<string, unknown>> {
  const rows = await getPrisma().setting.findMany({ where: { key: { in: keys } } });
  return new Map(rows.map((r) => [r.key, r.value]));
}

const asNonNegativeInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null;

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

export async function getSummary(now = new Date()) {
  const prisma = getPrisma();

  const [copyRows, titles, editions, members, activeMembers, activeLoans, overdueLoans, settings] =
    await Promise.all([
      prisma.$queryRaw<CopyGroupRow[]>`
        SELECT status::text AS status,
               "acquisitionType"::text AS "acquisitionType",
               ("archivedAt" IS NOT NULL) AS archived,
               count(*)::int AS copies,
               count("acquisitionPrice")::int AS priced,
               coalesce(sum("acquisitionPrice"), 0)::text AS value
        FROM book_copies
        GROUP BY 1, 2, 3`,
      prisma.book.count({ where: { archivedAt: null } }),
      prisma.bookEdition.count({ where: { archivedAt: null } }),
      prisma.member.count({ where: { status: { not: 'ARCHIVED' } } }),
      prisma.member.count({ where: { status: 'ACTIVE' } }),
      prisma.loan.count({ where: { status: 'ACTIVE' } }),
      prisma.loan.count({ where: { status: 'ACTIVE', dueAt: { lt: now } } }),
      readSettings([SETTING_REGISTER_TOTAL, SETTING_CURRENCY]),
    ]);

  const copies = computeCopyMetrics(copyRows);
  const currency = settings.get(SETTING_CURRENCY);

  return {
    generatedAt: now.toISOString(),
    currency: typeof currency === 'string' ? currency : null,
    titles: { works: titles, editions },
    copies: {
      holdings: copies.holdings,
      discarded: copies.discarded,
      byStatus: copies.byStatus,
      byAcquisition: copies.byAcquisition,
      available: copies.byStatus.AVAILABLE,
      issued: copies.byStatus.ISSUED,
      damaged: copies.byStatus.DAMAGED,
      missing: copies.byStatus.MISSING,
      oldStock: copies.byAcquisition.LEGACY_OLD_STOCK,
      newStock: copies.byAcquisition.PURCHASED_NEW,
    },
    members: { total: members, active: activeMembers },
    loans: { active: activeLoans, overdue: overdueLoans },
    inventoryValue: copies.inventoryValue,
    digitization: computeDigitization(
      copies.legacyDigitized,
      asNonNegativeInt(settings.get(SETTING_REGISTER_TOTAL)),
      copies.byStatus.PENDING_VERIFICATION,
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Charts
// ─────────────────────────────────────────────────────────────────────────────

interface MonthlyCirculationRow {
  month: string;
  issued: number;
  returned: number;
}
interface MonthlyPurchaseRow {
  month: string;
  purchases: number;
  amount: string;
  copiesReceived: number;
}

export async function getCharts(months: number) {
  const prisma = getPrisma();
  const settings = await readSettings([SETTING_TIME_ZONE]);
  const tz = resolveTimeZone(settings.get(SETTING_TIME_ZONE));
  const span = months - 1;

  // Timestamps are stored as UTC `timestamp`; convert to the library's local time before bucketing.
  const [copyRows, categoryRows, circulation, purchases] = await Promise.all([
    prisma.$queryRaw<CopyGroupRow[]>`
      SELECT status::text AS status, "acquisitionType"::text AS "acquisitionType",
             ("archivedAt" IS NOT NULL) AS archived, count(*)::int AS copies,
             count("acquisitionPrice")::int AS priced,
             coalesce(sum("acquisitionPrice"), 0)::text AS value
      FROM book_copies GROUP BY 1, 2, 3`,
    prisma.$queryRaw<CategoryCount[]>`
      SELECT c.id::text AS "categoryId",
             coalesce(c.name, 'Uncategorised') AS name,
             count(bc.id)::int AS copies,
             count(DISTINCT b.id)::int AS titles
      FROM book_copies bc
      JOIN book_editions e ON e.id = bc."editionId"
      JOIN books b ON b.id = e."bookId"
      LEFT JOIN categories c ON c.id = b."categoryId"
      WHERE bc."archivedAt" IS NULL AND bc.status <> 'DISCARDED'
      GROUP BY c.id, c.name`,
    prisma.$queryRaw<MonthlyCirculationRow[]>`
      WITH months AS (
        SELECT generate_series(
                 date_trunc('month', now() AT TIME ZONE ${tz}) - make_interval(months => ${span}::int),
                 date_trunc('month', now() AT TIME ZONE ${tz}),
                 interval '1 month')::date AS m
      ),
      issued AS (
        SELECT date_trunc('month', ("issuedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date AS m,
               count(*)::int AS n
        FROM loans GROUP BY 1
      ),
      returned AS (
        SELECT date_trunc('month', ("returnedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date AS m,
               count(*)::int AS n
        FROM loans WHERE "returnedAt" IS NOT NULL GROUP BY 1
      )
      SELECT to_char(months.m, 'YYYY-MM') AS month,
             coalesce(issued.n, 0)::int AS issued,
             coalesce(returned.n, 0)::int AS returned
      FROM months
      LEFT JOIN issued ON issued.m = months.m
      LEFT JOIN returned ON returned.m = months.m
      ORDER BY months.m`,
    prisma.$queryRaw<MonthlyPurchaseRow[]>`
      WITH months AS (
        SELECT generate_series(
                 date_trunc('month', now() AT TIME ZONE ${tz}) - make_interval(months => ${span}::int),
                 date_trunc('month', now() AT TIME ZONE ${tz}),
                 interval '1 month')::date AS m
      ),
      bought AS (
        -- A purchase counts in its invoice month (falling back to when it was received/created).
        SELECT date_trunc('month', coalesce(
                 "invoiceDate"::timestamp,
                 (coalesce("receivedAt", "createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${tz}))::date AS m,
               count(*)::int AS n,
               coalesce(sum("totalAmount"), 0) AS amount
        FROM purchases
        WHERE status IN ('PARTIALLY_RECEIVED', 'RECEIVED')
        GROUP BY 1
      ),
      received AS (
        -- Copies count in their acquisition month (falling back to when the copy was registered).
        SELECT date_trunc('month', coalesce(
                 "acquisitionDate"::timestamp,
                 ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}))::date AS m,
               count(*)::int AS n
        FROM book_copies
        WHERE "acquisitionType" = 'PURCHASED_NEW'
        GROUP BY 1
      )
      SELECT to_char(months.m, 'YYYY-MM') AS month,
             coalesce(bought.n, 0)::int AS purchases,
             coalesce(bought.amount, 0)::numeric(14, 2)::text AS amount,
             coalesce(received.n, 0)::int AS "copiesReceived"
      FROM months
      LEFT JOIN bought ON bought.m = months.m
      LEFT JOIN received ON received.m = months.m
      ORDER BY months.m`,
  ]);

  const copies = computeCopyMetrics(copyRows);
  return {
    timeZone: tz,
    availability: availabilitySplit(copies.byStatus),
    stockSource: stockSourceSplit(copies.byAcquisition),
    categories: topCategories(categoryRows, 8),
    monthlyPurchases: purchases,
    monthlyCirculation: circulation,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Recent activity
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityViewer {
  canReadAuditLog: boolean;
  canReadMembers: boolean;
}

export async function getRecentActivities(viewer: ActivityViewer, now = new Date()) {
  const prisma = getPrisma();
  const [activity, additions, dueLoans] = await Promise.all([
    prisma.auditLog.findMany({
      // Routine sign-ins/outs would bury operational events, so they never appear here (the full
      // audit log keeps them). Security events (failed sign-ins, lockouts, password changes) are
      // shown only to users with audit-log access.
      where: viewer.canReadAuditLog
        ? { action: { notIn: ROUTINE_ACTIONS } }
        : { NOT: [{ action: { startsWith: 'auth.' } }, { action: { startsWith: 'user.' } }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 10,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        user: { select: { fullName: true } },
      },
    }),
    prisma.bookCopy.findMany({
      where: { archivedAt: null },
      // UUIDv7 ids are time-ordered: a stable tie-break for rows created in the same millisecond.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
      select: {
        id: true,
        accessionNumber: true,
        acquisitionType: true,
        status: true,
        createdAt: true,
        edition: { select: { book: { select: { title: true } } } },
      },
    }),
    prisma.loan.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
      take: 8,
      select: {
        id: true,
        dueAt: true,
        issuedAt: true,
        copy: {
          select: {
            accessionNumber: true,
            edition: { select: { book: { select: { title: true } } } },
          },
        },
        member: { select: { fullName: true, membershipNumber: true } },
      },
    }),
  ]);

  return {
    activity: activity.map((a) => ({
      id: a.id,
      action: a.action,
      entityType: a.entityType,
      entityId: a.entityId,
      actor: a.user?.fullName ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    recentAdditions: additions.map((c) => ({
      id: c.id,
      accessionNumber: c.accessionNumber,
      title: c.edition.book.title,
      acquisitionType: c.acquisitionType,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
    })),
    dueLoans: dueLoans.map((l) => {
      const overdueMs = now.getTime() - l.dueAt.getTime();
      return {
        id: l.id,
        accessionNumber: l.copy.accessionNumber,
        title: l.copy.edition.book.title,
        // Member identity only for users allowed to see members.
        member: viewer.canReadMembers
          ? { fullName: l.member.fullName, membershipNumber: l.member.membershipNumber }
          : null,
        issuedAt: l.issuedAt.toISOString(),
        dueAt: l.dueAt.toISOString(),
        overdue: overdueMs > 0,
        daysOverdue: overdueMs > 0 ? Math.floor(overdueMs / 86_400_000) : 0,
      };
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Digitisation target (library-entered register total)
// ─────────────────────────────────────────────────────────────────────────────

export async function setRegisterTotal(
  registerTotal: number | null,
  userId: string,
  ctx: AuditRequestContext,
): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const before = await tx.setting.findUnique({ where: { key: SETTING_REGISTER_TOTAL } });
    if (registerTotal === null) {
      await tx.setting.deleteMany({ where: { key: SETTING_REGISTER_TOTAL } });
    } else {
      await tx.setting.upsert({
        where: { key: SETTING_REGISTER_TOTAL },
        update: { value: registerTotal, updatedById: userId },
        create: {
          key: SETTING_REGISTER_TOTAL,
          value: registerTotal,
          description: 'Number of items in the physical accession register (digitisation target)',
          updatedById: userId,
        },
      });
    }
    await recordAudit(
      {
        action: 'settings.updated',
        entityType: 'Setting',
        entityId: SETTING_REGISTER_TOTAL,
        before: { value: before?.value ?? null },
        after: { value: registerTotal },
      },
      ctx,
      tx,
    );
  });
}
