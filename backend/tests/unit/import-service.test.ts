import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../src/generated/prisma/client.js';
import type { ImportValues } from '../../src/modules/imports/import-validation.js';

const database = vi.hoisted((): { client: Record<string, unknown> } => ({ client: {} }));
vi.mock('../../src/db/prisma.js', () => ({ getPrisma: () => database.client }));
import { assessImportRow, confirmImport } from '../../src/modules/imports/import.service.js';

const values: ImportValues = {
  title: 'Example',
  authorName: '',
  authorNumber: '',
  isbn: '9780141439518',
  accessionNumber: 'A-1',
  shelfRack: '',
  price: '',
  oldNew: 'OLD',
  condition: 'GOOD',
};
const makeRow = (id: string, changes: Partial<ImportValues> = {}) => ({
  id,
  rowNumber: 2,
  rawData: { values: { ...values, ...changes }, sourceErrors: [] },
  normalizedData: null,
  status: 'VALID',
  createdCopyId: null,
});

function mockTx() {
  return {
    bookCopy: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0) },
    bookEdition: { findMany: vi.fn().mockResolvedValue([]) },
    book: { findFirst: vi.fn().mockResolvedValue(null) },
    author: { findMany: vi.fn().mockResolvedValue([]) },
    shelf: { findMany: vi.fn().mockResolvedValue([]) },
  };
}
const asTx = (value: ReturnType<typeof mockTx>) => value as unknown as Prisma.TransactionClient;

describe('import matching', () => {
  it('flags case-insensitive duplicates in the batch and database', async () => {
    const tx = mockTx();
    tx.bookCopy.findFirst.mockResolvedValue({ id: 'existing-copy' });
    const row = makeRow('1');
    const result = await assessImportRow(asTx(tx), row, [
      row,
      makeRow('2', { accessionNumber: 'a-1' }),
    ]);
    expect(result.status).toBe('DUPLICATE');
    expect(result.duplicateOfCopyId).toBe('existing-copy');
    expect(result.errors.filter((error) => error.field === 'accessionNumber')).toHaveLength(2);
  });

  it('requires review for ambiguous ISBN matches and conflicting rows', async () => {
    const tx = mockTx();
    tx.bookEdition.findMany.mockResolvedValue([{ id: '1' }, { id: '2' }]);
    const row = makeRow('1');
    const result = await assessImportRow(asTx(tx), row, [
      row,
      makeRow('2', { title: 'Different', accessionNumber: 'A-2' }),
    ]);
    expect(result.errors.filter((error) => error.field === 'isbn')).toHaveLength(2);
    expect(result.editionId).toBeNull();
  });

  it('reuses an ISBN edition only when the title and author agree', async () => {
    const tx = mockTx();
    tx.author.findMany.mockResolvedValue([
      { id: 'author', normalizedName: 'writer', authorNumber: null, archivedAt: null },
    ]);
    tx.bookEdition.findMany.mockResolvedValue([
      {
        id: 'edition',
        archivedAt: null,
        book: {
          archivedAt: null,
          normalizedTitle: 'example',
          authors: [{ authorId: 'author', role: 'AUTHOR' }],
        },
      },
    ]);
    const row = makeRow('1', { authorName: 'Writer' });
    const result = await assessImportRow(asTx(tx), row, [row]);
    expect(result.status).toBe('VALID');
    expect(result.editionId).toBe('edition');
    tx.bookEdition.findMany.mockResolvedValue([
      {
        id: 'edition',
        archivedAt: null,
        book: { archivedAt: null, normalizedTitle: 'different', authors: [] },
      },
    ]);
    expect((await assessImportRow(asTx(tx), row, [row])).errors).toContainEqual(
      expect.objectContaining({ field: 'isbn' }),
    );
  });

  it('rejects ambiguous locations', async () => {
    const tx = mockTx();
    const shelf = {
      id: '1',
      archivedAt: null,
      capacity: null,
      rack: {
        archivedAt: null,
        room: { archivedAt: null, floor: { archivedAt: null, building: { archivedAt: null } } },
      },
    };
    tx.shelf.findMany.mockResolvedValue([shelf, { ...shelf, id: '2' }]);
    const row = makeRow('1', { shelfRack: 'R1' });
    expect((await assessImportRow(asTx(tx), row, [row])).errors).toContainEqual(
      expect.objectContaining({ field: 'shelfRack' }),
    );
  });
});

describe('confirmation retries', () => {
  beforeEach(() => {
    database.client = {};
  });
  it('returns already imported rows without creating or auditing again', async () => {
    const imported = { ...makeRow('1'), status: 'IMPORTED', createdCopyId: 'copy' };
    const batch = { id: 'batch', profile: 'xlsx-v1', status: 'COMPLETED', rows: [imported] };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'batch' }]),
      importBatch: { findUniqueOrThrow: vi.fn().mockResolvedValue(batch) },
    };
    database.client = {
      $transaction: async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
      importBatch: { findUnique: vi.fn().mockResolvedValue(batch) },
    };
    expect(await confirmImport('batch', ['1'], { userId: 'user' })).toEqual(batch);
  });

  it('creates a pending copy and its history and audits within the transaction', async () => {
    const row = makeRow('1');
    const batch = { id: 'batch', profile: 'xlsx-v1', status: 'VALIDATED', rows: [row] };
    const tx = {
      ...mockTx(),
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'batch' }]),
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      importBatch: {
        findUniqueOrThrow: vi.fn().mockResolvedValue(batch),
        update: vi.fn().mockResolvedValue({}),
      },
      importRow: {
        update: vi.fn().mockResolvedValue({}),
        groupBy: vi.fn().mockResolvedValue([{ status: 'IMPORTED', _count: 1 }]),
      },
      copyHistory: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    tx.bookEdition.findMany.mockResolvedValue([
      {
        id: 'edition',
        archivedAt: null,
        book: { archivedAt: null, normalizedTitle: 'example', authors: [] },
      },
    ]);
    const createCopy = vi.fn().mockResolvedValue({
      id: 'copy',
      accessionNumber: 'A-1',
      status: 'PENDING_VERIFICATION',
      condition: 'GOOD',
      shelfId: null,
    });
    Object.assign(tx.bookCopy, { create: createCopy });
    database.client = {
      $transaction: async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
      importBatch: { findUnique: vi.fn().mockResolvedValue(batch) },
    };
    await confirmImport('batch', ['1'], { userId: 'user' });
    expect(createCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          editionId: 'edition',
          status: 'PENDING_VERIFICATION',
          accessionNumber: 'A-1',
        }),
      }),
    );
    expect(tx.copyHistory.create).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
    expect(tx.$executeRawUnsafe).toHaveBeenCalledOnce();
  });

  it('rejects a row that acquired a duplicate after preview', async () => {
    const row = makeRow('1');
    const batch = { id: 'batch', profile: 'xlsx-v1', status: 'VALIDATED', rows: [row] };
    const tx = {
      ...mockTx(),
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'batch' }]),
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      importBatch: { findUniqueOrThrow: vi.fn().mockResolvedValue(batch) },
    };
    tx.bookCopy.findFirst.mockResolvedValue({ id: 'existing' });
    database.client = {
      $transaction: async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
    };
    await expect(confirmImport('batch', ['1'], { userId: 'user' })).rejects.toMatchObject({
      code: 'IMPORT_REVALIDATION_FAILED',
    });
  });
});
