import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { disconnectPrisma, getPrisma } from '../src/db/prisma.js';
import { ensureUser, seedAccessControl } from '../src/db/seed-core.js';
import { IMPORT_COLUMNS } from '../src/modules/imports/import-validation.js';

const databaseUrl = process.env['DATABASE_URL'];
assert.ok(databaseUrl, 'DATABASE_URL must explicitly point to the dedicated verification database');
const target = new URL(databaseUrl);
assert.equal(target.protocol, 'postgresql:');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.port, '55439');
assert.equal(target.username, 'phase1_test');
assert.equal(target.password, '');
assert.equal(target.pathname, '/digital_library_import_verify_20261117');
assert.equal(target.search, '');

process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'silent';
process.env['JWT_SECRET'] = randomBytes(32).toString('hex');

const prisma = getPrisma();
const fixtureId = randomBytes(8).toString('hex');
const accessionOne = `VERIFY-${fixtureId}-1`;
const accessionTwo = `VERIFY-${fixtureId}-2`;
const admin = {
  email: `import-verification-${randomBytes(8).toString('hex')}@example.test`,
  password: `Verification-Aa1-${randomBytes(16).toString('hex')}`,
  fullName: 'Import Verification',
};

try {
  const [database] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  assert.equal(database?.name, 'digital_library_import_verify_20261117');
  const initialCopyCount = await prisma.bookCopy.count();

  await seedAccessControl(prisma);
  const user = await ensureUser(prisma, { ...admin, roleCode: 'ADMIN' });
  const app = createApp();
  const agent = request.agent(app);
  await agent.post('/api/v1/auth/login').send(admin).expect(200);

  const template = await agent
    .get('/api/v1/imports/template')
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  assert.ok(Buffer.isBuffer(template.body), 'Template response must contain an XLSX buffer');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template.body as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet('Import');
  assert.ok(sheet);
  assert.deepEqual(
    IMPORT_COLUMNS.map((_, index) => sheet.getRow(1).getCell(index + 1).value),
    [...IMPORT_COLUMNS],
  );
  sheet.addRow([
    `Verification Title One ${fixtureId}`,
    `Verification Author ${fixtureId}`,
    '',
    '',
    accessionOne,
    '',
    '12.50',
    'OLD',
    'GOOD',
  ]);
  sheet.addRow([
    `Verification Title Two ${fixtureId}`,
    '',
    '',
    '',
    accessionOne,
    '',
    '',
    'NEW',
    'FAIR',
  ]);
  const fixture = Buffer.from(await workbook.xlsx.writeBuffer());

  const upload = await agent
    .post('/api/v1/imports/upload')
    .attach('file', fixture, 'verification.xlsx')
    .expect(201);
  type Batch = {
    id: string;
    rows: {
      id: string;
      status: string;
      createdCopyId: string | null;
      duplicateOfCopyId: string | null;
      errors: { field: string; message: string }[];
    }[];
  };
  const uploaded = upload.body as Batch;
  const batchId = uploaded.id;
  const rows = uploaded.rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.status),
    ['DUPLICATE', 'DUPLICATE'],
  );
  assert.ok(rows.every((row) => row.errors.some((error) => error.field === 'accessionNumber')));
  assert.equal(await prisma.bookCopy.count(), initialCopyCount);
  await agent
    .post(`/api/v1/imports/${batchId}/confirm`)
    .send({ rowIds: [rows[0]!.id] })
    .expect(409);

  const correction = await agent
    .patch(`/api/v1/imports/${batchId}/rows/${rows[1]!.id}`)
    .send({ accessionNumber: accessionTwo })
    .expect(200);
  assert.deepEqual(
    (correction.body as Batch).rows.map((row) => row.status),
    ['VALID', 'VALID'],
  );
  const confirmation = await agent
    .post(`/api/v1/imports/${batchId}/confirm`)
    .send({ rowIds: [rows[0]!.id] })
    .expect(200);
  const confirmed = confirmation.body as Batch;
  assert.equal(confirmed.rows[0]!.status, 'IMPORTED');
  const copy = await prisma.bookCopy.findUniqueOrThrow({
    where: { accessionNumber: accessionOne },
  });
  assert.equal(copy.status, 'PENDING_VERIFICATION');
  assert.equal(copy.acquisitionType, 'LEGACY_OLD_STOCK');
  assert.equal(copy.acquisitionPrice?.toString(), '12.5');
  assert.equal(confirmed.rows[0]!.createdCopyId, copy.id);
  const inventory = await agent
    .get('/api/v1/copies')
    .query({ search: `Verification Author ${fixtureId}` })
    .expect(200);
  const inventoryBody = inventory.body as {
    data: { id: string; book: { authors: { name: string }[] } }[];
  };
  assert.ok(
    inventoryBody.data.some(
      (row) =>
        row.id === copy.id &&
        row.book.authors.some((author) => author.name === `Verification Author ${fixtureId}`),
    ),
  );
  assert.equal(
    await prisma.copyHistory.count({ where: { copyId: copy.id, eventType: 'CREATED' } }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { action: 'imports.copy_created', entityId: copy.id, userId: user.id },
    }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { action: 'imports.row_corrected', entityId: rows[1]!.id, userId: user.id },
    }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { action: 'imports.confirmed', entityId: batchId, userId: user.id },
    }),
    1,
  );

  await agent
    .post(`/api/v1/imports/${batchId}/confirm`)
    .send({ rowIds: [rows[0]!.id] })
    .expect(200);
  assert.equal(await prisma.bookCopy.count(), initialCopyCount + 1);
  assert.equal(
    await prisma.auditLog.count({ where: { action: 'imports.copy_created', entityId: copy.id } }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({ where: { action: 'imports.confirmed', entityId: batchId } }),
    1,
  );

  const existingUpload = await agent
    .post('/api/v1/imports/upload')
    .attach('file', fixture, 'existing-duplicate.xlsx')
    .expect(201);
  assert.ok(
    (existingUpload.body as Batch).rows.every(
      (row) => row.status === 'DUPLICATE' && row.duplicateOfCopyId === copy.id,
    ),
  );
  assert.equal(await prisma.bookCopy.count(), initialCopyCount + 1);
  console.log(
    'PASS: template, staging, batch and database duplicates, correction, confirmation, copy history, audit, and idempotent retry',
  );
} finally {
  await disconnectPrisma();
}
