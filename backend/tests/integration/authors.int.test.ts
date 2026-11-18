import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectPrisma, getPrisma } from '../../src/db/prisma.js';
import { ensureUser, seedAccessControl } from '../../src/db/seed-core.js';
import { resetDomainData } from '../helpers/reset-domain.js';

const app = createApp();
const prisma = getPrisma();
const ADMIN = {
  email: 'authors-admin@test.local',
  password: 'Authors-Pass-2026',
  fullName: 'Authors Admin',
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

describe('author management', () => {
  it('creates, searches, edits and displays an author with linked titles and physical-copy totals', async () => {
    const created = await request(app).post('/api/v1/authors').set('Cookie', cookie).send({
      name: '  Ursula   K. Le Guin ',
      authorNumber: 'L-42',
      description: 'American novelist and essayist.',
      nationality: 'American',
      dateOfBirth: '1929-10-21',
    });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Ursula K. Le Guin',
      authorNumber: 'L-42',
      nationality: 'American',
      dateOfBirth: '1929-10-21',
    });
    const authorId = created.body.id as string;

    const duplicateName = await request(app)
      .post('/api/v1/authors')
      .set('Cookie', cookie)
      .send({ name: 'ursula k.   le guin' });
    expect(duplicateName.status).toBe(409);
    expect(duplicateName.body.error.code).toBe('POSSIBLE_DUPLICATE_AUTHOR');
    expect(duplicateName.body.error.details.matches[0].id).toBe(authorId);

    const confirmedNamesake = await request(app)
      .post('/api/v1/authors')
      .set('Cookie', cookie)
      .send({ name: 'Ursula K. Le Guin', authorNumber: 'L-43', confirmDuplicateName: true });
    expect(confirmedNamesake.status).toBe(201);

    const duplicateNumber = await request(app)
      .post('/api/v1/authors')
      .set('Cookie', cookie)
      .send({ name: 'Another Person', authorNumber: 'L-42' });
    expect(duplicateNumber.status).toBe(409);
    expect(duplicateNumber.body.error.code).toBe('DUPLICATE_AUTHOR_NUMBER');

    const coauthor = await request(app)
      .post('/api/v1/authors')
      .set('Cookie', cookie)
      .send({ name: 'Octavia E. Butler', authorNumber: 'B-10' });
    expect(coauthor.status).toBe(201);

    const book = await request(app)
      .post('/api/v1/books')
      .set('Cookie', cookie)
      .send({
        title: 'The Dispossessed',
        authors: [
          { authorId, role: 'AUTHOR' },
          { authorId: coauthor.body.id, role: 'EDITOR' },
        ],
        edition: { isbn: null, editionStatement: 'First edition' },
      });
    expect(book.status).toBe(201);
    const editionId = book.body.editions[0].id as string;

    const copies = await request(app)
      .post(`/api/v1/editions/${editionId}/copies`)
      .set('Cookie', cookie)
      .send({
        quantity: 2,
        accessionMode: 'manual',
        accessionNumbers: ['AUTH-001', 'AUTH-002'],
        acquisitionType: 'LEGACY_OLD_STOCK',
        acquisitionDate: null,
        acquisitionPrice: null,
        condition: 'GOOD',
        status: 'AVAILABLE',
        shelfId: null,
        remarks: null,
      });
    expect(copies.status).toBe(201);

    const list = await request(app)
      .get('/api/v1/authors?search=L-42&page=1&pageSize=10')
      .set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ id: authorId, titles: 1, copies: 2 });

    const profile = await request(app).get(`/api/v1/authors/${authorId}`).set('Cookie', cookie);
    expect(profile.status).toBe(200);
    expect(profile.body).toMatchObject({
      id: authorId,
      titles: 1,
      copies: 2,
      books: [{ id: book.body.id, title: 'The Dispossessed', role: 'AUTHOR' }],
    });

    const updated = await request(app)
      .put(`/api/v1/authors/${authorId}`)
      .set('Cookie', cookie)
      .send({
        name: 'Ursula K. Le Guin',
        authorNumber: 'L-42',
        description: 'Updated biography.',
        nationality: 'United States',
        dateOfBirth: '1929-10-21',
      });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      description: 'Updated biography.',
      nationality: 'United States',
    });
  });

  it('requires explicit name-duplicate confirmation when an inline author is supplied for a book', async () => {
    const author = await request(app)
      .post('/api/v1/authors')
      .set('Cookie', cookie)
      .send({ name: 'Mary Shelley' });
    expect(author.status).toBe(201);

    const duplicate = await request(app)
      .post('/api/v1/books')
      .set('Cookie', cookie)
      .send({
        title: 'Frankenstein',
        authors: [{ name: ' mary  shelley ', role: 'AUTHOR' }],
        edition: { isbn: null },
      });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('POSSIBLE_DUPLICATE_AUTHOR');
  });
});
