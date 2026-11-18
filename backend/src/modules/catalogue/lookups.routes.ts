/**
 * Lookup and management APIs for authors, publishers and categories.
 */
import { Router } from 'express';
import { z } from 'zod';
import { getPrisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { paginated, paginationQuerySchema, toSkipTake } from '../../lib/pagination.js';
import { auditContext } from '../../lib/request-context.js';
import { normalizeText } from '../../lib/text.js';
import { authorized } from '../../middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../security/permissions.js';
import { recordAudit } from '../audit/audit.service.js';
import { authorIdParams, authorInputSchema, type AuthorInput } from './authors.schemas.js';

type Tx = Prisma.TransactionClient;

const searchQuery = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
});
type SearchQuery = z.infer<typeof searchQuery>;

const name = (label: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max)
    .transform((v) => v.replace(/\s+/g, ' '));

const createAuthorSchema = authorInputSchema;
const updateAuthorSchema = authorInputSchema;

async function lockAuthorName(tx: Tx, normalizedName: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizedName})::bigint)`;
}

async function authorNameMatches(tx: Tx, normalizedName: string, excludeId?: string) {
  return tx.author.findMany({
    where: { normalizedName, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, name: true, authorNumber: true },
    take: 5,
  });
}

function duplicateAuthorNameError(
  matches: { id: string; name: string; authorNumber: string | null }[],
) {
  return new AppError(
    409,
    'POSSIBLE_DUPLICATE_AUTHOR',
    'An author with this name already exists. Review the match or confirm this is a different person.',
    { matches },
  );
}

async function assertAuthorNumberAvailable(
  tx: Tx,
  authorNumber: string | null | undefined,
  excludeId?: string,
) {
  if (!authorNumber) return;
  const existing = await tx.author.findUnique({ where: { authorNumber } });
  if (existing && existing.id !== excludeId) {
    throw new AppError(
      409,
      'DUPLICATE_AUTHOR_NUMBER',
      `Author number ${authorNumber} is already used by ${existing.name}`,
      { existing: { id: existing.id, name: existing.name, authorNumber: existing.authorNumber } },
    );
  }
}

function authorData(input: AuthorInput) {
  return {
    name: input.name,
    normalizedName: normalizeText(input.name),
    sortName: input.name.split(' ').reverse().join(', '),
    authorNumber: input.authorNumber || null,
    description: input.description?.trim() || null,
    nationality: input.nationality?.trim() || null,
    dateOfBirth: input.dateOfBirth,
    birthYear: input.dateOfBirth?.getUTCFullYear() ?? null,
  };
}

const createPublisherSchema = z.object({
  name: name('Name'),
  place: z.string().trim().max(120).optional(),
});

const createCategorySchema = z.object({
  name: name('Name', 120),
  parentId: z.uuid().optional().nullable(),
  code: z
    .string()
    .trim()
    .max(30)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export function lookupsRouter(): Router {
  const router = Router();
  // Mounted at /api/v1: authenticate per route (a router-wide guard would turn unknown routes into 401).
  const read = authorized(PERMISSIONS.CATALOGUE_READ);
  const write = authorized(PERMISSIONS.CATALOGUE_WRITE);

  // ── Authors ──────────────────────────────────────────────────────────────
  router.get('/authors', read, validateQuery(searchQuery), async (_req, res) => {
    const q = res.locals['query'] as SearchQuery;
    const term = q.search ? normalizeText(q.search) : undefined;
    const where = {
      archivedAt: null,
      ...(term
        ? {
            OR: [
              { normalizedName: { contains: term } },
              { authorNumber: { startsWith: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const prisma = getPrisma();
    const [rows, total] = await prisma.$transaction([
      prisma.author.findMany({
        where,
        orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
        ...toSkipTake(q),
        select: {
          id: true,
          name: true,
          authorNumber: true,
          _count: { select: { books: { where: { book: { archivedAt: null } } } } },
        },
      }),
      prisma.author.count({ where }),
    ]);
    const ids = rows.map((author) => author.id);
    const totals = ids.length
      ? await prisma.$queryRaw<{ authorId: string; titles: number; copies: number }[]>`
          SELECT ba."authorId"::text AS "authorId",
                 count(DISTINCT b.id)::int AS titles,
                 count(DISTINCT c.id) FILTER (WHERE c.id IS NOT NULL AND c.status <> 'DISCARDED')::int AS copies
          FROM book_authors ba
          JOIN books b ON b.id = ba."bookId" AND b."archivedAt" IS NULL
          JOIN book_editions e ON e."bookId" = b.id AND e."archivedAt" IS NULL
          LEFT JOIN book_copies c ON c."editionId" = e.id AND c."archivedAt" IS NULL
          WHERE ba."authorId"::text = ANY(${ids})
          GROUP BY ba."authorId"`
      : [];
    const totalsByAuthor = new Map(totals.map((entry) => [entry.authorId, entry]));
    res.json(
      paginated(
        rows.map((a) => ({
          id: a.id,
          name: a.name,
          authorNumber: a.authorNumber,
          titles: totalsByAuthor.get(a.id)?.titles ?? a._count.books,
          copies: totalsByAuthor.get(a.id)?.copies ?? 0,
        })),
        total,
        q,
      ),
    );
  });

  router.get('/authors/:id', read, validateParams(authorIdParams), async (_req, res) => {
    const { id } = res.locals['params'] as z.infer<typeof authorIdParams>;
    const prisma = getPrisma();
    const author = await prisma.author.findFirst({
      where: { id, archivedAt: null },
      include: {
        books: {
          where: { book: { archivedAt: null } },
          orderBy: [{ position: 'asc' }, { book: { normalizedTitle: 'asc' } }],
          include: {
            book: {
              include: {
                editions: {
                  where: { archivedAt: null },
                  orderBy: [{ publicationYear: 'desc' }, { createdAt: 'asc' }],
                  include: {
                    copies: {
                      where: { archivedAt: null, status: { not: 'DISCARDED' } },
                      select: { status: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!author) throw new AppError(404, 'NOT_FOUND', 'Author not found');
    const books = author.books.map(({ book, role }) => {
      const editions = book.editions.map((edition) => ({
        id: edition.id,
        isbn13: edition.isbn13,
        editionStatement: edition.editionStatement,
        publicationYear: edition.publicationYear,
        copies: {
          holdings: edition.copies.length,
          available: edition.copies.filter((copy) => copy.status === 'AVAILABLE').length,
        },
      }));
      return {
        id: book.id,
        title: book.title,
        subtitle: book.subtitle,
        role,
        editions,
        copies: {
          holdings: editions.reduce((sum, edition) => sum + edition.copies.holdings, 0),
          available: editions.reduce((sum, edition) => sum + edition.copies.available, 0),
        },
      };
    });
    res.json({
      id: author.id,
      name: author.name,
      authorNumber: author.authorNumber,
      description: author.description,
      nationality: author.nationality,
      dateOfBirth: author.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      titles: books.length,
      copies: books.reduce((sum, book) => sum + book.copies.holdings, 0),
      books,
      createdAt: author.createdAt.toISOString(),
      updatedAt: author.updatedAt.toISOString(),
    });
  });

  router.post('/authors', write, validateBody(createAuthorSchema), async (req, res) => {
    const input = req.body as AuthorInput;
    const author = await getPrisma().$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'LOCK TABLE books, book_editions, book_authors, authors IN SHARE ROW EXCLUSIVE MODE',
      );
      const normalizedName = normalizeText(input.name);
      await lockAuthorName(tx, normalizedName);
      const matches = await authorNameMatches(tx, normalizedName);
      if (matches.length > 0 && !input.confirmDuplicateName)
        throw duplicateAuthorNameError(matches);
      await assertAuthorNumberAvailable(tx, input.authorNumber);
      const created = await tx.author.create({
        data: authorData(input),
      });
      await recordAudit(
        {
          action: 'author.created',
          entityType: 'Author',
          entityId: created.id,
          after: { name: created.name, authorNumber: created.authorNumber },
        },
        auditContext(req),
        tx,
      );
      return created;
    });
    res.status(201).json({
      id: author.id,
      name: author.name,
      authorNumber: author.authorNumber,
      description: author.description,
      nationality: author.nationality,
      dateOfBirth: author.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      titles: 0,
      copies: 0,
    });
  });

  router.put(
    '/authors/:id',
    write,
    validateParams(authorIdParams),
    validateBody(updateAuthorSchema),
    async (req, res) => {
      const { id } = res.locals['params'] as z.infer<typeof authorIdParams>;
      const input = req.body as AuthorInput;
      const author = await getPrisma().$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'LOCK TABLE books, book_editions, book_authors, authors IN SHARE ROW EXCLUSIVE MODE',
        );
        const before = await tx.author.findFirst({ where: { id, archivedAt: null } });
        if (!before) throw new AppError(404, 'NOT_FOUND', 'Author not found');
        const normalizedName = normalizeText(input.name);
        await lockAuthorName(tx, normalizedName);
        const matches =
          normalizedName === before.normalizedName
            ? []
            : await authorNameMatches(tx, normalizedName, id);
        if (matches.length > 0 && !input.confirmDuplicateName)
          throw duplicateAuthorNameError(matches);
        await assertAuthorNumberAvailable(tx, input.authorNumber, id);
        const updated = await tx.author.update({ where: { id }, data: authorData(input) });
        await recordAudit(
          {
            action: 'author.updated',
            entityType: 'Author',
            entityId: id,
            before: {
              name: before.name,
              authorNumber: before.authorNumber,
              description: before.description,
              nationality: before.nationality,
              dateOfBirth: before.dateOfBirth?.toISOString().slice(0, 10) ?? null,
            },
            after: {
              name: updated.name,
              authorNumber: updated.authorNumber,
              description: updated.description,
              nationality: updated.nationality,
              dateOfBirth: updated.dateOfBirth?.toISOString().slice(0, 10) ?? null,
            },
          },
          auditContext(req),
          tx,
        );
        return updated;
      });
      res.json({
        id: author.id,
        name: author.name,
        authorNumber: author.authorNumber,
        description: author.description,
        nationality: author.nationality,
        dateOfBirth: author.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      });
    },
  );

  // ── Publishers ───────────────────────────────────────────────────────────
  router.get('/publishers', read, validateQuery(searchQuery), async (_req, res) => {
    const q = res.locals['query'] as SearchQuery;
    const term = q.search ? normalizeText(q.search) : undefined;
    const where = { archivedAt: null, ...(term ? { normalizedName: { contains: term } } : {}) };
    const prisma = getPrisma();
    const [rows, total] = await prisma.$transaction([
      prisma.publisher.findMany({
        where,
        orderBy: { normalizedName: 'asc' },
        ...toSkipTake(q),
        select: { id: true, name: true, place: true },
      }),
      prisma.publisher.count({ where }),
    ]);
    res.json(paginated(rows, total, q));
  });

  router.post('/publishers', write, validateBody(createPublisherSchema), async (req, res) => {
    const input = req.body as z.infer<typeof createPublisherSchema>;
    const prisma = getPrisma();
    const normalizedName = normalizeText(input.name);
    const existing = await prisma.publisher.findUnique({ where: { normalizedName } });
    if (existing) {
      throw new AppError(
        409,
        'DUPLICATE_PUBLISHER',
        `Publisher “${existing.name}” already exists`,
        {
          existing: { id: existing.id, name: existing.name, place: existing.place },
        },
      );
    }
    const publisher = await prisma.$transaction(async (tx) => {
      const created = await tx.publisher.create({
        data: { name: input.name, normalizedName, place: input.place ?? null },
      });
      await recordAudit(
        {
          action: 'publisher.created',
          entityType: 'Publisher',
          entityId: created.id,
          after: { name: created.name },
        },
        auditContext(req),
        tx,
      );
      return created;
    });
    res.status(201).json({ id: publisher.id, name: publisher.name, place: publisher.place });
  });

  // ── Categories (small list → returned whole, with a display path) ─────────
  router.get('/categories', read, async (_req, res) => {
    const rows = await getPrisma().category.findMany({
      where: { archivedAt: null },
      select: { id: true, name: true, code: true, parentId: true },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const pathOf = (id: string, seen = new Set<string>()): string => {
      const c = byId.get(id);
      if (!c || seen.has(id)) return '';
      seen.add(id);
      return c.parentId ? `${pathOf(c.parentId, seen)} › ${c.name}`.replace(/^ › /, '') : c.name;
    };
    const data = rows
      .map((r) => ({ ...r, path: pathOf(r.id) }))
      .sort((a, b) => a.path.localeCompare(b.path));
    res.json({ data });
  });

  router.post('/categories', write, validateBody(createCategorySchema), async (req, res) => {
    const input = req.body as z.infer<typeof createCategorySchema>;
    const prisma = getPrisma();
    const normalizedName = normalizeText(input.name);
    const existing = await prisma.category.findUnique({ where: { normalizedName } });
    if (existing) {
      throw new AppError(409, 'DUPLICATE_CATEGORY', `Category “${existing.name}” already exists`, {
        existing: { id: existing.id, name: existing.name },
      });
    }
    if (input.parentId && !(await prisma.category.findUnique({ where: { id: input.parentId } }))) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', [
        { path: 'parentId', message: 'Parent category not found', code: 'custom' },
      ]);
    }
    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: {
          name: input.name,
          normalizedName,
          parentId: input.parentId ?? null,
          code: input.code ?? null,
        },
      });
      await recordAudit(
        {
          action: 'category.created',
          entityType: 'Category',
          entityId: created.id,
          after: { name: created.name },
        },
        auditContext(req),
        tx,
      );
      return created;
    });
    res.status(201).json({
      id: category.id,
      name: category.name,
      code: category.code,
      parentId: category.parentId,
    });
  });

  return router;
}
