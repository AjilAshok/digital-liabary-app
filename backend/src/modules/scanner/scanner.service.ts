import { getPrisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import { normalizeIsbn } from '../../lib/isbn.js';
import { normalizeText } from '../../lib/text.js';
import { recordAudit, type AuditRequestContext } from '../audit/audit.service.js';
import {
  searchGoogleBooks,
  searchOpenLibrary,
  type MetadataSuggestion,
} from './metadata.providers.js';
import type { MetadataConfirmInput } from './scanner.schemas.js';

const MAX_SUGGESTIONS = 5;
type Tx = Prisma.TransactionClient;

async function logScan(input: {
  userId: string;
  rawValue: string;
  normalizedIsbn: string | null;
  outcome: 'LOCAL_MATCH' | 'EXTERNAL_MATCH' | 'NO_MATCH' | 'INVALID_INPUT' | 'ERROR';
  editionId?: string | null;
  provider?: string | null;
  details?: Prisma.InputJsonValue;
}) {
  await getPrisma().scanLog.create({
    data: {
      userId: input.userId,
      mode: 'ISBN_BARCODE',
      rawValue: input.rawValue.slice(0, 100),
      normalizedIsbn: input.normalizedIsbn,
      outcome: input.outcome,
      editionId: input.editionId ?? null,
      provider: input.provider ?? null,
      details: input.details,
    },
  });
}

export async function lookupIsbn(rawValue: string, userId: string) {
  const normalized = normalizeIsbn(rawValue);
  if (!normalized) {
    await logScan({
      userId,
      rawValue,
      normalizedIsbn: null,
      outcome: 'INVALID_INPUT',
      details: { reason: 'ISBN check digit or format is invalid' },
    });
    return {
      valid: false as const,
      isbn13: null,
      localMatches: [],
      suggestions: [],
      providerErrors: [],
    };
  }

  const prisma = getPrisma();
  const localRows = await prisma.bookEdition.findMany({
    where: {
      archivedAt: null,
      book: { archivedAt: null },
      OR: [
        { isbn13: normalized.isbn13 },
        ...(normalized.isbn10 ? [{ isbn10: normalized.isbn10 }] : []),
      ],
    },
    orderBy: [{ publicationYear: 'desc' }, { createdAt: 'asc' }],
    take: MAX_SUGGESTIONS,
    include: {
      publisher: { select: { name: true } },
      book: {
        include: {
          category: { select: { name: true } },
          authors: {
            orderBy: { position: 'asc' },
            include: { author: { select: { id: true, name: true, authorNumber: true } } },
          },
        },
      },
      _count: { select: { copies: { where: { archivedAt: null, status: { not: 'DISCARDED' } } } } },
    },
  });

  if (localRows.length) {
    const editionIds = localRows.map((edition) => edition.id);
    const available = await prisma.bookCopy.groupBy({
      by: ['editionId'],
      where: { editionId: { in: editionIds }, archivedAt: null, status: 'AVAILABLE' },
      _count: { _all: true },
    });
    const availableByEdition = new Map(available.map((row) => [row.editionId, row._count._all]));
    await logScan({
      userId,
      rawValue,
      normalizedIsbn: normalized.isbn13,
      outcome: 'LOCAL_MATCH',
      editionId: localRows[0]!.id,
      details: { matches: localRows.length },
    });
    return {
      valid: true as const,
      isbn13: normalized.isbn13,
      localMatches: localRows.map((edition) => ({
        editionId: edition.id,
        bookId: edition.bookId,
        title: edition.book.title,
        subtitle: edition.book.subtitle,
        authors: edition.book.authors.map(({ author, role }) => ({
          id: author.id,
          name: author.name,
          authorNumber: author.authorNumber,
          role,
        })),
        category: edition.book.category?.name ?? null,
        editionStatement: edition.editionStatement,
        publisher: edition.publisher?.name ?? null,
        publicationYear: edition.publicationYear,
        isbn13: edition.isbn13,
        isbn10: edition.isbn10,
        copies: edition._count.copies,
        available: availableByEdition.get(edition.id) ?? 0,
      })),
      suggestions: [],
      providerErrors: [],
    };
  }

  const providerResults = await Promise.allSettled([
    searchGoogleBooks(normalized.isbn13),
    searchOpenLibrary(normalized.isbn13),
  ]);
  const suggestions: MetadataSuggestion[] = [];
  const providerErrors: string[] = [];
  for (const [index, result] of providerResults.entries()) {
    const provider = index === 0 ? 'Google Books' : 'Open Library';
    if (result.status === 'fulfilled') suggestions.push(...result.value);
    else providerErrors.push(provider);
  }
  const unique = [
    ...new Map(suggestions.map((item) => [`${item.provider}:${item.externalId}`, item])).values(),
  ]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_SUGGESTIONS);
  await logScan({
    userId,
    rawValue,
    normalizedIsbn: normalized.isbn13,
    outcome: unique.length ? 'EXTERNAL_MATCH' : providerErrors.length === 2 ? 'ERROR' : 'NO_MATCH',
    provider: unique.map((item) => item.provider).join(',') || null,
    details: { suggestions: unique.length, failedProviders: providerErrors },
  });
  return {
    valid: true as const,
    isbn13: normalized.isbn13,
    localMatches: [],
    suggestions: unique,
    providerErrors,
  };
}

