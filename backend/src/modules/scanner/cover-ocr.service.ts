import { getPrisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';
import type { CoverImageType } from '../../lib/image.js';
import { recordAudit, type AuditRequestContext } from '../audit/audit.service.js';
import { normalizeText } from '../../lib/text.js';
import { searchLibrary } from '../search/search.service.js';
import type { SearchQuery } from '../search/search.schemas.js';
import {
  searchGoogleBooksByText,
  searchOpenLibraryByText,
  type MetadataSuggestion,
} from './metadata.providers.js';
import { getOcrProvider } from './ocr.providers.js';
import type { OcrMetadataConfirmInput } from './scanner.schemas.js';

export interface OcrFields {
  title: string | null;
  authors: string[];
  publisher: string | null;
}

const MAX_SUGGESTIONS = 5;
type Tx = Prisma.TransactionClient;
const PUBLISHER_HINT =
  /\b(press|publishing|publishers|publisher|books|house|university|edition|inc\.?|ltd\.?)\b/i;
const ISBN_PATTERN = /\b(?:ISBN(?:-1[03])?:?\s*)?(?:97[89][\d\s-]{10,18}|\d[\d\s-]{8,16}[\dX])\b/gi;

async function resolveAuthor(tx: Tx, rawName: string) {
  const name = rawName.trim().replace(/\s+/g, ' ');
  const normalizedName = normalizeText(name);
  const existing = await tx.author.findFirst({
    where: { normalizedName, archivedAt: null },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.author.create({
    data: { name, normalizedName, sortName: name.split(' ').reverse().join(', ') },
    select: { id: true },
  });
  return created.id;
}

export function extractOcrFields(text: string): OcrFields {
  const lines = text
    .split(/[\r\n]+/)
    .map((line) =>
      line
        .replace(ISBN_PATTERN, ' ')
        .replace(/[|•·]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line.length >= 2 && line.length <= 180);
  const title =
    lines.find((line) => line.length >= 3 && /[a-z]/i.test(line) && !PUBLISHER_HINT.test(line)) ??
    null;
  const titleIndex = title ? lines.indexOf(title) : -1;
  const publisher = [...lines].reverse().find((line) => PUBLISHER_HINT.test(line)) ?? null;
  const candidates = lines.filter((line, index) => {
    if (index === titleIndex || line === publisher) return false;
    if (PUBLISHER_HINT.test(line) || /\d{4}/.test(line) || line.length < 5) return false;
    const words = line.split(' ');
    return (
      words.length >= 2 && words.length <= 6 && words.every((word) => /^[\p{L}.'’-]+$/u.test(word))
    );
  });
  return { title, authors: candidates.slice(0, 3), publisher };
}

function ocrQuery(fields: OcrFields, rawText: string): string {
  const parts = [fields.title, ...fields.authors, fields.publisher].filter(
    (value): value is string => Boolean(value),
  );
  const selected = parts.length ? parts.join(' ') : rawText.replace(/\s+/g, ' ');
  return selected.slice(0, 120).trim();
}

export async function searchCoverImage(image: Buffer, imageType: CoverImageType, userId: string) {
  const provider = getOcrProvider();
  if (!provider) {
    throw new AppError(
      503,
      'OCR_NOT_CONFIGURED',
      'Cover OCR is not configured. Enter the book information manually.',
    );
  }
  let extraction;
  try {
    extraction = await provider.extract(image, imageType);
  } catch {
    await writeScanLog(userId, 'ERROR', provider.name, { reason: 'OCR provider failed' });
    throw new AppError(
      502,
      'OCR_PROVIDER_FAILED',
      'Could not read the cover image. Try another image or enter the details manually.',
    );
  }
  const fields = extractOcrFields(extraction.text);
  if (!extraction.text.trim()) {
    await writeScanLog(userId, 'NO_MATCH', provider.name, { characters: 0 });
    return {
      provider: provider.name,
      confidence: extraction.confidence,
      extractedText: '',
      fields,
      local: null,
      suggestions: [],
      providerErrors: [],
    };
  }

  const query = ocrQuery(fields, extraction.text);
  const searchQuery: SearchQuery = {
    q: query || extraction.text.slice(0, 120),
    page: 1,
    pageSize: 10,
    sort: 'relevance',
  };
  const local = await searchLibrary(searchQuery);
  let suggestions: MetadataSuggestion[] = [];
  const providerErrors: string[] = [];
  if (!local.books.data.length && !local.authors.length && query) {
    const results = await Promise.allSettled([
      searchGoogleBooksByText(query),
      searchOpenLibraryByText(query),
    ]);
    for (const [index, result] of results.entries()) {
      const label = index === 0 ? 'Google Books' : 'Open Library';
      if (result.status === 'fulfilled') suggestions.push(...result.value);
      else providerErrors.push(label);
    }
    suggestions = [
      ...new Map(suggestions.map((item) => [`${item.provider}:${item.externalId}`, item])).values(),
    ]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_SUGGESTIONS);
  }
  const outcome =
    local.books.data.length || local.authors.length
      ? 'LOCAL_MATCH'
      : suggestions.length
        ? 'EXTERNAL_MATCH'
        : providerErrors.length
          ? 'ERROR'
          : 'NO_MATCH';
  await writeScanLog(userId, outcome, provider.name, {
    characters: extraction.text.length,
    titleCandidate: fields.title,
    authorCandidates: fields.authors,
    publisherCandidate: fields.publisher,
    localBookMatches: local.books.meta.total,
    localAuthorMatches: local.authors.length,
    externalSuggestions: suggestions.length,
    failedProviders: providerErrors,
  });
  return {
    provider: provider.name,
    confidence: extraction.confidence,
    extractedText: extraction.text,
    fields,
    local,
    suggestions,
    providerErrors,
  };
}

export async function confirmOcrMetadata(input: OcrMetadataConfirmInput, ctx: AuditRequestContext) {
  const prisma = getPrisma();
  const normalizedTitle = normalizeText(input.title);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'LOCK TABLE books, book_editions, book_authors, authors IN SHARE ROW EXCLUSIVE MODE',
    );
    if (input.isbn) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.isbn.isbn13})::bigint)`;
      const duplicateIsbn = await tx.bookEdition.findMany({
        where: { isbn13: input.isbn.isbn13, archivedAt: null },
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
        'A title with this name already exists. Review it before creating another.',
        {
          matches: duplicateTitle,
        },
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
            isbn13: input.isbn?.isbn13 ?? null,
            isbn10: input.isbn?.isbn10 ?? null,
            editionStatement: input.editionStatement,
            publisherId,
            publicationYear: input.publicationYear,
            language: input.language,
            pageCount: input.pageCount,
            metadataSource: 'OCR_ASSISTED',
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
        mode: 'COVER_OCR',
        rawValue: '[cover image; not retained]',
        normalizedIsbn: input.isbn?.isbn13 ?? null,
        outcome: 'EXTERNAL_MATCH',
        editionId: edition.id,
        provider: input.provider,
        confidence: input.confidence ?? null,
        details: { confirmed: true, title: input.title, source: input.provider },
      },
    });
    await recordAudit(
      {
        action: 'scanner.ocr_metadata_confirmed',
        entityType: 'BookEdition',
        entityId: edition.id,
        after: { title: book.title, isbn13: edition.isbn13, metadataSource: 'OCR_ASSISTED' },
      },
      ctx,
      tx,
    );
    return { bookId: book.id, editionId: edition.id, title: book.title };
  });
}

async function writeScanLog(
  userId: string,
  outcome: 'LOCAL_MATCH' | 'EXTERNAL_MATCH' | 'NO_MATCH' | 'ERROR',
  provider: string,
  details: Record<string, unknown>,
) {
  const prisma = getPrisma();
  await prisma.scanLog.create({
    data: {
      userId,
      mode: 'COVER_OCR',
      rawValue: '[cover image]',
      normalizedIsbn: null,
      outcome,
      provider,
      details: details as Prisma.InputJsonValue,
    },
  });
}
