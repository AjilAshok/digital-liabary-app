import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectPrisma, getPrisma } from '../../src/db/prisma.js';
import { ensureUser, seedAccessControl } from '../../src/db/seed-core.js';
import { normalizeText } from '../../src/lib/text.js';
import { resetDomainData } from '../helpers/reset-domain.js';

const app = createApp();
const prisma = getPrisma();
const ADMIN = {
  email: 'search-admin@test.local',
  password: 'Search-Pass-2026',
  fullName: 'Search Admin',
};
let cookie = '';
let ids: {
  book: string;
  author: string;
  category: string;
  publisher: string;
  shelf: string;
  rack: string;
  copy: string;
};

async function login(): Promise<void> {
  const response = await request(app).post('/api/v1/auth/login').send(ADMIN);
  expect(response.status).toBe(200);
  const raw = response.headers['set-cookie'] as unknown as string[];
  cookie = raw.find((value) => value.startsWith('dlms_session='))!.split(';')[0]!;
}

beforeAll(async () => {
  await resetDomainData(prisma);
  await seedAccessControl(prisma);
  const admin = await ensureUser(prisma, { ...ADMIN, roleCode: 'ADMIN' });
  await login();

  const [category, publisher, author, building, supplier, memberType] = await Promise.all([
    prisma.category.create({ data: { name: 'Literature', normalizedName: 'literature' } }),
    prisma.publisher.create({ data: { name: 'Scribner', normalizedName: 'scribner' } }),
    prisma.author.create({
      data: {
        name: 'F. Scott Fitzgerald',
        normalizedName: normalizeText('F. Scott Fitzgerald'),
        authorNumber: 'FSF-01',
      },
    }),
    prisma.building.create({ data: { code: 'MAIN', name: 'Main Library' } }),
    prisma.supplier.create({ data: { name: 'Book House', normalizedName: 'book house' } }),
    prisma.memberType.create({
      data: {
        code: 'SEARCH',
        name: 'Search Test',
        maxActiveLoans: 5,
        loanPeriodDays: 14,
        maxRenewals: 1,
        finePerDay: '0',
        reservationHoldDays: 3,
      },
    }),
  ]);
  const floor = await prisma.floor.create({
    data: { buildingId: building.id, code: 'G', name: 'Ground floor' },
  });
  const room = await prisma.room.create({
    data: { floorId: floor.id, code: 'FIC', name: 'Fiction' },
  });
  const rack = await prisma.rack.create({ data: { roomId: room.id, code: 'R07', name: 'Rack 7' } });
  const shelf = await prisma.shelf.create({
    data: { rackId: rack.id, code: 'S-12', name: 'Shelf 12', capacity: 10 },
  });
  const book = await prisma.book.create({
    data: {
      title: 'The Great Gatsby',
      subtitle: 'A Novel',
      normalizedTitle: normalizeText('The Great Gatsby'),
      categoryId: category.id,
      authors: { create: { authorId: author.id, role: 'AUTHOR', position: 0 } },
      editions: {
        create: {
          isbn13: '9780743273565',
          isbn10: '0743273567',
          editionStatement: 'Modern Library edition',
          publisherId: publisher.id,
          publicationYear: 2004,
        },
      },
    },
    include: { editions: true },
  });
  const edition = book.editions[0]!;
  const purchase = await prisma.purchase.create({
    data: {
      supplierId: supplier.id,
      invoiceNumber: 'INV-SEARCH-1',
      invoiceDate: new Date('2026-01-15T00:00:00.000Z'),
      status: 'RECEIVED',
      totalAmount: '25.00',
      createdById: admin.id,
    },
  });
  const item = await prisma.purchaseItem.create({
    data: {
      purchaseId: purchase.id,
      editionId: edition.id,
      quantity: 1,
      receivedQuantity: 1,
      unitPrice: '25.00',
      lineTotal: '25.00',
    },
  });
  const copy = await prisma.bookCopy.create({
    data: {
      accessionNumber: 'SEARCH-0001',
      editionId: edition.id,
      supplierId: supplier.id,
      purchaseItemId: item.id,
      acquisitionType: 'PURCHASED_NEW',
      acquisitionDate: new Date('2026-01-15T00:00:00.000Z'),
      acquisitionPrice: '25.00',
      condition: 'GOOD',
      status: 'AVAILABLE',
      shelfId: shelf.id,
    },
  });
  const member = await prisma.member.create({
    data: {
      membershipNumber: 'SEARCH-M-1',
      fullName: 'Search Member',
      memberTypeId: memberType.id,
    },
  });
  await prisma.loan.create({
    data: {
      copyId: copy.id,
      memberId: member.id,
      issuedById: admin.id,
      issuedAt: new Date('2026-02-01T10:00:00.000Z'),
      dueAt: new Date('2026-02-15T10:00:00.000Z'),
      returnedAt: new Date('2026-02-10T10:00:00.000Z'),
      returnedById: admin.id,
      status: 'RETURNED',
    },
  });
  await prisma.copyHistory.create({
    data: {
      copyId: copy.id,
      eventType: 'CREATED',
      toStatus: 'AVAILABLE',
      toCondition: 'GOOD',
      toShelfId: shelf.id,
      reason: 'Seeded search fixture',
      changedById: admin.id,
    },
  });
  ids = {
    book: book.id,
    author: author.id,
    category: category.id,
    publisher: publisher.id,
    shelf: shelf.id,
    rack: rack.id,
    copy: copy.id,
  };
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('advanced library search', () => {
  it('finds full and partial titles and returns matching editions with physical copies', async () => {
    for (const q of ['The Great Gatsby', 'great gats', 'The Great Gatsbi']) {
      const response = await request(app)
        .get(`/api/v1/search?q=${encodeURIComponent(q)}`)
        .set('Cookie', cookie);
      expect(response.status).toBe(200);
      expect(response.body.books.data[0]).toMatchObject({
        id: ids.book,
        title: 'The Great Gatsby',
        editions: [
          {
            isbn10: '0743273567',
            isbn13: '9780743273565',
            copies: [{ accessionNumber: 'SEARCH-0001' }],
          },
        ],
      });
    }
  });

  it('searches ISBN-10, ISBN-13, author name, author number, publisher, category, shelf and rack', async () => {
    const queries = [
      '0743273567',
      '9780743273565',
      'F. Scott Fitzgerald',
      'FSF-01',
      'Scribner',
      'Literature',
      'S-12',
      'R07',
    ];
    for (const q of queries) {
      const response = await request(app)
        .get(`/api/v1/search?q=${encodeURIComponent(q)}`)
        .set('Cookie', cookie);
      expect(response.status, q).toBe(200);
      expect(
        response.body.books.data.some((book: { id: string }) => book.id === ids.book),
        q,
      ).toBe(true);
    }
    const author = await request(app).get('/api/v1/search?q=Fitzgeral').set('Cookie', cookie);
    expect(author.body.authors[0]).toMatchObject({ id: ids.author, titles: 1, copies: 1 });
    expect(author.body.authors[0].books[0].title).toBe('The Great Gatsby');
  });

  it('applies category, publisher, shelf, rack, stock type and status filters', async () => {
    const response = await request(app)
      .get(
        `/api/v1/search?q=Gatsby&categoryId=${ids.category}&publisherId=${ids.publisher}&shelfId=${ids.shelf}&rackId=${ids.rack}&stockType=new&status=AVAILABLE`,
      )
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.books.meta.total).toBe(1);
    expect(response.body.books.data[0].editions[0].copies[0]).toMatchObject({
      accessionNumber: 'SEARCH-0001',
      status: 'AVAILABLE',
      acquisitionType: 'PURCHASED_NEW',
      shelf: { path: 'MAIN / G / FIC / R07 / S-12' },
    });
  });

  it('resolves an accession to the exact copy and includes purchase and circulation history', async () => {
    const response = await request(app).get('/api/v1/search?q=SEARCH-0001').set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.exactCopy).toMatchObject({
      id: ids.copy,
      accessionNumber: 'SEARCH-0001',
      purchase: { invoiceNumber: 'INV-SEARCH-1', supplier: 'Book House' },
      transactions: [{ status: 'RETURNED', member: { membershipNumber: 'SEARCH-M-1' } }],
      history: [{ reason: 'Seeded search fixture' }],
    });
  });

  it('paginates book stock with shelf, acquisition, purchase and transaction details', async () => {
    const response = await request(app)
      .get(`/api/v1/books/${ids.book}/stock?page=1&pageSize=10`)
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.meta.total).toBe(1);
    expect(response.body.data[0]).toMatchObject({
      accessionNumber: 'SEARCH-0001',
      shelf: { path: 'MAIN / G / FIC / R07 / S-12' },
      purchase: { invoiceNumber: 'INV-SEARCH-1' },
      transactions: [{ status: 'RETURNED' }],
    });
  });

  it('executes indexed PostgreSQL full-text/trigram predicates within the performance budget', async () => {
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw<{ 'QUERY PLAN': string }[]>`
        EXPLAIN (ANALYZE, BUFFERS)
        SELECT b.id FROM books b
        WHERE to_tsvector('simple', coalesce(b."title", '') || ' ' || coalesce(b."subtitle", '') || ' ' || coalesce(b."description", ''))
                @@ websearch_to_tsquery('simple', 'The Great Gatsbi')
           OR b."normalizedTitle" % 'the great gatsbi'
        ORDER BY GREATEST(
          ts_rank_cd(to_tsvector('simple', coalesce(b."title", '') || ' ' || coalesce(b."subtitle", '') || ' ' || coalesce(b."description", '')), websearch_to_tsquery('simple', 'The Great Gatsbi')),
          similarity(b."normalizedTitle", 'the great gatsbi')
        ) DESC
        LIMIT 20`;
    });
    const explain = plan.map((row) => row['QUERY PLAN']).join('\n');
    expect(explain).toMatch(/books_search_fts_idx|books_normalizedTitle_trgm_idx/);
    const execution = explain.match(/Execution Time: ([\d.]+) ms/);
    expect(execution).not.toBeNull();
    expect(Number(execution![1])).toBeLessThan(5000);
  });
});
