import { getPrisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError, Errors } from '../../lib/errors.js';
import { COVER_EXTENSIONS, detectImageType } from '../../lib/image.js';
import { cleanIsbn } from '../../lib/isbn.js';
import { paginated, toSkipTake, type Paginated } from '../../lib/pagination.js';
import { getStorage } from '../../lib/storage.js';
import { normalizeText } from '../../lib/text.js';
import { recordAudit, type AuditRequestContext } from '../audit/audit.service.js';
import type {
  BookListQuery,
  ContributorInput,
  CreateBookInput,
  EditionInput,
  UpdateBookInput,
} from './catalogue.schemas.js';

type Tx = Prisma.TransactionClient;

const fieldError = (path: string, message: string) =>
  new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', [
    { path, message, code: 'custom' },
  ]);

// ─────────────────────────────────────────────────────────────────────────────
// Reference checks & contributors
// ─────────────────────────────────────────────────────────────────────────────

async function assertReferences(
  db: Tx,
  refs: { categoryId?: string | null; publisherId?: string | null; path?: string },
): Promise<void> {
  if (
    refs.categoryId &&
    !(await db.category.findFirst({ where: { id: refs.categoryId, archivedAt: null } }))
  ) {
    throw fieldError('categoryId', 'Category not found');
  }
  if (
    refs.publisherId &&
    !(await db.publisher.findFirst({ where: { id: refs.publisherId, archivedAt: null } }))
  ) {
    throw fieldError(refs.path ?? 'edition.publisherId', 'Publisher not found');
  }
}

