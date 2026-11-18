import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError, Errors } from '../../lib/errors.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { COVER_MIME } from '../../lib/image.js';
import { auditContext } from '../../lib/request-context.js';
import { authorized } from '../../middleware/authorize.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../security/permissions.js';
import * as books from './books.service.js';
import {
  bookListQuerySchema,
  copyListQuerySchema,
  createBookSchema,
  editionInputSchema,
  idParams,
  isbnInputSchema,
  registerCopiesSchema,
  updateBookSchema,
  updateCopySchema,
  type BookListQuery,
  type CopyListQuery,
  type CreateBookInput,
  type EditionInput,
  type RegisterCopiesInput,
  type UpdateBookInput,
  type UpdateCopyInput,
} from './catalogue.schemas.js';
import * as copies from './copies.service.js';
import { listBookStock } from '../search/search.service.js';

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: books.COVER_MAX_BYTES, files: 1, fields: 0 },
}).single('cover');

const isbnLookupQuery = z.object({ isbn: isbnInputSchema });

const id = (res: { locals: Record<string, unknown> }) =>
  (res.locals['params'] as { id: string }).id;

export function catalogueRouter(): Router {
  const router = Router();
  // Mounted at /api/v1: authenticate per route (a router-wide guard would turn unknown routes into 401).

  const catalogueRead = authorized(PERMISSIONS.CATALOGUE_READ);
  const catalogueWrite = authorized(PERMISSIONS.CATALOGUE_WRITE);
  const copiesRead = authorized(PERMISSIONS.COPIES_READ);
  const copiesWrite = authorized(PERMISSIONS.COPIES_WRITE);
  const withId = validateParams(idParams);

  // ── Books (works) ────────────────────────────────────────────────────────
  router.get('/books', catalogueRead, validateQuery(bookListQuerySchema), async (_req, res) => {
    res.json(await books.listBooks(res.locals['query'] as BookListQuery));
  });

  router.post('/books', catalogueWrite, validateBody(createBookSchema), async (req, res) => {
    res.status(201).json(await books.createBook(req.body as CreateBookInput, auditContext(req)));
  });

  router.get('/books/:id', catalogueRead, withId, async (_req, res) => {
    res.json(await books.getBook(id(res)));
  });

  router.get(
    '/books/:id/stock',
    catalogueRead,
    copiesRead,
    withId,
    validateQuery(paginationQuerySchema),
    async (_req, res) => {
      const query = res.locals['query'] as z.infer<typeof paginationQuerySchema>;
      const stock = await listBookStock(id(res), query.page, query.pageSize);
      if (!stock) throw Errors.notFound('Book not found');
      res.json(stock);
    },
  );

  router.put(
    '/books/:id',
    catalogueWrite,
    withId,
    validateBody(updateBookSchema),
    async (req, res) => {
      res.json(await books.updateBook(id(res), req.body as UpdateBookInput, auditContext(req)));
    },
  );

  router.post(
    '/books/:id/archive',
    authorized(PERMISSIONS.CATALOGUE_ARCHIVE),
    withId,
    async (req, res) => {
      await books.archiveBook(id(res), auditContext(req));
      res.status(204).end();
    },
  );

  // ── Editions ─────────────────────────────────────────────────────────────
  router.get(
    '/editions/lookup',
    catalogueRead,
    validateQuery(isbnLookupQuery),
    async (_req, res) => {
      const { isbn } = res.locals['query'] as z.infer<typeof isbnLookupQuery>;
      if (!isbn) throw Errors.badRequest('isbn is required');
      res.json({ isbn13: isbn.isbn13, matches: await books.lookupIsbn(isbn.isbn13) });
    },
  );

  router.post(
    '/books/:id/editions',
    catalogueWrite,
    withId,
    validateBody(editionInputSchema),
    async (req, res) => {
      res
        .status(201)
        .json(await books.addEdition(id(res), req.body as EditionInput, auditContext(req)));
    },
  );

  router.put(
    '/editions/:id',
    catalogueWrite,
    withId,
    validateBody(editionInputSchema),
    async (req, res) => {
      res.json(await books.updateEdition(id(res), req.body as EditionInput, auditContext(req)));
    },
  );

  router.get('/editions/:id/cover', catalogueRead, withId, async (_req, res) => {
    const cover = await books.getCover(id(res));
    if (!cover?.type) throw Errors.notFound('No cover image');
    res.setHeader('Content-Type', COVER_MIME[cover.type]);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', 'inline');
    res.send(cover.data);
  });

  router.post(
    '/editions/:id/cover',
    catalogueWrite,
    withId,
    (req, res, next) => coverUpload(req, res, next),
    async (req, res) => {
      if (!req.file)
        throw new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', [
          { path: 'cover', message: 'Choose an image file to upload', code: 'custom' },
        ]);
      await books.setCover(id(res), req.file.buffer, auditContext(req));
      res.status(204).end();
    },
  );

  router.delete('/editions/:id/cover', catalogueWrite, withId, async (req, res) => {
    await books.removeCover(id(res), auditContext(req));
    res.status(204).end();
  });

  // ── Physical copies ──────────────────────────────────────────────────────
  router.post(
    '/editions/:id/copies',
    copiesWrite,
    withId,
    validateBody(registerCopiesSchema),
    (req, _res, next) => {
      const input = req.body as RegisterCopiesInput;
      if (input.shelfId && !req.auth!.permissions.has(PERMISSIONS.LOCATIONS_MANAGE)) {
        return next(
          Errors.forbidden('Assigning a physical copy to a shelf requires locations.manage'),
        );
      }
      next();
    },
    async (req, res) => {
      res
        .status(201)
        .json(
          await copies.registerCopies(id(res), req.body as RegisterCopiesInput, auditContext(req)),
        );
    },
  );

  router.get('/copies', copiesRead, validateQuery(copyListQuerySchema), async (_req, res) => {
    res.json(await copies.listCopies(res.locals['query'] as CopyListQuery));
  });

  router.get('/copies/:id', copiesRead, withId, async (_req, res) => {
    res.json(await copies.getCopy(id(res)));
  });

  router.patch(
    '/copies/:id',
    copiesWrite,
    withId,
    validateBody(updateCopySchema),
    async (req, res) => {
      const input = req.body as UpdateCopyInput;
      if (input.shelfId !== undefined && !req.auth!.permissions.has(PERMISSIONS.LOCATIONS_MANAGE)) {
        throw Errors.forbidden('Moving a physical copy to a shelf requires locations.manage');
      }
      res.json(
        await copies.updateCopy(
          id(res),
          input,
          {
            canChangeStatus: req.auth!.permissions.has(PERMISSIONS.COPIES_CHANGE_STATUS),
            canManageLocations: req.auth!.permissions.has(PERMISSIONS.LOCATIONS_MANAGE),
          },
          auditContext(req),
        ),
      );
    },
  );

  return router;
}
