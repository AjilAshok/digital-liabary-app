import { getPrisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError, Errors } from '../../lib/errors.js';
import { paginated, toSkipTake } from '../../lib/pagination.js';
import { recordAudit, type AuditRequestContext } from '../audit/audit.service.js';
import { allocateAccessionNumbers } from '../settings/accession.js';
import type { CopyListQuery, RegisterCopiesInput, UpdateCopyInput } from './catalogue.schemas.js';
import { checkStatusTransition } from './copy-rules.js';

type Tx = Prisma.TransactionClient;

const shelfInclude = {
  include: { rack: { include: { room: { include: { floor: { include: { building: true } } } } } } },
} as const;

type ShelfWithPath = Prisma.ShelfGetPayload<typeof shelfInclude>;

export function shelfPath(
  s: ShelfWithPath | null | undefined,
): { id: string; path: string } | null {
  if (!s) return null;
  const room = s.rack.room;
  return {
    id: s.id,
    path: [room.floor.building.code, room.floor.code, room.code, s.rack.code, s.code].join(' / '),
  };
}

async function assertShelf(
  db: Tx,
  shelfId: string | null | undefined,
  additionalCopies = 0,
  excludeCopyId?: string,
  path = 'shelfId',
) {
  if (!shelfId) return;
  const locked = await db.$queryRaw<{ id: string }[]>`
    SELECT id::text FROM shelves WHERE id = ${shelfId}::uuid AND "archivedAt" IS NULL FOR UPDATE`;
  if (locked.length === 0) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', [
      { path, message: 'Shelf not found', code: 'custom' },
    ]);
  }
  const shelf = await db.shelf.findFirst({
    where: { id: shelfId, archivedAt: null },
    include: {
      rack: { include: { room: { include: { floor: { include: { building: true } } } } } },
    },
  });
  if (!shelf) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', [
      { path, message: 'Shelf not found', code: 'custom' },
    ]);
  }
  if (
    shelf.rack.archivedAt ||
    shelf.rack.room.archivedAt ||
    shelf.rack.room.floor.archivedAt ||
    shelf.rack.room.floor.building.archivedAt
  ) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', [
      { path, message: 'Shelf is under an inactive location', code: 'custom' },
    ]);
  }
  if (shelf.capacity === null) return;
  const occupied = await db.bookCopy.count({
    where: {
      shelfId,
      archivedAt: null,
      status: { not: 'DISCARDED' },
      ...(excludeCopyId ? { id: { not: excludeCopyId } } : {}),
    },
  });
  if (occupied + additionalCopies > shelf.capacity) {
    throw new AppError(
      409,
      'SHELF_CAPACITY_REACHED',
      `Shelf capacity is ${shelf.capacity} copies and ${occupied} are currently assigned`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Registers `quantity` physical copies of an existing edition — never a new title.
 * Every copy gets its own unique accession number (generated under a row lock, or entered).
 */
export async function registerCopies(
  editionId: string,
  input: RegisterCopiesInput,
  ctx: AuditRequestContext,
) {
  const prisma = getPrisma();
  const edition = await prisma.bookEdition.findFirst({
    where: { id: editionId, archivedAt: null, book: { archivedAt: null } },
    select: { id: true, bookId: true },
  });
  if (!edition) throw Errors.notFound('Edition not found');

  if (input.accessionMode === 'manual') {
    const requested = input.accessionNumbers!;
    const existing = await prisma.bookCopy.findMany({
      where: { accessionNumber: { in: requested, mode: 'insensitive' } },
      select: { accessionNumber: true },
    });
    if (existing.length > 0) {
      throw new AppError(
        409,
        'DUPLICATE_ACCESSION',
        `Accession number${existing.length === 1 ? '' : 's'} already in use: ${existing.map((e) => e.accessionNumber).join(', ')}`,
        { accessionNumbers: existing.map((e) => e.accessionNumber) },
      );
    }
  }

  const created = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('LOCK TABLE book_copies IN SHARE ROW EXCLUSIVE MODE');
      await assertShelf(tx, input.shelfId, input.quantity);
      const numbers =
        input.accessionMode === 'auto'
          ? await allocateAccessionNumbers(tx, input.quantity)
          : input.accessionNumbers!;

      const clashes = await tx.bookCopy.findMany({
        where: {
          OR: numbers.flatMap((number) => [
            { accessionNumber: { equals: number, mode: 'insensitive' as const } },
            { barcode: { equals: number, mode: 'insensitive' as const } },
          ]),
        },
        select: { accessionNumber: true },
      });
      if (clashes.length)
        throw new AppError(
          409,
          'DUPLICATE_ACCESSION',
          'An accession number or barcode is already in use',
          { accessionNumbers: clashes.map((copy) => copy.accessionNumber) },
        );

      const copies = [];
      for (const accessionNumber of numbers) {
        const copy = await tx.bookCopy.create({
          data: {
            accessionNumber,
            barcode: accessionNumber, // labels encode the accession number, never the ISBN
            editionId,
            acquisitionType: input.acquisitionType,
            acquisitionDate: input.acquisitionDate,
            acquisitionPrice: input.acquisitionPrice,
            condition: input.condition,
            status: input.status,
            shelfId: input.shelfId,
            remarks: input.remarks,
          },
        });
        await tx.copyHistory.create({
          data: {
            copyId: copy.id,
            eventType: 'CREATED',
            toStatus: copy.status,
            toCondition: copy.condition,
            toShelfId: copy.shelfId,
            reason: 'Registered',
            changedById: ctx.userId ?? null,
          },
        });
        copies.push(copy);
      }
      await recordAudit(
        {
          action: 'copies.registered',
          entityType: 'BookEdition',
          entityId: editionId,
          after: {
            accessionNumbers: numbers,
            acquisitionType: input.acquisitionType,
            status: input.status,
            shelfId: input.shelfId,
          },
        },
        ctx,
        tx,
      );
      return copies;
    },
    { timeout: 30_000 },
  );

  return {
    bookId: edition.bookId,
    editionId,
    copies: created.map((c) => ({
      id: c.id,
      accessionNumber: c.accessionNumber,
      status: c.status,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export async function listCopies(q: CopyListQuery) {
  const prisma = getPrisma();
  const conditions: Prisma.BookCopyWhereInput[] = [];
  if (q.includeDiscarded === 'false') {
    conditions.push({ archivedAt: null, status: { not: 'DISCARDED' } });
  }
  if (q.bookId) conditions.push({ edition: { bookId: q.bookId } });
  if (q.editionId) conditions.push({ editionId: q.editionId });
  if (q.status) conditions.push({ status: q.status });
  if (q.condition) conditions.push({ condition: q.condition });
  if (q.acquisitionType) conditions.push({ acquisitionType: q.acquisitionType });
  if (q.stock === 'old') conditions.push({ acquisitionType: 'LEGACY_OLD_STOCK' });
  if (q.stock === 'new') conditions.push({ acquisitionType: 'PURCHASED_NEW' });
  if (q.shelfId) conditions.push({ shelfId: q.shelfId });
  if (q.unshelved === 'true') conditions.push({ shelfId: null });
  if (q.search) {
    conditions.push({
      OR: [
        { accessionNumber: { contains: q.search, mode: 'insensitive' } },
        { edition: { book: { title: { contains: q.search, mode: 'insensitive' } } } },
        { edition: { isbn13: { contains: q.search.replace(/[\s-]/g, '') } } },
        {
          edition: {
            book: {
              authors: { some: { author: { name: { contains: q.search, mode: 'insensitive' } } } },
            },
          },
        },
        {
          edition: {
            book: {
              authors: {
                some: { author: { authorNumber: { contains: q.search, mode: 'insensitive' } } },
              },
            },
          },
        },
        { shelf: { code: { contains: q.search, mode: 'insensitive' } } },
        { shelf: { rack: { code: { contains: q.search, mode: 'insensitive' } } } },
      ],
    });
  }
  const where: Prisma.BookCopyWhereInput = { AND: conditions };
  const orderBy: Prisma.BookCopyOrderByWithRelationInput =
    q.sort === 'accessionNumber'
      ? { accessionNumber: 'asc' }
      : q.sort === '-accessionNumber'
        ? { accessionNumber: 'desc' }
        : q.sort === 'createdAt'
          ? { createdAt: 'asc' }
          : { createdAt: 'desc' };

  const [rows, total] = await prisma.$transaction([
    prisma.bookCopy.findMany({
      where,
      orderBy: [orderBy, { id: 'asc' }],
      ...toSkipTake(q),
      include: {
        shelf: shelfInclude,
        edition: {
          select: {
            id: true,
            isbn13: true,
            editionStatement: true,
            publicationYear: true,
            book: {
              select: {
                id: true,
                title: true,
                authors: {
                  orderBy: { position: 'asc' },
                  select: { author: { select: { name: true, authorNumber: true } } },
                },
              },
            },
          },
        },
      },
    }),
    prisma.bookCopy.count({ where }),
  ]);

  return paginated(
    rows.map((c) => ({
      id: c.id,
      accessionNumber: c.accessionNumber,
      status: c.status,
      condition: c.condition,
      acquisitionType: c.acquisitionType,
      acquisitionDate: c.acquisitionDate?.toISOString().slice(0, 10) ?? null,
      acquisitionPrice: c.acquisitionPrice?.toFixed(2) ?? null,
      shelf: shelfPath(c.shelf),
      edition: {
        id: c.edition.id,
        isbn13: c.edition.isbn13,
        editionStatement: c.edition.editionStatement,
        publicationYear: c.edition.publicationYear,
      },
      book: {
        id: c.edition.book.id,
        title: c.edition.book.title,
        authors: c.edition.book.authors.map(({ author }) => author),
      },
      createdAt: c.createdAt.toISOString(),
    })),
    total,
    q,
  );
}

export async function getCopy(id: string) {
  const prisma = getPrisma();
  const copy = await prisma.bookCopy.findUnique({
    where: { id },
    include: {
      shelf: shelfInclude,
      edition: {
        select: {
          id: true,
          isbn13: true,
          editionStatement: true,
          publicationYear: true,
          publisher: { select: { name: true } },
          book: { select: { id: true, title: true, subtitle: true } },
        },
      },
      supplier: { select: { id: true, name: true } },
      purchaseItem: {
        include: {
          purchase: {
            select: {
              id: true,
              invoiceNumber: true,
              invoiceDate: true,
              status: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
      },
      history: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        include: {
          changedBy: { select: { fullName: true } },
          fromShelf: shelfInclude,
          toShelf: shelfInclude,
        },
      },
      loans: {
        orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
        take: 20,
        include: {
          member: { select: { fullName: true, membershipNumber: true } },
          renewals: { orderBy: { createdAt: 'asc' } },
        },
      },
    },
  });
  if (!copy) throw Errors.notFound('Copy not found');
  return {
    id: copy.id,
    accessionNumber: copy.accessionNumber,
    barcode: copy.barcode,
    status: copy.status,
    condition: copy.condition,
    acquisitionType: copy.acquisitionType,
    acquisitionDate: copy.acquisitionDate?.toISOString().slice(0, 10) ?? null,
    acquisitionPrice: copy.acquisitionPrice?.toFixed(2) ?? null,
    remarks: copy.remarks,
    archived: copy.archivedAt !== null,
    shelf: shelfPath(copy.shelf),
    supplier: copy.supplier,
    purchase: copy.purchaseItem
      ? {
          invoiceNumber: copy.purchaseItem.purchase.invoiceNumber,
          invoiceDate: copy.purchaseItem.purchase.invoiceDate?.toISOString().slice(0, 10) ?? null,
          status: copy.purchaseItem.purchase.status,
          supplier: copy.purchaseItem.purchase.supplier.name,
          unitPrice: copy.purchaseItem.unitPrice.toFixed(2),
        }
      : null,
    edition: {
      id: copy.edition.id,
      isbn13: copy.edition.isbn13,
      editionStatement: copy.edition.editionStatement,
      publicationYear: copy.edition.publicationYear,
      publisher: copy.edition.publisher?.name ?? null,
    },
    book: copy.edition.book,
    activeLoan: copy.loans.find((loan) => loan.status === 'ACTIVE')
      ? {
          issuedAt: copy.loans.find((loan) => loan.status === 'ACTIVE')!.issuedAt.toISOString(),
          dueAt: copy.loans.find((loan) => loan.status === 'ACTIVE')!.dueAt.toISOString(),
        }
      : null,
    transactions: copy.loans.map((loan) => ({
      id: loan.id,
      status: loan.status,
      issuedAt: loan.issuedAt.toISOString(),
      dueAt: loan.dueAt.toISOString(),
      returnedAt: loan.returnedAt?.toISOString() ?? null,
      member: loan.member,
      renewals: loan.renewals.map((renewal) => ({
        previousDueAt: renewal.previousDueAt.toISOString(),
        newDueAt: renewal.newDueAt.toISOString(),
        createdAt: renewal.createdAt.toISOString(),
      })),
    })),
    history: copy.history.map((h) => ({
      id: h.id,
      eventType: h.eventType,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      fromCondition: h.fromCondition,
      toCondition: h.toCondition,
      fromShelf: shelfPath(h.fromShelf)?.path ?? null,
      toShelf: shelfPath(h.toShelf)?.path ?? null,
      reason: h.reason,
      changedBy: h.changedBy?.fullName ?? null,
      createdAt: h.createdAt.toISOString(),
    })),
    createdAt: copy.createdAt.toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Updates
// ─────────────────────────────────────────────────────────────────────────────

export async function updateCopy(
  id: string,
  input: UpdateCopyInput,
  actor: { canChangeStatus: boolean; canManageLocations: boolean },
  ctx: AuditRequestContext,
) {
  await getPrisma().$transaction(async (tx) => {
    // Lock the row so an edit cannot race an issue/return of the same copy.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id::text FROM book_copies WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) throw Errors.notFound('Copy not found');
    const before = await tx.bookCopy.findUniqueOrThrow({ where: { id } });

    const data: Prisma.BookCopyUncheckedUpdateInput = {};
    const events: Prisma.CopyHistoryUncheckedCreateInput[] = [];
    const base = { copyId: id, reason: input.reason, changedById: ctx.userId ?? null };

    if (input.status && input.status !== before.status) {
      const check = checkStatusTransition(before.status, input.status);
      if (!check.ok) {
        throw new AppError(409, 'INVALID_STATUS_CHANGE', check.reason);
      }
      if (check.needsChangeStatusPermission && !actor.canChangeStatus) {
        throw Errors.forbidden(
          'Marking copies damaged, missing, under repair or discarded requires the copies.change_status permission',
        );
      }
      data.status = input.status;
      if (input.status === 'DISCARDED') data.archivedAt = new Date();
      events.push({
        ...base,
        eventType: 'STATUS_CHANGED',
        fromStatus: before.status,
        toStatus: input.status,
      });
    }
    if (input.condition && input.condition !== before.condition) {
      data.condition = input.condition;
      events.push({
        ...base,
        eventType: 'CONDITION_CHANGED',
        fromCondition: before.condition,
        toCondition: input.condition,
      });
    }
    if (input.shelfId !== undefined && input.shelfId !== before.shelfId) {
      if (!actor.canManageLocations) {
        throw Errors.forbidden('Moving a physical copy to a shelf requires locations.manage');
      }
      await assertShelf(tx, input.shelfId, 1, id);
      data.shelfId = input.shelfId;
      events.push({
        ...base,
        eventType: 'MOVED',
        fromShelfId: before.shelfId,
        toShelfId: input.shelfId,
      });
    }
    const details: (keyof UpdateCopyInput)[] = [
      'acquisitionType',
      'acquisitionDate',
      'acquisitionPrice',
      'remarks',
    ];
    let detailsChanged = false;
    for (const key of details) {
      if (input[key] === undefined) continue;
      const next = input[key];
      const prev = before[key as keyof typeof before];
      const same =
        next instanceof Date && prev instanceof Date
          ? next.getTime() === prev.getTime()
          : String(next ?? '') === String(prev ?? '');
      if (!same) {
        (data as Record<string, unknown>)[key] = next;
        detailsChanged = true;
      }
    }
    if (detailsChanged) events.push({ ...base, eventType: 'DETAILS_UPDATED' });

    if (events.length === 0) return;
    await tx.bookCopy.update({ where: { id }, data });
    for (const e of events) await tx.copyHistory.create({ data: e });
    await recordAudit(
      {
        action: 'copy.updated',
        entityType: 'BookCopy',
        entityId: id,
        before: {
          status: before.status,
          condition: before.condition,
          shelfId: before.shelfId,
          acquisitionType: before.acquisitionType,
          remarks: before.remarks,
        },
        after: JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue,
        metadata: { accessionNumber: before.accessionNumber, reason: input.reason ?? null },
      },
      ctx,
      tx,
    );
  });
  return getCopy(id);
}