/** Resolves contributors to author ids, creating new authors in the same transaction. */
async function resolveContributors(
  tx: Tx,
  contributors: ContributorInput[],
): Promise<{ authorId: string; role: ContributorInput['role']; position: number }[]> {
  const result: { authorId: string; role: ContributorInput['role']; position: number }[] = [];
  const seen = new Set<string>();
  for (const [index, c] of contributors.entries()) {
    let authorId = c.authorId;
    if (authorId) {
      if (!(await tx.author.findFirst({ where: { id: authorId, archivedAt: null } }))) {
        throw fieldError(`authors.${index}.authorId`, 'Author not found');
      }
    } else {
      const name = c.name!.replace(/\s+/g, ' ');
      if (!name) throw fieldError(`authors.${index}.name`, 'Author name is required');
      const normalizedName = normalizeText(name);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizedName})::bigint)`;
      const sameName = await tx.author.findMany({
        where: { normalizedName, archivedAt: null },
        select: { id: true, name: true, authorNumber: true },
        take: 5,
      });
      if (sameName.length > 0 && !c.confirmDuplicateName) {
        throw new AppError(
          409,
          'POSSIBLE_DUPLICATE_AUTHOR',
          'An author with this name already exists. Select that author or confirm this is a different person.',
          { matches: sameName },
        );
      }
      if (c.authorNumber) {
        const clash = await tx.author.findUnique({ where: { authorNumber: c.authorNumber } });
        if (clash) {
          throw new AppError(
            409,
            'DUPLICATE_AUTHOR_NUMBER',
            `Author number ${c.authorNumber} already belongs to ${clash.name}`,
            {
              existing: { id: clash.id, name: clash.name, authorNumber: clash.authorNumber },
            },
          );
        }
      }
      const created = await tx.author.create({
        data: {
          name,
          normalizedName,
          authorNumber: c.authorNumber || null,
          sortName: name.split(' ').reverse().join(', '),
        },
      });
      authorId = created.id;
    }
    const key = `${authorId}:${c.role}`;
    if (seen.has(key)) continue; // same author + role listed twice
    seen.add(key);
    result.push({ authorId, role: c.role, position: result.length });
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Duplicate detection
// ─────────────────────────────────────────────────────────────────────────────

async function findIsbnMatches(db: Tx, isbn13: string, excludeEditionId?: string) {
  const matches = await db.bookEdition.findMany({
    where: {
      isbn13,
      archivedAt: null,
      ...(excludeEditionId ? { id: { not: excludeEditionId } } : {}),
    },
    select: { id: true, bookId: true, editionStatement: true, book: { select: { title: true } } },
  });
  return matches.map((m) => ({
    editionId: m.id,
    bookId: m.bookId,
    title: m.book.title,
    editionStatement: m.editionStatement,
  }));
}

function duplicateIsbnError(isbn13: string, matches: Awaited<ReturnType<typeof findIsbnMatches>>) {
  return new AppError(
    409,
    'DUPLICATE_ISBN',
    `ISBN ${isbn13} is already catalogued. Register another copy of the existing edition instead of creating a new record.`,
    { isbn13, matches },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export interface BookListItem {
  id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  category: string | null;
  editions: number;
  isbns: string[];
  publishers: string[];
  copies: { holdings: number; available: number };
  createdAt: string;
}

export async function listBooks(q: BookListQuery): Promise<Paginated<BookListItem>> {
  const prisma = getPrisma();
  const conditions: Prisma.BookWhereInput[] = [{ archivedAt: null }];
  if (q.categoryId) conditions.push({ categoryId: q.categoryId });
  if (q.authorId) conditions.push({ authors: { some: { authorId: q.authorId } } });
  if (q.publisherId) conditions.push({ editions: { some: { publisherId: q.publisherId } } });
  if (q.search) {
    const term = normalizeText(q.search);
    const isbnLike = cleanIsbn(q.search);
    const or: Prisma.BookWhereInput[] = [
      { normalizedTitle: { contains: term } },
      { subtitle: { contains: q.search, mode: 'insensitive' } },
      { authors: { some: { author: { normalizedName: { contains: term } } } } },
      {
        authors: { some: { author: { authorNumber: { equals: q.search, mode: 'insensitive' } } } },
      },
      {
        editions: {
          some: {
            copies: { some: { accessionNumber: { equals: q.search, mode: 'insensitive' } } },
          },
        },
      },
    ];
    if (/^[0-9X]{4,13}$/.test(isbnLike)) {
      or.push({
        editions: {
          some: { OR: [{ isbn13: { contains: isbnLike } }, { isbn10: { contains: isbnLike } }] },
        },
      });
    }
    conditions.push({ OR: or });
  }
  const where: Prisma.BookWhereInput = { AND: conditions };
  const orderBy: Prisma.BookOrderByWithRelationInput[] =
    q.sort === 'title'
      ? [{ normalizedTitle: 'asc' }]
      : q.sort === '-title'
        ? [{ normalizedTitle: 'desc' }]
        : q.sort === 'createdAt'
          ? [{ createdAt: 'asc' }]
          : [{ createdAt: 'desc' }];

  const [rows, total] = await prisma.$transaction([
    prisma.book.findMany({
      where,
      orderBy: [...orderBy, { id: 'asc' }],
      ...toSkipTake(q),
      include: {
        category: { select: { name: true } },
        authors: { orderBy: { position: 'asc' }, include: { author: { select: { name: true } } } },
        editions: {
          where: { archivedAt: null },
          select: { isbn13: true, publisher: { select: { name: true } } },
        },
      },
    }),
    prisma.book.count({ where }),
  ]);

  // Copy counts for this page only (holdings = not archived, not discarded).
  const ids = rows.map((r) => r.id);
  const counts = ids.length
    ? await prisma.$queryRaw<{ bookId: string; holdings: number; available: number }[]>`
        SELECT e."bookId"::text AS "bookId",
               count(*) FILTER (WHERE c.status <> 'DISCARDED')::int AS holdings,
               count(*) FILTER (WHERE c.status = 'AVAILABLE')::int AS available
        FROM book_copies c JOIN book_editions e ON e.id = c."editionId"
        WHERE c."archivedAt" IS NULL AND e."bookId"::text = ANY(${ids})
        GROUP BY e."bookId"`
    : [];
  const countMap = new Map(counts.map((c) => [c.bookId, c]));

  return paginated(
    rows.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      authors: b.authors.map((a) => a.author.name),
      category: b.category?.name ?? null,
      editions: b.editions.length,
      isbns: b.editions.map((e) => e.isbn13).filter((v): v is string => Boolean(v)),
      publishers: [
        ...new Set(b.editions.map((e) => e.publisher?.name).filter((v): v is string => Boolean(v))),
      ],
      copies: {
        holdings: countMap.get(b.id)?.holdings ?? 0,
        available: countMap.get(b.id)?.available ?? 0,
      },
      createdAt: b.createdAt.toISOString(),
    })),
    total,
    q,
  );
}

export async function getBook(id: string) {
  const prisma = getPrisma();
  const book = await prisma.book.findFirst({
    where: { id, archivedAt: null },
    include: {
      category: { select: { id: true, name: true } },
      authors: {
        orderBy: { position: 'asc' },
        include: { author: { select: { id: true, name: true, authorNumber: true } } },
      },
      editions: {
        where: { archivedAt: null },
        orderBy: [{ publicationYear: 'desc' }, { createdAt: 'asc' }],
        include: { publisher: { select: { id: true, name: true } } },
      },
    },
  });
  if (!book) throw Errors.notFound('Book not found');

  const editionIds = book.editions.map((e) => e.id);
  const statusRows = editionIds.length
    ? await prisma.bookCopy.groupBy({
        by: ['editionId', 'status', 'acquisitionType'],
        where: { editionId: { in: editionIds }, archivedAt: null },
        _count: { _all: true },
      })
    : [];

  const perEdition = new Map<string, { holdings: number; available: number }>();
  const byStatus: Record<string, number> = {};
  const byAcquisition: Record<string, number> = {};
  for (const r of statusRows) {
    const n = r._count._all;
    if (r.status === 'DISCARDED') continue;
    const e = perEdition.get(r.editionId) ?? { holdings: 0, available: 0 };
    e.holdings += n;
    if (r.status === 'AVAILABLE') e.available += n;
    perEdition.set(r.editionId, e);
    byStatus[r.status] = (byStatus[r.status] ?? 0) + n;
    byAcquisition[r.acquisitionType] = (byAcquisition[r.acquisitionType] ?? 0) + n;
  }

  return {
    id: book.id,
    title: book.title,
    subtitle: book.subtitle,
    description: book.description,
    originalLanguage: book.originalLanguage,
    category: book.category,
    authors: book.authors.map((a) => ({
      id: a.author.id,
      name: a.author.name,
      authorNumber: a.author.authorNumber,
      role: a.role,
      position: a.position,
    })),
    editions: book.editions.map((e) => ({
      id: e.id,
      isbn13: e.isbn13,
      isbn10: e.isbn10,
      editionStatement: e.editionStatement,
      publisher: e.publisher,
      publicationYear: e.publicationYear,
      language: e.language,
      pageCount: e.pageCount,
      format: e.format,
      hasCover: Boolean(e.coverImageKey),
      metadataSource: e.metadataSource,
      copies: perEdition.get(e.id) ?? { holdings: 0, available: 0 },
    })),
    copyStats: {
      holdings: Object.values(byStatus).reduce((a, b) => a + b, 0),
      byStatus,
      byAcquisition,
    },
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}

/** Lookup used by the Add Book form as soon as an ISBN is entered. */
export async function lookupIsbn(isbn13: string) {
  return findIsbnMatches(getPrisma(), isbn13);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

function editionData(e: EditionInput) {
  return {
    isbn13: e.isbn?.isbn13 ?? null,
    isbn10: e.isbn?.isbn10 ?? null,
    editionStatement: e.editionStatement,
    publisherId: e.publisherId,
    publicationYear: e.publicationYear,
    language: e.language,
    pageCount: e.pageCount,
    format: e.format,
  };
}

export async function createBook(input: CreateBookInput, ctx: AuditRequestContext) {
  const prisma = getPrisma();
  const bookId = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'LOCK TABLE books, book_editions, book_authors, authors IN SHARE ROW EXCLUSIVE MODE',
    );

    // 1. Same ISBN → this is another copy of an existing edition, not a new title.
    if (input.edition.isbn && !input.edition.confirmDuplicateIsbn) {
      const matches = await findIsbnMatches(tx, input.edition.isbn.isbn13);
      if (matches.length > 0) throw duplicateIsbnError(input.edition.isbn.isbn13, matches);
    }

    // 2. Same title → ask the librarian to confirm it is a different work.
    if (!input.confirmNewTitle) {
      const sameTitle = await tx.book.findMany({
        where: { normalizedTitle: normalizeText(input.title), archivedAt: null },
        take: 5,
        include: {
          authors: {
            orderBy: { position: 'asc' },
            include: { author: { select: { name: true } } },
          },
          _count: { select: { editions: true } },
        },
      });
      if (sameTitle.length > 0) {
        throw new AppError(
          409,
          'POSSIBLE_DUPLICATE_TITLE',
          'A book with this title already exists. Add an edition or copies to it, or confirm this is a different work.',
          {
            matches: sameTitle.map((b) => ({
              bookId: b.id,
              title: b.title,
              authors: b.authors.map((a) => a.author.name),
              editions: b._count.editions,
            })),
          },
        );
      }
    }

    await assertReferences(tx, {
      categoryId: input.categoryId,
      publisherId: input.edition.publisherId,
    });
    const contributors = await resolveContributors(tx, input.authors);
    const book = await tx.book.create({
      data: {
        title: input.title,
        subtitle: input.subtitle,
        normalizedTitle: normalizeText(input.title),
        description: input.description,
        originalLanguage: input.originalLanguage,
        categoryId: input.categoryId,
        authors: { create: contributors },
        editions: { create: { ...editionData(input.edition), metadataSource: 'MANUAL' } },
      },
      include: { editions: true },
    });
    await recordAudit(
      {
        action: 'book.created',
        entityType: 'Book',
        entityId: book.id,
        after: {
          title: book.title,
          editionId: book.editions[0]!.id,
          isbn13: book.editions[0]!.isbn13,
        },
      },
      ctx,
      tx,
    );
    return book.id;
  });
  return getBook(bookId);
}

export async function updateBook(id: string, input: UpdateBookInput, ctx: AuditRequestContext) {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'LOCK TABLE books, book_editions, book_authors, authors IN SHARE ROW EXCLUSIVE MODE',
    );
    const before = await tx.book.findFirst({
      where: { id, archivedAt: null },
      include: { authors: { orderBy: { position: 'asc' } } },
    });
    if (!before) throw Errors.notFound('Book not found');
    await assertReferences(tx, { categoryId: input.categoryId });
    const contributors = await resolveContributors(tx, input.authors);
    await tx.bookAuthor.deleteMany({ where: { bookId: id } });
    await tx.book.update({
      where: { id },
      data: {
        title: input.title,
        subtitle: input.subtitle,
        normalizedTitle: normalizeText(input.title),
        description: input.description,
        originalLanguage: input.originalLanguage,
        categoryId: input.categoryId,
        authors: { create: contributors },
      },
    });
    await recordAudit(
      {
        action: 'book.updated',
        entityType: 'Book',
        entityId: id,
        before: {
          title: before.title,
          subtitle: before.subtitle,
          categoryId: before.categoryId,
          authors: before.authors.map((a) => ({ authorId: a.authorId, role: a.role })),
        },
        after: {
          title: input.title,
          subtitle: input.subtitle,
          categoryId: input.categoryId,
          authors: contributors.map((a) => ({ authorId: a.authorId, role: a.role })),
        },
      },
      ctx,
      tx,
    );
  });
  return getBook(id);
}

export async function addEdition(bookId: string, input: EditionInput, ctx: AuditRequestContext) {
  const prisma = getPrisma();
  const edition = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'LOCK TABLE books, book_editions, book_authors, authors IN SHARE ROW EXCLUSIVE MODE',
    );
    if (input.isbn && !input.confirmDuplicateIsbn) {
      const matches = await findIsbnMatches(tx, input.isbn.isbn13);
      if (matches.length > 0) throw duplicateIsbnError(input.isbn.isbn13, matches);
    }
    if (!(await tx.book.findFirst({ where: { id: bookId, archivedAt: null } })))
      throw Errors.notFound('Book not found');
    await assertReferences(tx, { publisherId: input.publisherId, path: 'publisherId' });
    const created = await tx.bookEdition.create({
      data: { bookId, ...editionData(input), metadataSource: 'MANUAL' },
    });
    await recordAudit(
      {
        action: 'edition.created',
        entityType: 'BookEdition',
        entityId: created.id,
        after: editionData(input),
      },
      ctx,
      tx,
    );
    return created;
  });
  return { id: edition.id, bookId };
}

export async function updateEdition(
  editionId: string,
  input: EditionInput,
  ctx: AuditRequestContext,
) {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'LOCK TABLE books, book_editions, book_authors, authors IN SHARE ROW EXCLUSIVE MODE',
    );
    if (input.isbn && !input.confirmDuplicateIsbn) {
      const matches = await findIsbnMatches(tx, input.isbn.isbn13, editionId);
      if (matches.length > 0) throw duplicateIsbnError(input.isbn.isbn13, matches);
    }
    const before = await tx.bookEdition.findFirst({ where: { id: editionId, archivedAt: null } });
    if (!before) throw Errors.notFound('Edition not found');
    await assertReferences(tx, { publisherId: input.publisherId, path: 'publisherId' });
    await tx.bookEdition.update({ where: { id: editionId }, data: editionData(input) });
    await recordAudit(
      {
        action: 'edition.updated',
        entityType: 'BookEdition',
        entityId: editionId,
        before: {
          isbn13: before.isbn13,
          editionStatement: before.editionStatement,
          publisherId: before.publisherId,
          publicationYear: before.publicationYear,
          language: before.language,
          pageCount: before.pageCount,
          format: before.format,
        },
        after: editionData(input),
      },
      ctx,
      tx,
    );
    return { id: editionId, bookId: before.bookId };
  });
}

/** Archives a work and its editions. Refused while any physical copy is still held. */
export async function archiveBook(id: string, ctx: AuditRequestContext): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const book = await tx.book.findFirst({ where: { id, archivedAt: null } });
    if (!book) throw Errors.notFound('Book not found');
    const held = await tx.bookCopy.count({
      where: { edition: { bookId: id }, archivedAt: null, status: { not: 'DISCARDED' } },
    });
    if (held > 0) {
      throw new AppError(
        409,
        'BOOK_HAS_COPIES',
        `This book still has ${held} physical ${held === 1 ? 'copy' : 'copies'}. Discard or transfer them before archiving.`,
      );
    }
    const now = new Date();
    await tx.bookEdition.updateMany({
      where: { bookId: id, archivedAt: null },
      data: { archivedAt: now },
    });
    await tx.book.update({ where: { id }, data: { archivedAt: now } });
    await recordAudit(
      { action: 'book.archived', entityType: 'Book', entityId: id, before: { title: book.title } },
      ctx,
      tx,
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Covers
// ─────────────────────────────────────────────────────────────────────────────

export const COVER_MAX_BYTES = 2 * 1024 * 1024;

export async function setCover(
  editionId: string,
  data: Buffer,
  ctx: AuditRequestContext,
): Promise<void> {
  const type = detectImageType(data);
  if (!type) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a JPEG, PNG or WebP image');
  }
  const prisma = getPrisma();
  const edition = await prisma.bookEdition.findFirst({
    where: { id: editionId, archivedAt: null },
  });
  if (!edition) throw Errors.notFound('Edition not found');

  const storage = getStorage();
  const key = await storage.put('covers', COVER_EXTENSIONS[type], data);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.bookEdition.update({ where: { id: editionId }, data: { coverImageKey: key } });
      await recordAudit(
        {
          action: 'edition.cover_updated',
          entityType: 'BookEdition',
          entityId: editionId,
          after: { type, bytes: data.length },
        },
        ctx,
        tx,
      );
    });
  } catch (err) {
    await storage.remove(key); // do not leave orphaned files
    throw err;
  }
  if (edition.coverImageKey) await storage.remove(edition.coverImageKey);
}

export async function getCover(
  editionId: string,
): Promise<{ data: Buffer; type: ReturnType<typeof detectImageType> } | null> {
  const edition = await getPrisma().bookEdition.findFirst({
    where: { id: editionId, archivedAt: null },
  });
  if (!edition?.coverImageKey) return null;
  const data = await getStorage().get(edition.coverImageKey);
  if (!data) return null;
  return { data, type: detectImageType(data) };
}

export async function removeCover(editionId: string, ctx: AuditRequestContext): Promise<void> {
  const prisma = getPrisma();
  const edition = await prisma.bookEdition.findFirst({
    where: { id: editionId, archivedAt: null },
  });
  if (!edition) throw Errors.notFound('Edition not found');
  if (!edition.coverImageKey) return;
  await prisma.$transaction(async (tx) => {
    await tx.bookEdition.update({ where: { id: editionId }, data: { coverImageKey: null } });
    await recordAudit(
      { action: 'edition.cover_removed', entityType: 'BookEdition', entityId: editionId },
      ctx,
      tx,
    );
  });
  await getStorage().remove(edition.coverImageKey);
}