async function resolveAuthor(tx: Tx, rawName: string) {
  const name = rawName.trim().replace(/\s+/g, ' ');
  const normalizedName = normalizeText(name);
  const existing = await tx.author.findFirst({
    where: { normalizedName, archivedAt: null },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.author.create({
    data: {
      name,
      normalizedName,
      sortName: name.split(' ').reverse().join(', '),
    },
    select: { id: true },
  });
  return created.id;
}

export async function confirmMetadata(input: MetadataConfirmInput, ctx: AuditRequestContext) {
  const prisma = getPrisma();
  const normalized = normalizeIsbn(input.isbn);
  if (!normalized) throw new AppError(422, 'VALIDATION_FAILED', 'ISBN is invalid');
  const normalizedTitle = normalizeText(input.title);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'LOCK TABLE books, book_editions, book_authors, authors IN SHARE ROW EXCLUSIVE MODE',
    );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${normalized.isbn13})::bigint)`;
    const duplicateIsbn = await tx.bookEdition.findMany({
      where: { isbn13: normalized.isbn13, archivedAt: null },
      select: { id: true, bookId: true, book: { select: { title: true } } },
      take: 5,
    });
    if (duplicateIsbn.length) {
      throw new AppError(
        409,
        'DUPLICATE_ISBN',
        'This ISBN is already catalogued. Register a copy on an existing edition instead.',
        {
          matches: duplicateIsbn.map((edition) => ({
            editionId: edition.id,
            bookId: edition.bookId,
            title: edition.book.title,
          })),
        },
      );
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizedTitle})::bigint)`;
    const duplicateTitle = await tx.book.findMany({
      where: { normalizedTitle, archivedAt: null },
      select: { id: true, title: true },
      take: 5,
    });
    if (duplicateTitle.length) {
      throw new AppError(
        409,
        'POSSIBLE_DUPLICATE_TITLE',
        'A title with this name already exists. Add an edition to the existing title or review it before creating another.',
        { matches: duplicateTitle },
      );
    }
    const authorIds = [];
    for (const authorName of [
      ...new Set(input.authors.map((name) => name.trim()).filter(Boolean)),
    ]) {
      authorIds.push(await resolveAuthor(tx, authorName));
    }
    let publisherId: string | null = null;
    if (input.publisher) {
      const normalizedPublisher = normalizeText(input.publisher);
      const publisher = await tx.publisher.upsert({
        where: { normalizedName: normalizedPublisher },
        update: {},
        create: { name: input.publisher, normalizedName: normalizedPublisher },
        select: { id: true },
      });
      publisherId = publisher.id;
    }
    const metadataSource = input.provider;
    const book = await tx.book.create({
      data: {
        title: input.title,
        subtitle: input.subtitle,
        description: input.description,
        normalizedTitle,
        originalLanguage: input.language,
        authors: {
          create: authorIds.map((authorId, position) => ({ authorId, position, role: 'AUTHOR' })),
        },
        editions: {
          create: {
            isbn13: normalized.isbn13,
            isbn10: normalized.isbn10,
            editionStatement: input.editionStatement,
            publisherId,
            publicationYear: input.publicationYear,
            language: input.language,
            pageCount: input.pageCount,
            coverImageKey: null,
            metadataSource,
            externalSourceId: input.externalId,
            verifiedAt: new Date(),
            verifiedById: ctx.userId,
          },
        },
      },
      include: { editions: true },
    });
    const edition = book.editions[0]!;
    await tx.scanLog.create({
      data: {
        userId: ctx.userId!,
        mode: 'ISBN_BARCODE',
        rawValue: input.isbn,
        normalizedIsbn: normalized.isbn13,
        outcome: 'EXTERNAL_MATCH',
        editionId: edition.id,
        provider: input.provider,
        confidence: input.confidence,
        details: { confirmed: true, title: input.title },
      },
    });
    await recordAudit(
      {
        action: 'scanner.metadata_confirmed',
        entityType: 'BookEdition',
        entityId: edition.id,
        after: {
          title: book.title,
          isbn13: edition.isbn13,
          metadataSource,
          externalSourceId: input.externalId,
        },
      },
      ctx,
      tx,
    );
    return { bookId: book.id, editionId: edition.id, title: book.title };
  });
}
