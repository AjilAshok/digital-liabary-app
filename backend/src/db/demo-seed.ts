/**
 * DEVELOPMENT / DEMO DATA ONLY.
 *
 * Builds a small, internally consistent library that exercises every relationship in the schema:
 * works with several editions, legacy and purchased copies in every status, a location hierarchy,
 * a received purchase, members with active/overdue/returned loans, a fine with a part payment,
 * reservations, an old-stock import batch, a completed stock audit and scan history.
 *
 * Every policy value below (loan periods, fines, accession prefixes, prices) is DEMO data, not a
 * library decision. Real policies are configured by the library (see docs/BUSINESS_RULES.md).
 */
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import { normalizeIsbn } from '../lib/isbn.js';
import { normalizeText } from '../lib/text.js';

type Tx = Prisma.TransactionClient;

const DAY = 86_400_000;
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY);
const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function isbn(raw: string) {
  const n = normalizeIsbn(raw);
  if (!n) throw new Error(`Demo seed contains an invalid ISBN: ${raw}`);
  return n;
}

export interface DemoSeedResult {
  skipped: boolean;
  reason?: string;
  counts?: Record<string, number>;
}

export async function seedDemoData(prisma: PrismaClient): Promise<DemoSeedResult> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to load demo data with NODE_ENV=production');
  }
  if ((await prisma.book.count()) > 0 || (await prisma.bookCopy.count()) > 0) {
    return { skipped: true, reason: 'Catalogue already contains data — demo seed not applied' };
  }
  const actor = await prisma.user.findFirst({
    where: { isActive: true, roles: { some: { role: { code: 'ADMIN' } } } },
    orderBy: { createdAt: 'asc' },
  });
  if (!actor) {
    throw new Error('No active ADMIN user found. Run `npm run db:seed` with SEED_ADMIN_* first.');
  }

  await prisma.$transaction(async (tx) => build(tx, actor.id), { timeout: 60_000 });

  const counts = {
    books: await prisma.book.count(),
    editions: await prisma.bookEdition.count(),
    copies: await prisma.bookCopy.count(),
    authors: await prisma.author.count(),
    members: await prisma.member.count(),
    loans: await prisma.loan.count(),
  };
  return { skipped: false, counts };
}

