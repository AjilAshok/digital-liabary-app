import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { disconnectPrisma, getPrisma } from '../../src/db/prisma.js';
import { ensureUser, seedAccessControl } from '../../src/db/seed-core.js';
import { resetDomainData } from '../helpers/reset-domain.js';

const app = createApp();
const prisma = getPrisma();
const ADMIN = {
  email: 'locations-admin@test.local',
  password: 'Locations-Pass-2026',
  fullName: 'Locations Admin',
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

describe('location management and shelf stock', () => {
  it('validates hierarchy, capacity, copy movement, edit and shelf report totals', async () => {
    const building = await request(app)
      .post('/api/v1/locations/buildings')
      .set('Cookie', cookie)
      .send({ code: 'MAIN', name: 'Main Library', address: '1 Library Way' });
    expect(building.status).toBe(201);

    const floor = await request(app)
      .post('/api/v1/locations/floors')
      .set('Cookie', cookie)
      .send({ parentId: building.body.id, code: 'G', name: 'Ground floor', level: 0 });
    expect(floor.status).toBe(201);

    const room = await request(app)
      .post('/api/v1/locations/rooms')
      .set('Cookie', cookie)
      .send({ parentId: floor.body.id, code: 'HIS', name: 'History room' });
    expect(room.status).toBe(201);

    const rack = await request(app)
      .post('/api/v1/locations/racks')
      .set('Cookie', cookie)
      .send({ parentId: room.body.id, code: 'R01', name: 'Rack one' });
    expect(rack.status).toBe(201);

    const shelf = await request(app)
      .post('/api/v1/locations/shelves')
      .set('Cookie', cookie)
      .send({ parentId: rack.body.id, code: 'S-01', name: 'Shelf one', capacity: 1 });
    expect(shelf.status).toBe(201);

    const nextShelf = await request(app)
      .post('/api/v1/locations/shelves')
      .set('Cookie', cookie)
      .send({ parentId: rack.body.id, code: 'S-02', capacity: 2 });
    expect(nextShelf.status).toBe(201);

    const wrongParent = await request(app)
      .post('/api/v1/locations/rooms')
      .set('Cookie', cookie)
      .send({ parentId: building.body.id, code: 'BAD' });
    expect(wrongParent.status).toBe(404);

    const book = await request(app)
      .post('/api/v1/books')
      .set('Cookie', cookie)
      .send({
        title: 'Shelf Location Test',
        authors: [],
        edition: { isbn: null },
      });
    expect(book.status).toBe(201);
    const editionId = book.body.editions[0].id as string;

    const registered = await request(app)
      .post(`/api/v1/editions/${editionId}/copies`)
      .set('Cookie', cookie)
      .send({
        quantity: 1,
        accessionMode: 'manual',
        accessionNumbers: ['LOC-001'],
        acquisitionType: 'LEGACY_OLD_STOCK',
        acquisitionDate: null,
        acquisitionPrice: null,
        condition: 'GOOD',
        status: 'AVAILABLE',
        shelfId: shelf.body.id,
        remarks: null,
      });
    expect(registered.status).toBe(201);
    const copyId = registered.body.copies[0].id as string;

    const capacityConflict = await request(app)
      .post(`/api/v1/editions/${editionId}/copies`)
      .set('Cookie', cookie)
      .send({
        quantity: 1,
        accessionMode: 'manual',
        accessionNumbers: ['LOC-002'],
        acquisitionType: 'LEGACY_OLD_STOCK',
        acquisitionDate: null,
        acquisitionPrice: null,
        condition: 'GOOD',
        status: 'AVAILABLE',
        shelfId: shelf.body.id,
        remarks: null,
      });
    expect(capacityConflict.status).toBe(409);
    expect(capacityConflict.body.error.code).toBe('SHELF_CAPACITY_REACHED');

    const move = await request(app)
      .post(`/api/v1/locations/copies/${copyId}/move`)
      .set('Cookie', cookie)
      .send({ shelfId: nextShelf.body.id, reason: 'Reorganize history stock' });
    expect(move.status).toBe(200);
    expect(move.body).toMatchObject({ fromShelfId: shelf.body.id, toShelfId: nextShelf.body.id });

    const report = await request(app)
      .get('/api/v1/locations/reports/shelves?search=S-02&page=1&pageSize=10')
      .set('Cookie', cookie);
    expect(report.status).toBe(200);
    expect(report.body.meta.total).toBe(1);
    expect(report.body.data[0]).toMatchObject({
      id: nextShelf.body.id,
      copies: 1,
      titles: 1,
      available: 1,
      oldStock: 1,
    });

    const update = await request(app)
      .patch(`/api/v1/locations/shelves/${nextShelf.body.id}`)
      .set('Cookie', cookie)
      .send({ capacity: 0 });
    expect(update.status).toBe(409);
    expect(update.body.error.code).toBe('SHELF_CAPACITY_TOO_SMALL');

    const shelfSearch = await request(app)
      .get(`/api/v1/copies?shelfId=${nextShelf.body.id}&page=1&pageSize=10`)
      .set('Cookie', cookie);
    expect(shelfSearch.status).toBe(200);
    expect(shelfSearch.body.data[0].accessionNumber).toBe('LOC-001');
  });
});
