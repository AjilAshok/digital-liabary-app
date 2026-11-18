import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectPrisma, getPrisma } from '../../src/db/prisma.js';
import { ensureUser, seedAccessControl } from '../../src/db/seed-core.js';
import { resetDomainData } from '../helpers/reset-domain.js';

const app = createApp();
const prisma = getPrisma();
const ADMIN = {
  email: 'catalogue-admin@test.local',
  password: 'Catalogue-Pass-2026',
  fullName: 'Catalogue Admin',
};
const ISBN = '9780306406157';
let cookie = '';

async function login(): Promise<void> {
  const response = await request(app).post('/api/v1/auth/login').send(ADMIN);
  expect(response.status).toBe(200);
  const raw = response.headers['set-cookie'] as unknown as string[];
  cookie = raw.find((value) => value.startsWith('dlms_session='))!.split(';')[0]!;
}

beforeAll(async () => {
  await resetDomainData(prisma);
  await seedAccessControl(prisma);
  await ensureUser(prisma, { ...ADMIN, roleCode: 'ADMIN' });
  await prisma.numberSequence.create({
    data: { key: 'ACCESSION', prefix: 'TEST-', padding: 4, nextValue: 1 },
  });
  await login();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('catalogue and physical-copy workflow', () => {
  it('creates a title/edition once, then registers multiple unique copies on that edition', async () => {
    const created = await request(app)
      .post('/api/v1/books')
      .set('Cookie', cookie)
      .send({
        title: 'The Left Hand of Darkness',
        subtitle: null,
        description: null,
        originalLanguage: 'English',
        categoryId: null,
        authors: [{ name: 'Ursula K. Le Guin', role: 'AUTHOR' }],
        edition: {
          isbn: ISBN,
          editionStatement: 'First edition',
          publisherId: null,
          publicationYear: 1969,
          language: 'English',
          pageCount: 304,
          format: 'Hardcover',
        },
      });

    expect(created.status).toBe(201);
    const bookId = created.body.id as string;
    const editionId = created.body.editions[0].id as string;
    expect(created.body.authors[0].name).toBe('Ursula K. Le Guin');

    const duplicateIsbn = await request(app)
      .post('/api/v1/books')
      .set('Cookie', cookie)
      .send({
        title: 'Different title text',
        authors: [],
        edition: { isbn: ISBN },
      });
    expect(duplicateIsbn.status).toBe(409);
    expect(duplicateIsbn.body.error.code).toBe('DUPLICATE_ISBN');
    expect(duplicateIsbn.body.error.details.matches[0].editionId).toBe(editionId);

    const duplicateTitle = await request(app)
      .post('/api/v1/books')
      .set('Cookie', cookie)
      .send({ title: 'The Left Hand of Darkness', authors: [], edition: { isbn: null } });
    expect(duplicateTitle.status).toBe(409);
    expect(duplicateTitle.body.error.code).toBe('POSSIBLE_DUPLICATE_TITLE');

    const registered = await request(app)
      .post(`/api/v1/editions/${editionId}/copies`)
      .set('Cookie', cookie)
      .send({
        quantity: 3,
        accessionMode: 'auto',
        acquisitionType: 'LEGACY_OLD_STOCK',
        acquisitionDate: null,
        acquisitionPrice: null,
        condition: 'GOOD',
        status: 'AVAILABLE',
        shelfId: null,
        remarks: null,
      });

    expect(registered.status).toBe(201);
    expect(registered.body.bookId).toBe(bookId);
    expect(registered.body.editionId).toBe(editionId);
    const accessionNumbers = registered.body.copies.map(
      (copy: { accessionNumber: string }) => copy.accessionNumber,
    );
    expect(accessionNumbers).toEqual(['TEST-0001', 'TEST-0002', 'TEST-0003']);
    expect(new Set(accessionNumbers).size).toBe(3);

    const duplicateAccession = await request(app)
      .post(`/api/v1/editions/${editionId}/copies`)
      .set('Cookie', cookie)
      .send({
        quantity: 1,
        accessionMode: 'manual',
        accessionNumbers: ['TEST-0001'],
        acquisitionType: 'LEGACY_OLD_STOCK',
        acquisitionDate: null,
        acquisitionPrice: null,
        condition: 'GOOD',
        status: 'AVAILABLE',
        shelfId: null,
        remarks: null,
      });
    expect(duplicateAccession.status).toBe(409);
    expect(duplicateAccession.body.error.code).toBe('DUPLICATE_ACCESSION');

    const listing = await request(app)
      .get(`/api/v1/copies?editionId=${editionId}&page=1&pageSize=10`)
      .set('Cookie', cookie);
    expect(listing.status).toBe(200);
    expect(listing.body.meta.total).toBe(3);

    const book = await request(app).get(`/api/v1/books/${bookId}`).set('Cookie', cookie);
    expect(book.status).toBe(200);
    expect(book.body.editions).toHaveLength(1);
    expect(book.body.editions[0].copies).toEqual({ holdings: 3, available: 3 });
  });
});
