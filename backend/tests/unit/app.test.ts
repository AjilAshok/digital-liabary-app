import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

// These requests are rejected before any database access, so no database is needed.
const app = createApp();

describe('HTTP pipeline (no database)', () => {
  it('serves the Angular app for browser routes without swallowing API routes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'digital-library-web-'));
    try {
      await writeFile(join(directory, 'index.html'), '<!doctype html><title>Library Web</title>');
      const webApp = createApp({ frontendDistDir: directory });
      const root = await request(webApp).get('/');
      expect(root.status).toBe(200);
      expect(root.text).toContain('Library Web');
      const route = await request(webApp).get('/admin/book-numbering');
      expect(route.status).toBe(200);
      expect(route.text).toContain('Library Web');
      const api = await request(webApp).get('/api/v1/does-not-exist');
      expect(api.status).toBe(404);
      expect(api.body.error.code).toBe('NOT_FOUND');
      const missingAsset = await request(webApp).get('/assets/missing.js');
      expect(missingAsset.status).toBe(404);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('returns a JSON 404 with a request id and no stack trace', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts/);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('validates login input with field-level details', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'nope', password: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const paths = (res.body.error.details as { path: string }[]).map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('requires a session for /auth/me', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a forged session cookie', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', 'dlms_session=forged.token.value');
    expect(res.status).toBe(401);
  });

  it('protects /roles', async () => {
    expect((await request(app).get('/api/v1/roles')).status).toBe(401);
  });

  it('protects import template, upload and confirmation endpoints', async () => {
    expect((await request(app).get('/api/v1/imports/template')).status).toBe(401);
    expect((await request(app).post('/api/v1/imports/upload')).status).toBe(401);
    expect(
      (await request(app).post('/api/v1/imports/0195f0a0-0000-7000-8000-000000000000/confirm'))
        .status,
    ).toBe(401);
  });

  it('rejects state-changing requests from foreign origins', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@b.co', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('sets security headers and no-store caching', async () => {
    const res = await request(app).get('/api/v1/health/live');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('accepts a safe inbound request id and replaces an unsafe one', async () => {
    const ok = await request(app).get('/api/v1/health/live').set('X-Request-Id', 'abc12345-trace');
    expect(ok.headers['x-request-id']).toBe('abc12345-trace');
    const bad = await request(app).get('/api/v1/health/live').set('X-Request-Id', '<script>');
    expect(bad.headers['x-request-id']).not.toBe('<script>');
  });
});
