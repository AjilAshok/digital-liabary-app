import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDemoData } from '../../src/db/demo-seed.js';
import { disconnectPrisma, getPrisma } from '../../src/db/prisma.js';
import { ensureUser, seedAccessControl } from '../../src/db/seed-core.js';
import { resetDomainData } from '../helpers/reset-domain.js';

const prisma = getPrisma();
let adminId: string;

/** Runs a statement inside a transaction that is always rolled back; returns the error, if any. */
async function attempt(sql: string, ...params: unknown[]): Promise<Error | null> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql, ...params);
      throw new RollbackSignal();
    });
  } catch (err) {
    if (err instanceof RollbackSignal) return null;
    return err as Error;
  }
  return null;
}
class RollbackSignal extends Error {}

const id = async (table: string, where: string): Promise<string> => {
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id::text FROM "${table}" WHERE ${where} LIMIT 1`,
  );
  if (!rows[0]) throw new Error(`No row in ${table} where ${where}`);
  return rows[0].id;
};

beforeAll(async () => {
  await resetDomainData(prisma);
  await seedAccessControl(prisma);
  adminId = (
    await ensureUser(prisma, {
      email: 'schema-admin@test.local',
      password: 'Schema-Admin-2026',
      fullName: 'Schema Admin',
      roleCode: 'ADMIN',
    })
  ).id;
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('demo seed', () => {
  it('loads a consistent demo library', async () => {
    const result = await seedDemoData(prisma);
    expect(result.skipped).toBe(false);
    expect(result.counts).toMatchObject({
      books: 7,
      editions: 8,
      copies: 13,
      authors: 8,
      members: 4,
      loans: 3,
    });
  });

  it('is not applied twice', async () => {
    const again = await seedDemoData(prisma);
    expect(again.skipped).toBe(true);
    expect(await prisma.bookCopy.count()).toBe(13);
  });
});

describe('works, editions and copies', () => {
  it('keeps one work with several editions and derives stock from copies', async () => {
    const pride = await prisma.book.findFirstOrThrow({
      where: { normalizedTitle: 'pride and prejudice' },
      include: { editions: { include: { _count: { select: { copies: true } } } } },
    });
    expect(pride.editions).toHaveLength(2);
    expect(pride.editions.reduce((n, e) => n + e._count.copies, 0)).toBe(4);
  });

  it('links one work to several authors in order', async () => {
    const freak = await prisma.book.findFirstOrThrow({
      where: { normalizedTitle: 'freakonomics' },
      include: { authors: { include: { author: true }, orderBy: { position: 'asc' } } },
    });
    expect(freak.authors.map((a) => a.author.authorNumber)).toEqual(['L58', 'D85']);
  });

  it('rejects a duplicate accession number', async () => {
    const editionId = await id('book_editions', `"isbn13" = '9780547928227'`);
    await expect(
      prisma.bookCopy.create({
        data: { accessionNumber: '1001', editionId, acquisitionType: 'LEGACY_OLD_STOCK' },
      }),
    ).rejects.toThrow();
  });

  it('rejects a blank accession number', async () => {
    const editionId = await id('book_editions', `"isbn13" = '9780547928227'`);
    const err = await attempt(
      `INSERT INTO book_copies (id, "accessionNumber", "editionId", "acquisitionType", "updatedAt")
       VALUES (gen_random_uuid(), '   ', $1::uuid, 'OTHER', now())`,
      editionId,
    );
    expect(err?.message).toMatch(/book_copies_identifiers_chk/);
  });

  it('rejects a duplicate author number but allows many authors without one', async () => {
    await expect(
      prisma.author.create({ data: { name: 'X', normalizedName: 'x', authorNumber: 'A93' } }),
    ).rejects.toThrow();
    const a = await prisma.author.create({ data: { name: 'Anon 1', normalizedName: 'anon 1' } });
    const b = await prisma.author.create({ data: { name: 'Anon 2', normalizedName: 'anon 2' } });
    expect(a.authorNumber).toBeNull();
    expect(b.authorNumber).toBeNull();
  });

  it('accepts a shared ISBN across editions (legacy data) but rejects malformed ISBNs', async () => {
    const bookId = await id('books', `"normalizedTitle" = 'the hobbit'`);
    const dup = await prisma.bookEdition.create({ data: { bookId, isbn13: '9780547928227' } });
    expect(dup.id).toBeTruthy();
    const err = await attempt(
      `UPDATE book_editions SET "isbn13" = '12345' WHERE id = $1::uuid`,
      dup.id,
    );
    expect(err?.message).toMatch(/book_editions_isbn_format_chk/);
  });

  it('refuses to delete an edition that has physical copies (history is preserved)', async () => {
    const editionId = await id('book_editions', `"isbn13" = '9780061120084'`);
    await expect(prisma.bookEdition.delete({ where: { id: editionId } })).rejects.toThrow();
  });
});

describe('location hierarchy', () => {
  it('allows the same shelf code on different racks but not twice on one rack', async () => {
    const rackId = await id('racks', `code = 'R02'`);
    await expect(prisma.shelf.create({ data: { rackId, code: 'S1' } })).rejects.toThrow();
    const created = await prisma.shelf.create({ data: { rackId, code: 'S9' } });
    expect(created.code).toBe('S9');
  });

  it('resolves a copy to its full building › floor › room › rack › shelf path', async () => {
    const copy = await prisma.bookCopy.findUniqueOrThrow({
      where: { accessionNumber: 'DEMO-00003' },
      include: {
        shelf: {
          include: {
            rack: { include: { room: { include: { floor: { include: { building: true } } } } } },
          },
        },
      },
    });
    const s = copy.shelf!;
    expect([
      s.rack.room.floor.building.code,
      s.rack.room.floor.code,
      s.rack.room.code,
      s.rack.code,
      s.code,
    ]).toEqual(['MAIN', 'G', 'GEN', 'R02', 'S1']);
  });
});

describe('purchases', () => {
  it('links received copies back to purchase lines and the supplier', async () => {
    const purchase = await prisma.purchase.findFirstOrThrow({
      where: { invoiceNumber: 'DEMO-INV-0001' },
      include: { items: { include: { copies: true } } },
    });
    const copies = purchase.items.flatMap((i) => i.copies);
    expect(copies).toHaveLength(4);
    expect(copies.every((c) => c.supplierId === purchase.supplierId)).toBe(true);
    expect(copies.every((c) => c.acquisitionType === 'PURCHASED_NEW')).toBe(true);
  });

  it('rejects receiving more than was ordered', async () => {
    const itemId = await id('purchase_items', `quantity = 1`);
    const err = await attempt(
      `UPDATE purchase_items SET "receivedQuantity" = 2 WHERE id = $1::uuid`,
      itemId,
    );
    expect(err?.message).toMatch(/purchase_items_amounts_chk/);
  });
});

describe('circulation', () => {
  it('allows only one ACTIVE loan per copy (partial unique index)', async () => {
    const copyId = await id('book_copies', `"accessionNumber" = '1004'`); // already issued
    const memberId = await id('members', `"membershipNumber" = 'DEMO-M0001'`);
    await expect(
      prisma.loan.create({
        data: { copyId, memberId, issuedById: adminId, dueAt: new Date(Date.now() + 86_400_000) },
      }),
    ).rejects.toThrow();
  });

  it('allows many historical (RETURNED) loans for the same copy', async () => {
    const copyId = await id('book_copies', `"accessionNumber" = '1007'`);
    const memberId = await id('members', `"membershipNumber" = 'DEMO-M0002'`);
    const now = Date.now();
    await prisma.loan.create({
      data: {
        copyId,
        memberId,
        issuedById: adminId,
        status: 'RETURNED',
        issuedAt: new Date(now - 10 * 86_400_000),
        dueAt: new Date(now - 3 * 86_400_000),
        returnedAt: new Date(now - 4 * 86_400_000),
      },
    });
    expect(await prisma.loan.count({ where: { copyId } })).toBe(2);
  });

  it('requires returnedAt to match the loan status', async () => {
    const loanId = await id('loans', `status = 'ACTIVE'`);
    const err = await attempt(`UPDATE loans SET status = 'RETURNED' WHERE id = $1::uuid`, loanId);
    expect(err?.message).toMatch(/loans_status_chk/);
  });

  it('allows one open reservation per member and edition', async () => {
    const editionId = await id('book_editions', `"isbn13" = '9780452284234'`);
    const memberId = await id('members', `"membershipNumber" = 'DEMO-M0003'`); // already PENDING
    await expect(prisma.reservation.create({ data: { editionId, memberId } })).rejects.toThrow();
  });

  it('holds a copy for only one reservation at a time', async () => {
    const editionId = await id('book_editions', `"isbn13" = '9780547928227'`);
    const memberId = await id('members', `"membershipNumber" = 'DEMO-M0002'`);
    const copyId = await id('book_copies', `"accessionNumber" = 'DEMO-00001'`); // already held
    await expect(
      prisma.reservation.create({
        data: { editionId, memberId, status: 'READY_FOR_PICKUP', assignedCopyId: copyId },
      }),
    ).rejects.toThrow();
  });

  it('keeps fine payments as history and caps paidAmount at the fine amount', async () => {
    const fine = await prisma.fine.findFirstOrThrow({ include: { payments: true } });
    expect(fine.payments).toHaveLength(1);
    const err = await attempt(
      `UPDATE fines SET "paidAmount" = "amount" + 1 WHERE id = $1::uuid`,
      fine.id,
    );
    expect(err?.message).toMatch(/fines_amounts_chk/);
  });

  it('rejects a member-type policy with a zero loan period', async () => {
    const err = await attempt(`UPDATE member_types SET "loanPeriodDays" = 0`);
    expect(err?.message).toMatch(/member_types_policy_chk/);
  });
});

describe('imports, audits and history', () => {
  it('links imported rows to created copies and duplicate rows to the existing copy', async () => {
    const rows = await prisma.importRow.findMany({
      orderBy: { rowNumber: 'asc' },
      include: { createdCopy: true, duplicateOfCopy: true },
    });
    expect(rows.map((r) => r.status)).toEqual(['IMPORTED', 'IMPORTED', 'DUPLICATE', 'INVALID']);
    expect(rows[0]!.createdCopy?.accessionNumber).toBe('1001');
    expect(rows[2]!.duplicateOfCopy?.accessionNumber).toBe('1001');
  });

  it('requires a scope id for non-library stock audits', async () => {
    const err = await attempt(`UPDATE stock_audits SET "scopeId" = NULL`);
    expect(err?.message).toMatch(/stock_audits_scope_chk/);
  });

  it('records a CREATED history event for every copy', async () => {
    const created = await prisma.copyHistory.count({ where: { eventType: 'CREATED' } });
    expect(created).toBe(13);
  });

  it('supports partial title search through the trigram index', async () => {
    const rows = await prisma.$queryRaw<{ title: string }[]>`
      SELECT title FROM books WHERE "normalizedTitle" ILIKE ${'%hobb%'}`;
    expect(rows.map((r) => r.title)).toEqual(['The Hobbit']);
    const fuzzy = await prisma.$queryRaw<{ title: string }[]>`
      SELECT title FROM books ORDER BY similarity("normalizedTitle", ${'gret gatsby'}) DESC LIMIT 1`;
    expect(fuzzy[0]?.title).toBe('The Great Gatsby');
  });
});
