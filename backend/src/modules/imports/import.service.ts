import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { getPrisma } from '../../db/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError, Errors } from '../../lib/errors.js';
import { normalizeText } from '../../lib/text.js';
import { recordAudit, type AuditRequestContext } from '../audit/audit.service.js';
import {
  IMPORT_COLUMNS,
  validateImportValues,
  type ImportError,
  type ImportValues,
} from './import-validation.js';
import { parseWorkbook } from './import-workbook.js';

type Tx = Prisma.TransactionClient;
type Stored = { values: ImportValues; sourceErrors: ImportError[] };
type StagedRow = {
  id: string;
  rowNumber: number;
  rawData: Prisma.JsonValue;
  normalizedData: Prisma.JsonValue | null;
  status: string;
  createdCopyId: string | null;
};
const stored = (row: StagedRow): Stored => (row.normalizedData ?? row.rawData) as unknown as Stored;

async function lockBatch(tx: Tx, id: string) {
  const found = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id::text FROM import_batches WHERE id = ${id}::uuid FOR UPDATE`;
  if (!found.length) throw Errors.notFound('Import batch not found');
  const batch = await tx.importBatch.findUniqueOrThrow({
    where: { id },
    include: { rows: { orderBy: { rowNumber: 'asc' } } },
  });
  if (batch.profile !== 'xlsx-v1') throw Errors.notFound('Import batch not found');
  return batch;
}

export async function assessImportRow(tx: Tx, row: StagedRow, rows: StagedRow[]) {
  const data = stored(row);
  const parsed = validateImportValues(data.values);
  const errors = [...data.sourceErrors, ...parsed.errors];
  const values = parsed.values;
  let duplicateOfCopyId: string | null = null;
  let editionId: string | null = null;
  let authorId: string | null = null;
  let shelfId: string | null = null;
  const add = (field: string, message: string) => errors.push({ field, message });

  if (values.accessionNumber) {
    if (
      rows.some(
        (other) =>
          other.id !== row.id &&
          other.status !== 'EXCLUDED' &&
          normalizeText(stored(other).values.accessionNumber) ===
            normalizeText(values.accessionNumber),
      )
    )
      add('accessionNumber', 'Duplicate accession number in this batch');
    const duplicate = await tx.bookCopy.findFirst({
      where: {
        OR: [
          { accessionNumber: { equals: values.accessionNumber, mode: 'insensitive' } },
          { barcode: { equals: values.accessionNumber, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (duplicate) {
      duplicateOfCopyId = duplicate.id;
      add('accessionNumber', 'Accession number or barcode already exists');
    }
  }

  for (const other of rows) {
    if (other.id === row.id || other.status === 'EXCLUDED' || other.status === 'IMPORTED') continue;
    const candidate = validateImportValues(stored(other).values);
    if (
      parsed.isbn &&
      candidate.isbn?.isbn13 === parsed.isbn.isbn13 &&
      (normalizeText(candidate.values.title) !== normalizeText(values.title) ||
        (candidate.values.authorName &&
          values.authorName &&
          normalizeText(candidate.values.authorName) !== normalizeText(values.authorName)))
    ) {
      add('isbn', 'Rows with the same ISBN contain conflicting title or author values');
      break;
    }
    if (
      values.title &&
      normalizeText(candidate.values.title) === normalizeText(values.title) &&
      (!parsed.isbn || !candidate.isbn || candidate.isbn.isbn13 !== parsed.isbn.isbn13)
    ) {
      add('title', 'Rows with the same title need the same unambiguous ISBN; review the catalogue');
      break;
    }
    if (
      values.authorNumber &&
      candidate.values.authorNumber &&
      normalizeText(candidate.values.authorNumber) === normalizeText(values.authorNumber) &&
      normalizeText(candidate.values.authorName) !== normalizeText(values.authorName)
    ) {
      add('authorNumber', 'Author number is associated with different names in this batch');
      break;
    }
    if (
      values.authorName &&
      candidate.values.authorName &&
      normalizeText(candidate.values.authorName) === normalizeText(values.authorName) &&
      values.authorNumber &&
      candidate.values.authorNumber &&
      normalizeText(values.authorNumber) !== normalizeText(candidate.values.authorNumber)
    ) {
      add('authorNumber', 'Author name has conflicting numbers in this batch');
      break;
    }
  }

  if (values.authorName) {
    const name = normalizeText(values.authorName);
    const authors = await tx.author.findMany({
      where: {
        OR: [
          { normalizedName: name },
          ...(values.authorNumber
            ? [{ authorNumber: { equals: values.authorNumber, mode: 'insensitive' as const } }]
            : []),
        ],
      },
      select: { id: true, normalizedName: true, authorNumber: true, archivedAt: true },
    });
    const matching = values.authorNumber
      ? authors.filter(
          (author) =>
            author.authorNumber?.toLowerCase() === values.authorNumber.toLowerCase() &&
            author.normalizedName === name,
        )
      : authors.filter((author) => author.normalizedName === name);
    if (
      matching.length === 1 &&
      !matching[0]!.archivedAt &&
      (!values.authorNumber ||
        authors.every((author) => author.id === matching[0]!.id || author.normalizedName === name))
    )
      authorId = matching[0]!.id;
    else if (authors.length)
      add(
        'authorName',
        'Author is ambiguous, archived, or conflicts with the author number; review the catalogue',
      );
  }

  if (parsed.isbn) {
    const editions = await tx.bookEdition.findMany({
      where: {
        OR: [
          { isbn13: parsed.isbn.isbn13 },
          ...(parsed.isbn.isbn10 ? [{ isbn10: parsed.isbn.isbn10 }] : []),
        ],
      },
      include: { book: { include: { authors: true } } },
    });
    if (editions.length > 1) add('isbn', 'ISBN matches multiple editions; review the catalogue');
    else if (editions.length === 1) {
      const edition = editions[0]!;
      if (
        edition.archivedAt ||
        edition.book.archivedAt ||
        (edition.isbn13 && edition.isbn13 !== parsed.isbn.isbn13) ||
        (edition.isbn10 && edition.isbn10 !== parsed.isbn.isbn10) ||
        edition.book.normalizedTitle !== normalizeText(values.title)
      )
        add(
          'isbn',
          'ISBN matches an archived or inconsistent edition, or a different title; review the catalogue',
        );
      else if (
        values.authorName &&
        (!authorId ||
          !edition.book.authors.some(
            (author) => author.authorId === authorId && author.role === 'AUTHOR',
          ))
      )
        add('authorName', 'Author does not match the ISBN edition; review the catalogue');
      else editionId = edition.id;
    }
  }
  if (
    !editionId &&
    values.title &&
    (!parsed.isbn || !errors.some((error) => error.field === 'isbn'))
  ) {
    const existing = await tx.book.findFirst({
      where: { normalizedTitle: normalizeText(values.title) },
      select: { id: true },
    });
    if (existing)
      add(
        'title',
        'Title already exists without an unambiguous matching ISBN; review the catalogue',
      );
  }

  if (values.shelfRack) {
    const parts = values.shelfRack
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);
    const term = parts.at(-1) ?? '';
    const shelves = await tx.shelf.findMany({
      where: {
        OR: [
          { code: { equals: term, mode: 'insensitive' } },
          { rack: { code: { equals: term, mode: 'insensitive' } } },
        ],
      },
      include: {
        rack: { include: { room: { include: { floor: { include: { building: true } } } } } },
      },
    });
    const matches = shelves.filter((shelf) => {
      const rack = shelf.rack;
      const floor = rack.room.floor;
      if (
        shelf.archivedAt ||
        rack.archivedAt ||
        rack.room.archivedAt ||
        floor.archivedAt ||
        floor.building.archivedAt
      )
        return false;
      if (parts.length === 1) return true;
      const path = [floor.building.code, floor.code, rack.room.code, rack.code, shelf.code];
      return (
        parts.length === 5 &&
        parts.every((part, index) => normalizeText(part) === normalizeText(path[index]!))
      );
    });
    if (matches.length !== 1)
      add(
        'shelfRack',
        'Location must identify exactly one active shelf; use building / floor / room / rack / shelf when needed',
      );
    else {
      const shelf = matches[0]!;
      shelfId = shelf.id;
      if (shelf.capacity !== null) {
        const occupied = await tx.bookCopy.count({
          where: { shelfId, archivedAt: null, status: { not: 'DISCARDED' } },
        });
        if (occupied >= shelf.capacity) add('shelfRack', 'Shelf capacity has been reached');
      }
    }
  }
  const duplicate =
    errors.some(
      (error) => error.field === 'accessionNumber' && error.message.startsWith('Duplicate'),
    ) || !!duplicateOfCopyId;
  return {
    values,
    sourceErrors: data.sourceErrors,
    isbn: parsed.isbn,
    oldNew: parsed.oldNew,
    condition: parsed.condition,
    errors,
    duplicateOfCopyId,
    editionId,
    authorId,
    shelfId,
    status: errors.length
      ? duplicate
        ? ('DUPLICATE' as const)
        : ('INVALID' as const)
      : ('VALID' as const),
  };
}

async function revalidate(tx: Tx, batchId: string, rows: StagedRow[]) {
  for (const row of rows) {
    if (row.status === 'IMPORTED' || row.status === 'EXCLUDED') continue;
    const result = await assessImportRow(tx, row, rows);
    await tx.importRow.update({
      where: { id: row.id },
      data: {
        normalizedData: { values: result.values, sourceErrors: result.sourceErrors },
        status: result.status,
        errors: result.errors,
        duplicateOfCopyId: result.duplicateOfCopyId,
      },
    });
  }
  const counts = await tx.importRow.groupBy({ by: ['status'], where: { batchId }, _count: true });
  const count = (status: string) => counts.find((entry) => entry.status === status)?._count ?? 0;
  await tx.importBatch.update({
    where: { id: batchId },
    data: {
      status: count('IMPORTED') === rows.length ? 'COMPLETED' : 'VALIDATED',
      validRows: count('VALID'),
      invalidRows: count('INVALID'),
      duplicateRows: count('DUPLICATE'),
      importedRows: count('IMPORTED'),
      ...(count('IMPORTED') === rows.length ? { completedAt: new Date() } : {}),
    },
  });
}

export async function uploadImport(buffer: Buffer, fileName: string, ctx: AuditRequestContext) {
  const rows = await parseWorkbook(buffer);
  const prisma = getPrisma();
  const id = await prisma.$transaction(
    async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          fileName: fileName.slice(0, 255),
          fileSizeBytes: buffer.length,
          fileSha256: createHash('sha256').update(buffer).digest('hex'),
          profile: 'xlsx-v1',
          createdById: ctx.userId!,
          totalRows: rows.length,
          rows: {
            create: rows.map((row) => ({
              rowNumber: row.rowNumber,
              rawData: JSON.parse(
                JSON.stringify({
                  values: row.values,
                  sourceErrors: row.sourceErrors,
                  cells: row.cells,
                }),
              ) as Prisma.InputJsonValue,
            })),
          },
        },
        include: { rows: true },
      });
      await revalidate(tx, batch.id, batch.rows);
      await recordAudit(
        {
          action: 'imports.uploaded',
          entityType: 'ImportBatch',
          entityId: batch.id,
          after: { fileName: batch.fileName, totalRows: rows.length, fileSha256: batch.fileSha256 },
        },
        ctx,
        tx,
      );
      return batch.id;
    },
    { timeout: 120_000 },
  );
  return getImport(id);
}

export async function getImport(id: string) {
  const batch = await getPrisma().importBatch.findUnique({
    where: { id },
    include: { rows: { orderBy: { rowNumber: 'asc' } } },
  });
  if (!batch || batch.profile !== 'xlsx-v1') throw Errors.notFound('Import batch not found');
  return batch;
}

export async function correctRow(
  batchId: string,
  rowId: string,
  changes: Partial<ImportValues>,
  ctx: AuditRequestContext,
) {
  await getPrisma().$transaction(
    async (tx) => {
      const batch = await lockBatch(tx, batchId);
      const row = batch.rows.find((entry) => entry.id === rowId);
      if (!row) throw Errors.notFound('Import row not found');
      if (row.status === 'IMPORTED' || batch.status === 'COMPLETED')
        throw Errors.conflict('Imported rows cannot be changed');
      if (batch.status !== 'VALIDATED')
        throw Errors.conflict('Batch cannot be changed in its current state');
      const previous = stored(row);
      const next = {
        values: { ...previous.values, ...changes },
        sourceErrors: previous.sourceErrors.filter((error) => !(error.field in changes)),
      };
      await tx.importRow.update({ where: { id: rowId }, data: { normalizedData: next } });
      row.normalizedData = next;
      await revalidate(tx, batchId, batch.rows);
      await recordAudit(
        {
          action: 'imports.row_corrected',
          entityType: 'ImportRow',
          entityId: rowId,
          before: previous,
          after: next,
          metadata: { batchId },
        },
        ctx,
        tx,
      );
    },
    { timeout: 120_000 },
  );
  return getImport(batchId);
}

export async function confirmImport(batchId: string, rowIds: string[], ctx: AuditRequestContext) {
  await getPrisma().$transaction(
    async (tx) => {
      const batch = await lockBatch(tx, batchId);
      if (!['VALIDATED', 'COMPLETED'].includes(batch.status))
        throw Errors.conflict('Batch cannot be confirmed in its current state');
      const selected = rowIds.map((id) => batch.rows.find((row) => row.id === id));
      if (selected.some((row) => !row))
        throw Errors.validation([
          { path: 'rowIds', message: 'Every row must belong to this batch', code: 'custom' },
        ]);
      if (selected.every((row) => row!.status === 'IMPORTED')) return;
      if (selected.some((row) => row!.status !== 'VALID' && row!.status !== 'IMPORTED'))
        throw Errors.conflict('Only rows currently marked VALID can be confirmed');
      await tx.$executeRawUnsafe(
        'LOCK TABLE books, book_editions, book_authors, authors, book_copies, shelves, racks, rooms, floors, buildings IN SHARE ROW EXCLUSIVE MODE',
      );
      for (const row of selected) {
        if (!row || row.status === 'IMPORTED') continue;
        let result = await assessImportRow(tx, row, batch.rows);
        if (result.errors.length)
          throw new AppError(
            409,
            'IMPORT_REVALIDATION_FAILED',
            'Import data changed; correct or revalidate the batch',
            { rowId: row.id, rowNumber: row.rowNumber, errors: result.errors },
          );
        if (result.shelfId) {
          await tx.$queryRaw`SELECT id FROM shelves WHERE id = ${result.shelfId}::uuid FOR UPDATE`;
          result = await assessImportRow(tx, row, batch.rows);
          if (result.errors.length)
            throw new AppError(
              409,
              'IMPORT_REVALIDATION_FAILED',
              'Import data changed; correct or revalidate the batch',
              { rowId: row.id, rowNumber: row.rowNumber, errors: result.errors },
            );
        }
        let editionId = result.editionId;
        if (!editionId) {
          let authorId = result.authorId;
          if (result.values.authorName && !authorId) {
            const author = await tx.author.create({
              data: {
                name: result.values.authorName,
                normalizedName: normalizeText(result.values.authorName),
                authorNumber: result.values.authorNumber || null,
              },
            });
            authorId = author.id;
          }
          const book = await tx.book.create({
            data: {
              title: result.values.title,
              normalizedTitle: normalizeText(result.values.title),
              ...(authorId
                ? { authors: { create: { authorId, role: 'AUTHOR', position: 0 } } }
                : {}),
            },
          });
          const edition = await tx.bookEdition.create({
            data: {
              bookId: book.id,
              isbn13: result.isbn?.isbn13 ?? null,
              isbn10: result.isbn?.isbn10 ?? null,
              metadataSource: 'IMPORT',
            },
          });
          editionId = edition.id;
        }
        const copy = await tx.bookCopy.create({
          data: {
            editionId,
            accessionNumber: result.values.accessionNumber,
            barcode: result.values.accessionNumber,
            acquisitionType: result.oldNew === 'OLD' ? 'LEGACY_OLD_STOCK' : 'PURCHASED_NEW',
            acquisitionPrice: result.values.price || null,
            condition: result.condition as 'NEW' | 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED',
            status: 'PENDING_VERIFICATION',
            shelfId: result.shelfId,
          },
        });
        await tx.copyHistory.create({
          data: {
            copyId: copy.id,
            eventType: 'CREATED',
            toStatus: copy.status,
            toCondition: copy.condition,
            toShelfId: copy.shelfId,
            changedById: ctx.userId,
            reason: 'Excel import',
          },
        });
        await tx.importRow.update({
          where: { id: row.id },
          data: { status: 'IMPORTED', createdCopyId: copy.id, errors: [] },
        });
        row.status = 'IMPORTED';
        await recordAudit(
          {
            action: 'imports.copy_created',
            entityType: 'BookCopy',
            entityId: copy.id,
            after: { batchId, rowId: row.id, accessionNumber: copy.accessionNumber, editionId },
          },
          ctx,
          tx,
        );
      }
      await revalidate(tx, batchId, batch.rows);
      await tx.importBatch.update({ where: { id: batchId }, data: { confirmedAt: new Date() } });
      await recordAudit(
        {
          action: 'imports.confirmed',
          entityType: 'ImportBatch',
          entityId: batchId,
          after: { rowIds },
        },
        ctx,
        tx,
      );
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
  return getImport(batchId);
}

export async function errorReport(batchId: string): Promise<Buffer> {
  const batch = await getImport(batchId);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Errors');
  sheet.addRow(['rowNumber', 'status', ...IMPORT_COLUMNS, 'errors']);
  for (const row of batch.rows) {
    if (row.status === 'INVALID' || row.status === 'DUPLICATE' || row.status === 'FAILED') {
      const values = stored(row).values;
      sheet.addRow([
        row.rowNumber,
        row.status,
        ...IMPORT_COLUMNS.map((column) => values[column]),
        JSON.stringify(row.errors),
      ]);
    }
  }
  sheet.columns.forEach((column) => {
    column.width = 35;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
