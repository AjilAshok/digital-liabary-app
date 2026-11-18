import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ upload: vi.fn(), confirm: vi.fn() }));
vi.mock('../../src/middleware/authorize.js', () => ({
  authorized:
    (...permissions: string[]) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const granted = String(req.headers['x-test-permissions'] ?? '').split(',');
      if (permissions.some((permission) => !granted.includes(permission)))
        return res.status(403).end();
      req.auth = {
        userId: 'user',
        email: 'user@example.test',
        fullName: 'Test User',
        roles: [],
        permissions: new Set(granted),
      };
      next();
    },
}));
vi.mock('../../src/modules/imports/import.service.js', () => ({
  uploadImport: calls.upload,
  confirmImport: calls.confirm,
  getImport: vi.fn(),
  correctRow: vi.fn(),
  errorReport: vi.fn(),
}));
import { errorHandler } from '../../src/middleware/error-handler.js';
import { importRouter } from '../../src/modules/imports/import.routes.js';

const app = express();
app.use(express.json());
app.use('/imports', importRouter());
app.use(errorHandler);
const all = 'imports.manage,catalogue.write,copies.write,locations.manage';
const id = '0195f0a0-0000-7000-8000-000000000000';
const rowId = '0195f0a0-0000-7000-8000-000000000001';

describe('import HTTP contracts', () => {
  it('requires an XLSX multipart file and forwards the authenticated upload', async () => {
    expect((await request(app).post('/imports/upload').set('x-test-permissions', all)).status).toBe(
      422,
    );
    expect(
      (
        await request(app)
          .post('/imports/upload')
          .set('x-test-permissions', all)
          .attach('file', Buffer.from('data'), 'data.xls')
      ).status,
    ).toBe(415);
    calls.upload.mockResolvedValue({ id });
    const response = await request(app)
      .post('/imports/upload')
      .set('x-test-permissions', all)
      .attach('file', Buffer.from('data'), 'data.xlsx');
    expect(response.status).toBe(201);
    expect(calls.upload).toHaveBeenCalledWith(
      Buffer.from('data'),
      'data.xlsx',
      expect.objectContaining({ userId: 'user' }),
    );
  });

  it('requires all inventory permissions and explicit unique row IDs', async () => {
    expect(
      (
        await request(app)
          .post(`/imports/${id}/confirm`)
          .set('x-test-permissions', 'imports.manage')
          .send({ rowIds: [rowId] })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(`/imports/${id}/confirm`)
          .set('x-test-permissions', all)
          .send({ rowIds: [rowId, rowId] })
      ).status,
    ).toBe(422);
    calls.confirm.mockResolvedValue({ id });
    const response = await request(app)
      .post(`/imports/${id}/confirm`)
      .set('x-test-permissions', all)
      .send({ rowIds: [rowId] });
    expect(response.status).toBe(200);
    expect(calls.confirm).toHaveBeenCalledWith(
      id,
      [rowId],
      expect.objectContaining({ userId: 'user' }),
    );
  });
});
