import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectPrisma, getPrisma } from '../../src/db/prisma.js';
import { ensureUser, seedAccessControl } from '../../src/db/seed-core.js';
import { resetDomainData } from '../helpers/reset-domain.js';

const app = createApp();
const prisma = getPrisma();
const ADMIN = {
  email: 'scanner-admin@test.local',
  password: 'Scanner-Pass-2026',
  fullName: 'Scanner Admin',
};
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
  await login();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('ISBN scanner workflow', () => {
  it('returns local edition matches before using external providers and logs invalid scans', async () => {
    const book = await prisma.book.create({
      data: {
        title: 'Local ISBN Fixture',
        normalizedTitle: 'local isbn fixture',
        editions: {
          create: {
            isbn13: '9780306406157',
            isbn10: '0306406152',
            editionStatement: 'Test edition',
          },
        },
      },
      include: { editions: true },
    });

    const local = await request(app)
      .post('/api/v1/scanner/isbn-lookup')
      .set('Cookie', cookie)
      .send({ isbn: '0-306-40615-2' });
    expect(local.status).toBe(200);
    expect(local.body).toMatchObject({
      valid: true,
      isbn13: '9780306406157',
      localMatches: [
        { bookId: book.id, editionId: book.editions[0]!.id, title: 'Local ISBN Fixture' },
      ],
      suggestions: [],
    });

    const invalid = await request(app)
      .post('/api/v1/scanner/isbn-lookup')
      .set('Cookie', cookie)
      .send({ isbn: '9780306406158' });
    expect(invalid.status).toBe(200);
    expect(invalid.body).toMatchObject({ valid: false, localMatches: [], suggestions: [] });
    const invalidLog = await prisma.scanLog.findFirstOrThrow({
      where: { user: { email: ADMIN.email }, rawValue: '9780306406158' },
    });
    expect(invalidLog.outcome).toBe('INVALID_INPUT');
  });

  it('requires explicit metadata confirmation and never creates physical copies during lookup/confirmation', async () => {
    const confirmed = await request(app)
      .post('/api/v1/scanner/confirm-metadata')
      .set('Cookie', cookie)
      .send({
        provider: 'OPEN_LIBRARY',
        externalId: '/works/OL999W',
        isbn: '9780140449136',
        isbn13: '9780140449136',
        title: 'Confirmed Metadata Fixture',
        subtitle: 'A reviewed subtitle',
        editionStatement: 'Reviewed edition',
        authors: ['Test Author'],
        publisher: 'Test Publisher',
        publicationYear: 2020,
        description: 'Human-reviewed provider suggestion.',
        language: 'en',
        pageCount: 240,
        confidence: 0.9,
      });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.title).toBe('Confirmed Metadata Fixture');
    expect(await prisma.bookCopy.count({ where: { editionId: confirmed.body.editionId } })).toBe(0);

    const duplicate = await request(app)
      .post('/api/v1/scanner/confirm-metadata')
      .set('Cookie', cookie)
      .send({
        provider: 'OPEN_LIBRARY',
        externalId: '/works/OL999W',
        isbn: '9780140449136',
        isbn13: '9780140449136',
        title: 'Another Title',
        authors: [],
        confidence: 0.8,
      });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('DUPLICATE_ISBN');
    expect(await prisma.bookCopy.count({ where: { editionId: confirmed.body.editionId } })).toBe(0);
  });

  it('confirms OCR-assisted title metadata without creating a physical copy', async () => {
    const confirmed = await request(app)
      .post('/api/v1/scanner/confirm-ocr-metadata')
      .set('Cookie', cookie)
      .send({
        title: 'OCR Metadata Fixture',
        subtitle: 'A reviewed subtitle',
        authors: ['Cover Author'],
        publisher: 'Cover Press',
        publicationYear: 2022,
        language: 'en',
        pageCount: 180,
        provider: 'GOOGLE_CLOUD_VISION',
        confidence: 0.88,
      });

    expect(confirmed.status).toBe(201);
    expect(confirmed.body.title).toBe('OCR Metadata Fixture');
    expect(await prisma.bookCopy.count({ where: { editionId: confirmed.body.editionId } })).toBe(0);
  });

  it('rejects cover uploads whose bytes do not match an allowed image type', async () => {
    const response = await request(app)
      .post('/api/v1/scanner/cover-ocr')
      .set('Cookie', cookie)
      .attach('cover', Buffer.from('not an image'), {
        filename: 'cover.png',
        contentType: 'image/png',
      });

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});
