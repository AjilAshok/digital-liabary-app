import { getPrisma } from '../../db/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { cleanIsbn } from '../../lib/isbn.js';
import { paginated, toSkipTake } from '../../lib/pagination.js';
import { normalizeText } from '../../lib/text.js';
import { getCopy, shelfPath } from '../catalogue/copies.service.js';
import type { SearchQuery } from './search.schemas.js';

const shelfInclude = {
  include: { rack: { include: { room: { include: { floor: { include: { building: true } } } } } } },
} as const;

function copyFilters(q: SearchQuery): Prisma.BookCopyWhereInput {
  return {
    ...(q.status === 'DISCARDED' ? {} : { archivedAt: null }),
    status: q.status ?? { not: 'DISCARDED' },
    ...(q.stockType === 'old'
      ? { acquisitionType: 'LEGACY_OLD_STOCK' }
      : q.stockType === 'new'
        ? { acquisitionType: 'PURCHASED_NEW' }
        : {}),
    ...(q.shelfId ? { shelfId: q.shelfId } : {}),
    ...(q.rackId ? { shelf: { rackId: q.rackId } } : {}),
  };
}

export async function searchLibrary(q: SearchQuery) {
  const prisma = getPrisma();
  const normalized = normalizeText(q.q);
  const isbn = cleanIsbn(q.q);
  const escapeLike = (value: string) => value.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escapeLike(q.q)}%`;
  const normalizedPattern = `%${escapeLike(normalized)}%`;
  const where: Prisma.Sql[] = [Prisma.sql`b."archivedAt" IS NULL`];
  if (q.categoryId) where.push(Prisma.sql`b."categoryId" = ${q.categoryId}::uuid`);
  if (q.publisherId)
    where.push(Prisma.sql`EXISTS (
      SELECT 1 FROM book_editions pe
      WHERE pe."bookId" = b.id AND pe."archivedAt" IS NULL AND pe."publisherId" = ${q.publisherId}::uuid
    )`);
  const copyPredicates: Prisma.Sql[] = [];
  if (q.status !== 'DISCARDED') copyPredicates.push(Prisma.sql`sc."archivedAt" IS NULL`);
  if (q.status) copyPredicates.push(Prisma.sql`sc.status = ${q.status}::"CopyStatus"`);
  else copyPredicates.push(Prisma.sql`sc.status <> 'DISCARDED'`);
  if (q.stockType)
    copyPredicates.push(
      Prisma.sql`sc."acquisitionType" = ${q.stockType === 'old' ? 'LEGACY_OLD_STOCK' : 'PURCHASED_NEW'}::"AcquisitionType"`,
    );
  if (q.shelfId) copyPredicates.push(Prisma.sql`sc."shelfId" = ${q.shelfId}::uuid`);
  if (q.rackId) copyPredicates.push(Prisma.sql`sr."rackId" = ${q.rackId}::uuid`);
  if (q.status || q.stockType || q.shelfId || q.rackId) {
    const rackJoin = q.rackId
      ? Prisma.sql`JOIN shelves sr ON sr.id = sc."shelfId" AND sr."archivedAt" IS NULL`
      : Prisma.empty;
    where.push(Prisma.sql`EXISTS (
      SELECT 1 FROM book_editions se
      JOIN book_copies sc ON sc."editionId" = se.id
      ${rackJoin}
      WHERE se."bookId" = b.id AND se."archivedAt" IS NULL
        AND ${Prisma.join(copyPredicates, ' AND ')}
    )`);
  }

  const titleVector = Prisma.sql`to_tsvector('simple', coalesce(b."title", '') || ' ' || coalesce(b."subtitle", '') || ' ' || coalesce(b."description", ''))`;
  const queryVector = Prisma.sql`websearch_to_tsquery('simple', ${q.q})`;
  const matches: Prisma.Sql[] = [
    Prisma.sql`${titleVector} @@ ${queryVector}`,
    Prisma.sql`b."normalizedTitle" ILIKE ${normalizedPattern}`,
    Prisma.sql`b."normalizedTitle" % ${normalized}`,
    Prisma.sql`EXISTS (
      SELECT 1 FROM book_authors ba JOIN authors a ON a.id = ba."authorId"
      WHERE ba."bookId" = b.id AND a."archivedAt" IS NULL
        AND (a."normalizedName" ILIKE ${normalizedPattern} OR a."normalizedName" % ${normalized}
          OR a."authorNumber" ILIKE ${q.q})
    )`,
    Prisma.sql`EXISTS (
      SELECT 1 FROM book_editions ae JOIN book_copies ac ON ac."editionId" = ae.id
      WHERE ae."bookId" = b.id AND ae."archivedAt" IS NULL AND ac."archivedAt" IS NULL
        AND ac."accessionNumber" ILIKE ${pattern}
    )`,
    Prisma.sql`EXISTS (
      SELECT 1 FROM book_editions pe JOIN publishers p ON p.id = pe."publisherId"
      WHERE pe."bookId" = b.id AND pe."archivedAt" IS NULL AND p."archivedAt" IS NULL
        AND (p."normalizedName" ILIKE ${normalizedPattern} OR p."normalizedName" % ${normalized})
    )`,
    Prisma.sql`EXISTS (
      SELECT 1 FROM categories cat
      WHERE cat.id = b."categoryId" AND cat."archivedAt" IS NULL
        AND (cat."normalizedName" ILIKE ${normalizedPattern} OR cat."normalizedName" % ${normalized})
    )`,
    Prisma.sql`EXISTS (
      SELECT 1 FROM book_editions le JOIN book_copies lc ON lc."editionId" = le.id
      JOIN shelves ls ON ls.id = lc."shelfId" JOIN racks lr ON lr.id = ls."rackId"
      WHERE le."bookId" = b.id AND le."archivedAt" IS NULL AND lc."archivedAt" IS NULL
        AND lc.status <> 'DISCARDED'
        AND (ls.code ILIKE ${pattern} OR ls.code % ${q.q} OR lr.code ILIKE ${pattern} OR lr.code % ${q.q})
    )`,
  ];
  if (/^[0-9X]{10}$/.test(isbn) || /^[0-9]{13}$/.test(isbn)) {
    matches.push(Prisma.sql`EXISTS (
      SELECT 1 FROM book_editions ie
      WHERE ie."bookId" = b.id AND ie."archivedAt" IS NULL
        AND (ie."isbn13" = ${isbn} OR ie."isbn10" = ${isbn})
    )`);
  } else if (/^[0-9X]{4,12}$/.test(isbn)) {
    matches.push(Prisma.sql`EXISTS (
      SELECT 1 FROM book_editions ie
      WHERE ie."bookId" = b.id AND ie."archivedAt" IS NULL
        AND (ie."isbn13" ILIKE ${`%${isbn}%`} OR ie."isbn10" ILIKE ${`%${isbn}%`})
    )`);
  }
  where.push(Prisma.sql`(${Prisma.join(matches, ' OR ')})`);
  const whereSql = Prisma.join(where, ' AND ');
  const orderSql =
    q.sort === 'title'
      ? Prisma.sql`b."normalizedTitle" ASC, b.id ASC`
      : q.sort === '-title'
        ? Prisma.sql`b."normalizedTitle" DESC, b.id ASC`
        : q.sort === 'newest'
          ? Prisma.sql`b."createdAt" DESC, b.id ASC`
          : Prisma.sql`score DESC, b.id ASC`;
  const offset = (q.page - 1) * q.pageSize;

  const [bookPage, totalRows, authorPage] = await prisma.$transaction([
    prisma.$queryRaw<{ id: string; score: number }[]>`
      SELECT b.id::text AS id,
        GREATEST(
          ts_rank_cd(${titleVector}, ${queryVector}),
          similarity(b."normalizedTitle", ${normalized}),
          coalesce((SELECT max(similarity(a."normalizedName", ${normalized}))
            FROM book_authors ba JOIN authors a ON a.id = ba."authorId"
            WHERE ba."bookId" = b.id AND a."archivedAt" IS NULL), 0),
          coalesce((SELECT max(similarity(p."normalizedName", ${normalized}))
            FROM book_editions e JOIN publishers p ON p.id = e."publisherId"
            WHERE e."bookId" = b.id AND e."archivedAt" IS NULL AND p."archivedAt" IS NULL), 0)
        )::float8 AS score
      FROM books b
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      OFFSET ${offset} LIMIT ${q.pageSize}`,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM books b WHERE ${whereSql}`,
    prisma.$queryRaw<{ id: string; score: number }[]>`
      SELECT a.id::text AS id,
        GREATEST(
          ts_rank_cd(to_tsvector('simple', coalesce(a."name", '')), websearch_to_tsquery('simple', ${q.q})),
          similarity(a."normalizedName", ${normalized})
        )::float8 AS score
      FROM authors a
      WHERE a."archivedAt" IS NULL AND (
        to_tsvector('simple', coalesce(a."name", '')) @@ websearch_to_tsquery('simple', ${q.q})
        OR a."normalizedName" ILIKE ${normalizedPattern}
        OR a."normalizedName" % ${normalized}
        OR a."authorNumber" ILIKE ${escapeLike(q.q)}
      )
      ORDER BY score DESC, a."normalizedName" ASC, a.id ASC
      LIMIT 10`,
  ]);
  const authorIds = authorPage.map((author) => author.id);
  const authorRows = authorIds.length
    ? await prisma.author.findMany({
        where: { id: { in: authorIds }, archivedAt: null },
        include: {
          books: {
            where: { book: { archivedAt: null } },
            orderBy: [{ position: 'asc' }, { book: { normalizedTitle: 'asc' } }],
            include: {
              book: {
                include: {
                  category: { select: { name: true } },
                  editions: {
                    where: { archivedAt: null },
                    orderBy: [{ publicationYear: 'desc' }, { createdAt: 'asc' }],
                    include: {
                      publisher: { select: { name: true } },
                      _count: {
                        select: {
                          copies: { where: { archivedAt: null, status: { not: 'DISCARDED' } } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
    : [];
  const authorEditionIds = authorRows.flatMap((author) =>
    author.books.flatMap(({ book }) => book.editions.map((edition) => edition.id)),
  );
  const availableByEdition = authorEditionIds.length
    ? new Map(
        (
          await prisma.bookCopy.groupBy({
            by: ['editionId'],
            where: {
              editionId: { in: authorEditionIds },
              archivedAt: null,
              status: 'AVAILABLE',
            },
            _count: { _all: true },
          })
        ).map((group) => [group.editionId, group._count._all]),
      )
    : new Map<string, number>();
  const authorById = new Map(authorRows.map((author) => [author.id, author]));
  const authors = authorIds.flatMap((id) => {
    const author = authorById.get(id);
    return author ? [author] : [];
  });

  const ids = bookPage.map((row) => row.id);
  const copyWhere = copyFilters(q);
  const hasCopyFilters = Boolean(q.status || q.stockType || q.shelfId || q.rackId);
  const hydratedBooks = ids.length
    ? await prisma.book.findMany({
        where: { id: { in: ids }, archivedAt: null },
        include: {
          category: { select: { id: true, name: true } },
          authors: {
            orderBy: { position: 'asc' },
            include: { author: { select: { id: true, name: true, authorNumber: true } } },
          },
          editions: {
            where: {
              archivedAt: null,
              ...(q.publisherId ? { publisherId: q.publisherId } : {}),
              ...(hasCopyFilters ? { copies: { some: copyWhere } } : {}),
            },
            orderBy: [{ publicationYear: 'desc' }, { createdAt: 'asc' }],
            include: {
              publisher: { select: { id: true, name: true } },
              copies: {
                where: copyWhere,
                orderBy: [{ accessionNumber: 'asc' }],
                take: 25,
                include: { shelf: shelfInclude },
              },
              _count: { select: { copies: { where: copyWhere } } },
            },
          },
        },
      })
    : [];
  const bookById = new Map(hydratedBooks.map((book) => [book.id, book]));
  const scoreById = new Map(bookPage.map((row) => [row.id, row.score]));
  const books = ids.flatMap((id) => {
    const book = bookById.get(id);
    if (!book) return [];
    const editions = book.editions.map((edition) => ({
      id: edition.id,
      isbn13: edition.isbn13,
      isbn10: edition.isbn10,
      editionStatement: edition.editionStatement,
      publicationYear: edition.publicationYear,
      publisher: edition.publisher?.name ?? null,
      copyCount: edition._count.copies,
      copiesTruncated: edition._count.copies > edition.copies.length,
      copies: edition.copies.map((copy) => ({
        id: copy.id,
        accessionNumber: copy.accessionNumber,
        status: copy.status,
        condition: copy.condition,
        acquisitionType: copy.acquisitionType,
        shelf: shelfPath(copy.shelf),
      })),
    }));
    return [
      {
        id: book.id,
        title: book.title,
        subtitle: book.subtitle,
        category: book.category?.name ?? null,
        authors: book.authors.map(({ author, role }) => ({
          id: author.id,
          name: author.name,
          authorNumber: author.authorNumber,
          role,
        })),
        score: scoreById.get(book.id) ?? 0,
        editions,
      },
    ];
  });
  const authorResults = authors.map((author) => {
    const linkedBooks = author.books.map(({ book, role }) => ({
      id: book.id,
      title: book.title,
      subtitle: book.subtitle,
      category: book.category?.name ?? null,
      role,
      editions: book.editions.map((edition) => ({
        id: edition.id,
        isbn13: edition.isbn13,
        editionStatement: edition.editionStatement,
        publicationYear: edition.publicationYear,
        publisher: edition.publisher?.name ?? null,
        copies: {
          holdings: edition._count.copies,
          available: availableByEdition.get(edition.id) ?? 0,
        },
      })),
    }));
    return {
      id: author.id,
      name: author.name,
      authorNumber: author.authorNumber,
      description: author.description,
      nationality: author.nationality,
      dateOfBirth: author.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      titles: linkedBooks.length,
      copies: linkedBooks.reduce(
        (sum, book) => sum + book.editions.reduce((n, edition) => n + edition.copies.holdings, 0),
        0,
      ),
      books: linkedBooks,
    };
  });

  const exactCopy = await prisma.bookCopy.findFirst({
    where: { accessionNumber: { equals: q.q, mode: 'insensitive' } },
    select: { id: true },
  });
  const copy = exactCopy ? await getCopy(exactCopy.id) : null;

  return {
    books: paginated(books, Number(totalRows[0]?.count ?? 0n), {
      page: q.page,
      pageSize: q.pageSize,
    }),
    authors: authorResults,
    exactCopy: copy,
  };
}

export async function listBookStock(bookId: string, page: number, pageSize: number) {
  const prisma = getPrisma();
  const book = await prisma.book.findFirst({
    where: { id: bookId, archivedAt: null },
    select: { id: true },
  });
  if (!book) return null;
  const where: Prisma.BookCopyWhereInput = {
    archivedAt: null,
    edition: { bookId, archivedAt: null },
  };
  const [copies, total] = await prisma.$transaction([
    prisma.bookCopy.findMany({
      where,
      orderBy: [{ accessionNumber: 'asc' }, { id: 'asc' }],
      ...toSkipTake({ page, pageSize }),
      include: {
        edition: { select: { id: true, editionStatement: true, isbn13: true } },
        shelf: shelfInclude,
        supplier: { select: { id: true, name: true } },
        purchaseItem: {
          include: {
            purchase: {
              select: {
                id: true,
                invoiceNumber: true,
                invoiceDate: true,
                status: true,
                supplier: { select: { name: true } },
              },
            },
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
        history: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 20,
          include: { changedBy: { select: { fullName: true } } },
        },
      },
    }),
    prisma.bookCopy.count({ where }),
  ]);
  return paginated(
    copies.map((copy) => ({
      id: copy.id,
      accessionNumber: copy.accessionNumber,
      status: copy.status,
      condition: copy.condition,
      acquisitionType: copy.acquisitionType,
      acquisitionDate: copy.acquisitionDate?.toISOString().slice(0, 10) ?? null,
      acquisitionPrice: copy.acquisitionPrice?.toFixed(2) ?? null,
      edition: copy.edition,
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
      history: copy.history.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        reason: event.reason,
        changedBy: event.changedBy?.fullName ?? null,
        createdAt: event.createdAt.toISOString(),
      })),
    })),
    total,
    { page, pageSize },
  );
}