async function build(tx: Tx, actorId: string): Promise<void> {
  // ── Locations ──────────────────────────────────────────────────────────────
  const building = await tx.building.create({
    data: { code: 'MAIN', name: 'Main Library (demo)', address: 'Demo address' },
  });
  const ground = await tx.floor.create({
    data: { buildingId: building.id, code: 'G', name: 'Ground floor', level: 0 },
  });
  const first = await tx.floor.create({
    data: { buildingId: building.id, code: 'F1', name: 'First floor', level: 1 },
  });
  const reference = await tx.room.create({
    data: { floorId: ground.id, code: 'REF', name: 'Reference room' },
  });
  const stacks = await tx.room.create({
    data: { floorId: ground.id, code: 'GEN', name: 'General stacks' },
  });
  const children = await tx.room.create({
    data: { floorId: first.id, code: 'CHD', name: "Children's section" },
  });

  const shelves: Record<string, string> = {};
  for (const [room, rackCodes] of [
    [reference, ['R01']],
    [stacks, ['R01', 'R02']],
    [children, ['R01']],
  ] as const) {
    for (const rackCode of rackCodes) {
      const rack = await tx.rack.create({
        data: { roomId: room.id, code: rackCode, name: `Rack ${rackCode}` },
      });
      for (const shelfCode of ['S1', 'S2', 'S3']) {
        const shelf = await tx.shelf.create({
          data: { rackId: rack.id, code: shelfCode, capacity: 40 },
        });
        shelves[`${room.code}/${rackCode}/${shelfCode}`] = shelf.id;
      }
    }
  }
  const shelf = (path: string) => {
    const id = shelves[path];
    if (!id) throw new Error(`Unknown demo shelf ${path}`);
    return id;
  };

  // ── Categories & publishers ────────────────────────────────────────────────
  const cat = async (name: string, parentId?: string) =>
    (
      await tx.category.create({
        data: { name, normalizedName: normalizeText(name), parentId: parentId ?? null },
      })
    ).id;
  const fiction = await cat('Fiction');
  const classics = await cat('Classic Literature', fiction);
  const fantasy = await cat('Fantasy', fiction);
  const poetry = await cat('Poetry');
  const economics = await cat('Economics');

  const pub = async (name: string, place?: string) =>
    (await tx.publisher.create({ data: { name, normalizedName: normalizeText(name), place } })).id;
  const penguin = await pub('Penguin Classics', 'London');
  const plume = await pub('Plume', 'New York');
  const harper = await pub('Harper Perennial Modern Classics', 'New York');
  const scribner = await pub('Scribner', 'New York');
  const hmh = await pub('Houghton Mifflin Harcourt', 'Boston');
  const morrow = await pub('William Morrow', 'New York');
  const macmillan = await pub('Macmillan', 'London');
  const localPress = await pub('City Book House (demo legacy publisher)');

  // ── Authors (author numbers are demo Cutter-style codes) ───────────────────
  const author = async (
    name: string,
    authorNumber: string,
    birthYear?: number,
    deathYear?: number,
  ) =>
    (
      await tx.author.create({
        data: {
          name,
          normalizedName: normalizeText(name),
          authorNumber,
          sortName: name.split(' ').reverse().join(', '),
          birthYear,
          deathYear,
        },
      })
    ).id;
  const austen = await author('Jane Austen', 'A93', 1775, 1817);
  const orwell = await author('George Orwell', 'O79', 1903, 1950);
  const lee = await author('Harper Lee', 'L51', 1926, 2016);
  const fitzgerald = await author('F. Scott Fitzgerald', 'F57', 1896, 1940);
  const tolkien = await author('J. R. R. Tolkien', 'T65', 1892, 1973);
  const tagore = await author('Rabindranath Tagore', 'T13', 1861, 1941);
  const levitt = await author('Steven D. Levitt', 'L58', 1967);
  const dubner = await author('Stephen J. Dubner', 'D85', 1963);

  // ── Works and editions ─────────────────────────────────────────────────────
  const work = async (
    title: string,
    categoryId: string,
    authors: { id: string; role?: 'AUTHOR' | 'EDITOR' | 'TRANSLATOR' }[],
    extra: { subtitle?: string; description?: string; originalLanguage?: string } = {},
  ) =>
    (
      await tx.book.create({
        data: {
          title,
          normalizedTitle: normalizeText(title),
          categoryId,
          ...extra,
          authors: {
            create: authors.map((a, position) => ({
              authorId: a.id,
              role: a.role ?? 'AUTHOR',
              position,
            })),
          },
        },
      })
    ).id;

  const edition = async (
    bookId: string,
    data: Omit<Prisma.BookEditionUncheckedCreateInput, 'bookId'> & { isbnRaw?: string },
  ) => {
    const { isbnRaw, ...rest } = data;
    const ids = isbnRaw ? isbn(isbnRaw) : { isbn13: null, isbn10: null };
    return (
      await tx.bookEdition.create({
        data: { bookId, ...ids, language: 'en', ...rest },
      })
    ).id;
  };

  const prideBook = await work('Pride and Prejudice', classics, [{ id: austen }], {
    originalLanguage: 'en',
  });
  const pridePenguin = await edition(prideBook, {
    isbnRaw: '978-0-14-143951-8',
    publisherId: penguin,
    publicationYear: 2003,
    pageCount: 480,
    format: 'Paperback',
    metadataSource: 'MANUAL',
    verifiedAt: new Date(),
    verifiedById: actorId,
  });
  // A second, pre-ISBN edition of the same work — shows why editions are separate from works.
  const prideLegacy = await edition(prideBook, {
    publisherId: localPress,
    publicationYear: 1975,
    editionStatement: 'Reprint',
    format: 'Hardcover',
    metadataSource: 'IMPORT',
  });

  const book1984 = await work('Nineteen Eighty-Four', classics, [{ id: orwell }]);
  const ed1984 = await edition(book1984, {
    isbnRaw: '0-452-28423-6',
    publisherId: plume,
    publicationYear: 2003,
    pageCount: 339,
    format: 'Paperback',
    metadataSource: 'GOOGLE_BOOKS',
    externalSourceId: 'demo-volume-id',
    verifiedAt: new Date(),
    verifiedById: actorId,
  });

  const mockingbirdBook = await work('To Kill a Mockingbird', classics, [{ id: lee }]);
  const edMockingbird = await edition(mockingbirdBook, {
    isbnRaw: '9780061120084',
    publisherId: harper,
    publicationYear: 2006,
    pageCount: 336,
    format: 'Paperback',
  });

  const gatsbyBook = await work('The Great Gatsby', classics, [{ id: fitzgerald }]);
  const edGatsby = await edition(gatsbyBook, {
    isbnRaw: '9780743273565',
    publisherId: scribner,
    publicationYear: 2004,
    pageCount: 180,
    format: 'Paperback',
  });

  const hobbitBook = await work('The Hobbit', fantasy, [{ id: tolkien }], {
    subtitle: 'or There and Back Again',
  });
  const edHobbit = await edition(hobbitBook, {
    isbnRaw: '978-0-547-92822-7',
    publisherId: hmh,
    publicationYear: 2012,
    pageCount: 300,
    format: 'Paperback',
    metadataSource: 'OPEN_LIBRARY',
  });

  // Co-authored work: one title, two authors.
  const freakBook = await work('Freakonomics', economics, [{ id: levitt }, { id: dubner }], {
    subtitle: 'A Rogue Economist Explores the Hidden Side of Everything',
  });
  const edFreak = await edition(freakBook, {
    isbnRaw: '9780060731328',
    publisherId: morrow,
    publicationYear: 2005,
    pageCount: 242,
    format: 'Hardcover',
  });

  // Legacy book with no ISBN at all.
  const gitanjaliBook = await work('Gitanjali', poetry, [{ id: tagore }], {
    subtitle: 'Song Offerings',
  });
  const edGitanjali = await edition(gitanjaliBook, {
    publisherId: macmillan,
    publicationYear: 1913,
    format: 'Hardcover',
    metadataSource: 'IMPORT',
  });

  // ── Supplier & received purchase ───────────────────────────────────────────
  const supplier = await tx.supplier.create({
    data: {
      name: 'Demo Book Distributors',
      normalizedName: normalizeText('Demo Book Distributors'),
      contactName: 'Demo Contact',
      email: 'orders@example.com',
    },
  });
  const purchase = await tx.purchase.create({
    data: {
      supplierId: supplier.id,
      invoiceNumber: 'DEMO-INV-0001',
      invoiceDate: dateOnly('2026-10-01'),
      orderDate: dateOnly('2026-09-20'),
      status: 'RECEIVED',
      subtotal: '62.00',
      taxTotal: '0.00',
      totalAmount: '62.00',
      createdById: actorId,
      receivedAt: daysFromNow(-40),
      notes: 'Demo purchase — prices are illustrative',
    },
  });
  const line = async (editionId: string, quantity: number, unitPrice: string) =>
    (
      await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          editionId,
          quantity,
          receivedQuantity: quantity,
          unitPrice,
          lineTotal: (Number(unitPrice) * quantity).toFixed(2),
        },
      })
    ).id;
  const lineHobbit = await line(edHobbit, 2, '14.00');
  const lineFreak = await line(edFreak, 1, '18.00');
  const lineGatsby = await line(edGatsby, 1, '16.00');

  // ── Copies ─────────────────────────────────────────────────────────────────
  type CopySpec = {
    accession: string;
    editionId: string;
    acquisitionType: 'LEGACY_OLD_STOCK' | 'PURCHASED_NEW' | 'DONATED';
    shelfPath: string | null;
    status?: Prisma.BookCopyUncheckedCreateInput['status'];
    condition?: Prisma.BookCopyUncheckedCreateInput['condition'];
    price?: string;
    acquired?: string;
    purchaseItemId?: string;
    remarks?: string;
    archived?: boolean;
  };
  const copyIds: Record<string, string> = {};
  const copy = async (spec: CopySpec) => {
    const created = await tx.bookCopy.create({
      data: {
        accessionNumber: spec.accession,
        barcode: spec.accession,
        editionId: spec.editionId,
        acquisitionType: spec.acquisitionType,
        acquisitionDate: spec.acquired ? dateOnly(spec.acquired) : null,
        acquisitionPrice: spec.price ?? null,
        supplierId: spec.purchaseItemId ? supplier.id : null,
        purchaseItemId: spec.purchaseItemId ?? null,
        shelfId: spec.shelfPath ? shelf(spec.shelfPath) : null,
        status: spec.status ?? 'AVAILABLE',
        condition: spec.condition ?? 'GOOD',
        remarks: spec.remarks ?? null,
        archivedAt: spec.archived ? new Date() : null,
      },
    });
    await tx.copyHistory.create({
      data: {
        copyId: created.id,
        eventType: 'CREATED',
        toStatus: created.status,
        toCondition: created.condition,
        toShelfId: created.shelfId,
        reason: 'Demo seed',
        changedById: actorId,
      },
    });
    copyIds[spec.accession] = created.id;
    return created.id;
  };

  // Legacy register stock (plain register numbers, as old registers often use).
  await copy({
    accession: '1001',
    editionId: prideLegacy,
    acquisitionType: 'LEGACY_OLD_STOCK',
    shelfPath: 'GEN/R01/S1',
    condition: 'FAIR',
    acquired: '1978-06-12',
  });
  await copy({
    accession: '1002',
    editionId: prideLegacy,
    acquisitionType: 'LEGACY_OLD_STOCK',
    shelfPath: 'GEN/R01/S1',
    status: 'DAMAGED',
    condition: 'DAMAGED',
    remarks: 'Spine detached',
  });
  await copy({
    accession: '1003',
    editionId: edGitanjali,
    acquisitionType: 'LEGACY_OLD_STOCK',
    shelfPath: 'REF/R01/S1',
    condition: 'POOR',
    remarks: 'Rare — reference only',
  });
  await copy({
    accession: '1004',
    editionId: ed1984,
    acquisitionType: 'LEGACY_OLD_STOCK',
    shelfPath: 'GEN/R01/S2',
    status: 'ISSUED',
  });
  await copy({
    accession: '1005',
    editionId: ed1984,
    acquisitionType: 'LEGACY_OLD_STOCK',
    shelfPath: 'GEN/R01/S2',
    status: 'MISSING',
    remarks: 'Not found in last stock audit',
  });
  await copy({
    accession: '1006',
    editionId: edMockingbird,
    acquisitionType: 'LEGACY_OLD_STOCK',
    shelfPath: 'GEN/R01/S3',
    status: 'UNDER_REPAIR',
    condition: 'POOR',
  });
  await copy({
    accession: '1007',
    editionId: edMockingbird,
    acquisitionType: 'LEGACY_OLD_STOCK',
    shelfPath: 'GEN/R01/S3',
  });
  await copy({
    accession: '1008',
    editionId: prideLegacy,
    acquisitionType: 'LEGACY_OLD_STOCK',
    shelfPath: null,
    status: 'DISCARDED',
    condition: 'DAMAGED',
    remarks: 'Water damage — withdrawn',
    archived: true,
  });
  await copy({
    accession: '1009',
    editionId: pridePenguin,
    acquisitionType: 'DONATED',
    shelfPath: null,
    status: 'PENDING_VERIFICATION',
    remarks: 'Donated; awaiting shelving',
  });

  // Newly purchased stock (demo accession prefix).
  await copy({
    accession: 'DEMO-00001',
    editionId: edHobbit,
    acquisitionType: 'PURCHASED_NEW',
    shelfPath: 'CHD/R01/S1',
    price: '14.00',
    acquired: '2026-10-05',
    purchaseItemId: lineHobbit,
    condition: 'NEW',
    status: 'RESERVED',
  });
  await copy({
    accession: 'DEMO-00002',
    editionId: edHobbit,
    acquisitionType: 'PURCHASED_NEW',
    shelfPath: 'CHD/R01/S1',
    price: '14.00',
    acquired: '2026-10-05',
    purchaseItemId: lineHobbit,
    condition: 'NEW',
    status: 'ISSUED',
  });
  await copy({
    accession: 'DEMO-00003',
    editionId: edFreak,
    acquisitionType: 'PURCHASED_NEW',
    shelfPath: 'GEN/R02/S1',
    price: '18.00',
    acquired: '2026-10-05',
    purchaseItemId: lineFreak,
    condition: 'NEW',
  });
  await copy({
    accession: 'DEMO-00004',
    editionId: edGatsby,
    acquisitionType: 'PURCHASED_NEW',
    shelfPath: 'GEN/R02/S2',
    price: '16.00',
    acquired: '2026-10-05',
    purchaseItemId: lineGatsby,
    condition: 'NEW',
  });

  // Next generated demo accession number continues after the purchased copies.
  await tx.numberSequence.create({
    data: { key: 'ACCESSION', prefix: 'DEMO-', nextValue: 5, padding: 5 },
  });

  // ── Members, loans, renewals, fines, reservations ─────────────────────────
  const student = await tx.memberType.create({
    data: {
      code: 'DEMO_STUDENT',
      name: 'Student (demo policy)',
      maxActiveLoans: 3,
      loanPeriodDays: 14,
      maxRenewals: 1,
      gracePeriodDays: 2,
      finePerDay: '0.50',
      maxUnpaidFines: '10.00',
      reservationHoldDays: 3,
    },
  });
  const staff = await tx.memberType.create({
    data: {
      code: 'DEMO_STAFF',
      name: 'Staff (demo policy)',
      maxActiveLoans: 8,
      loanPeriodDays: 28,
      maxRenewals: 2,
      gracePeriodDays: 0,
      finePerDay: '0.00',
      reservationHoldDays: 5,
    },
  });
  const member = async (
    n: number,
    fullName: string,
    typeId: string,
    extra: Partial<Prisma.MemberUncheckedCreateInput> = {},
  ) =>
    (
      await tx.member.create({
        data: {
          membershipNumber: `DEMO-M${String(n).padStart(4, '0')}`,
          memberTypeId: typeId,
          fullName,
          email: `member${n}@example.com`,
          joinedAt: dateOnly('2025-07-01'),
          expiresAt: dateOnly('2027-06-30'),
          ...extra,
        },
      })
    ).id;
  const asha = await member(1, 'Asha Varghese', student.id);
  const ben = await member(2, 'Ben Okafor', student.id);
  const chen = await member(3, 'Chen Li', staff.id);
  await member(4, 'Dana Ruiz', student.id, {
    status: 'SUSPENDED',
    notes: 'Demo: suspended member',
  });

  // Active, on time.
  await tx.loan.create({
    data: {
      copyId: copyIds['DEMO-00002']!,
      memberId: chen,
      issuedAt: daysFromNow(-5),
      dueAt: daysFromNow(23),
      issuedById: actorId,
    },
  });
  // Active and overdue.
  await tx.loan.create({
    data: {
      copyId: copyIds['1004']!,
      memberId: ben,
      issuedAt: daysFromNow(-30),
      dueAt: daysFromNow(-16),
      issuedById: actorId,
    },
  });
  // Returned late after one renewal → fine with part payment.
  const returned = await tx.loan.create({
    data: {
      copyId: copyIds['1007']!,
      memberId: asha,
      status: 'RETURNED',
      issuedAt: daysFromNow(-60),
      dueAt: daysFromNow(-32),
      returnedAt: daysFromNow(-26),
      renewalCount: 1,
      returnCondition: 'GOOD',
      issuedById: actorId,
      returnedById: actorId,
    },
  });
  await tx.loanRenewal.create({
    data: {
      loanId: returned.id,
      previousDueAt: daysFromNow(-46),
      newDueAt: daysFromNow(-32),
      renewedById: actorId,
    },
  });
  const fine = await tx.fine.create({
    data: {
      memberId: asha,
      loanId: returned.id,
      amount: '2.00',
      paidAmount: '1.00',
      reason: 'Overdue return (demo: 4 days after grace × 0.50)',
      status: 'PARTIALLY_PAID',
      assessedAt: daysFromNow(-26),
    },
  });
  await tx.finePayment.create({
    data: {
      fineId: fine.id,
      kind: 'PAYMENT',
      amount: '1.00',
      method: 'Cash',
      recordedById: actorId,
      recordedAt: daysFromNow(-20),
    },
  });

  // Hold ready for pickup (copy DEMO-00001 is RESERVED) and a queued reservation.
  await tx.reservation.create({
    data: {
      editionId: edHobbit,
      memberId: asha,
      status: 'READY_FOR_PICKUP',
      assignedCopyId: copyIds['DEMO-00001']!,
      reservedAt: daysFromNow(-3),
      readyAt: daysFromNow(-1),
      expiresAt: daysFromNow(2),
    },
  });
  await tx.reservation.create({
    data: { editionId: ed1984, memberId: chen, status: 'PENDING', reservedAt: daysFromNow(-2) },
  });

  // ── Old-stock import batch ─────────────────────────────────────────────────
  const batch = await tx.importBatch.create({
    data: {
      fileName: 'legacy-register-demo.xlsx',
      fileSizeBytes: 18_432,
      fileSha256: '0'.repeat(64),
      profile: 'LEGACY_REGISTER',
      status: 'COMPLETED',
      totalRows: 4,
      validRows: 2,
      invalidRows: 1,
      duplicateRows: 1,
      importedRows: 2,
      createdById: actorId,
      confirmedAt: daysFromNow(-50),
      completedAt: daysFromNow(-50),
      summary: { note: 'Demo batch' },
    },
  });
  await tx.importRow.createMany({
    data: [
      {
        batchId: batch.id,
        rowNumber: 2,
        rawData: {
          AccessionNumber: '1001',
          Title: 'Pride and Prejudice',
          AuthorName: 'Jane Austen',
        },
        status: 'IMPORTED',
        createdCopyId: copyIds['1001']!,
      },
      {
        batchId: batch.id,
        rowNumber: 3,
        rawData: { AccessionNumber: '1003', Title: 'Gitanjali', AuthorName: 'Rabindranath Tagore' },
        status: 'IMPORTED',
        createdCopyId: copyIds['1003']!,
      },
      {
        batchId: batch.id,
        rowNumber: 4,
        rawData: { AccessionNumber: '1001', Title: 'Pride & Prejudice' },
        status: 'DUPLICATE',
        duplicateOfCopyId: copyIds['1001']!,
        warnings: [{ field: 'AccessionNumber', message: 'Accession 1001 already exists' }],
      },
      {
        batchId: batch.id,
        rowNumber: 5,
        rawData: { AccessionNumber: '', Title: '' },
        status: 'INVALID',
        errors: [
          { field: 'AccessionNumber', message: 'Required' },
          { field: 'Title', message: 'Required' },
        ],
      },
    ],
  });

  // ── Completed stock audit of one rack ──────────────────────────────────────
  const audit = await tx.stockAudit.create({
    data: {
      name: 'Demo audit — General stacks rack R01',
      scopeType: 'RACK',
      scopeId: (await tx.rack.findFirstOrThrow({ where: { roomId: stacks.id, code: 'R01' } })).id,
      status: 'COMPLETED',
      startedById: actorId,
      startedAt: daysFromNow(-10),
      completedById: actorId,
      completedAt: daysFromNow(-10),
      summary: { found: 2, misplaced: 1, unknown: 1, notFound: ['1005'] },
    },
  });
  await tx.stockAuditItem.createMany({
    data: [
      {
        auditId: audit.id,
        copyId: copyIds['1001']!,
        scannedValue: '1001',
        result: 'FOUND',
        expectedShelfId: shelf('GEN/R01/S1'),
        foundShelfId: shelf('GEN/R01/S1'),
        scannedById: actorId,
      },
      {
        auditId: audit.id,
        copyId: copyIds['1007']!,
        scannedValue: '1007',
        result: 'FOUND',
        expectedShelfId: shelf('GEN/R01/S3'),
        foundShelfId: shelf('GEN/R01/S3'),
        scannedById: actorId,
      },
      {
        auditId: audit.id,
        copyId: copyIds['1006']!,
        scannedValue: '1006',
        result: 'MISPLACED',
        expectedShelfId: shelf('GEN/R01/S3'),
        foundShelfId: shelf('GEN/R01/S1'),
        scannedById: actorId,
      },
      {
        auditId: audit.id,
        scannedValue: 'X-77',
        result: 'UNKNOWN_BARCODE',
        foundShelfId: shelf('GEN/R01/S2'),
        scannedById: actorId,
      },
    ],
  });

  // ── Scan history ───────────────────────────────────────────────────────────
  await tx.scanLog.createMany({
    data: [
      {
        userId: actorId,
        mode: 'ISBN_BARCODE',
        rawValue: '9780547928227',
        normalizedIsbn: '9780547928227',
        outcome: 'LOCAL_MATCH',
        editionId: edHobbit,
      },
      {
        userId: actorId,
        mode: 'ISBN_BARCODE',
        rawValue: '9780000000000',
        outcome: 'INVALID_INPUT',
      },
      {
        userId: actorId,
        mode: 'COVER_OCR',
        outcome: 'NO_MATCH',
        provider: 'demo',
        confidence: 0.42,
      },
    ],
  });

  await tx.auditLog.create({
    data: {
      userId: actorId,
      action: 'demo.seed',
      entityType: 'Database',
      metadata: { note: 'Development demo data loaded' },
    },
  });
}
