import express from 'express';
import multer from 'multer';
import type { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { detectImageType } from '../../lib/image.js';
import { paginated, paginationQuerySchema, toSkipTake } from '../../lib/pagination.js';
import { authorized } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../security/permissions.js';
import { getPrisma } from '../../db/prisma.js';
import { auditContext } from '../../lib/request-context.js';
import { confirmMetadata, lookupIsbn } from './scanner.service.js';
import { confirmOcrMetadata, searchCoverImage } from './cover-ocr.service.js';
import {
  isbnLookupSchema,
  metadataConfirmSchema,
  ocrMetadataConfirmSchema,
} from './scanner.schemas.js';

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 },
}).single('cover');

const logQuerySchema = paginationQuerySchema;

export function scannerRouter(): ReturnType<typeof express.Router> {
  const router = express.Router();
  const scannerUse = authorized(PERMISSIONS.SCANNER_USE);

  router.post('/isbn-lookup', scannerUse, validateBody(isbnLookupSchema), async (req, res) => {
    const input = req.body as z.infer<typeof isbnLookupSchema>;
    res.json(await lookupIsbn(input.isbn, req.auth!.userId));
  });

  router.post(
    '/confirm-metadata',
    authorized(PERMISSIONS.SCANNER_USE, PERMISSIONS.CATALOGUE_WRITE),
    validateBody(metadataConfirmSchema),
    async (req, res) => {
      res
        .status(201)
        .json(
          await confirmMetadata(
            req.body as z.infer<typeof metadataConfirmSchema>,
            auditContext(req),
          ),
        );
    },
  );

  router.post(
    '/cover-ocr',
    scannerUse,
    (req, res, next) => coverUpload(req, res, next),
    async (req, res) => {
      if (!req.file) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Choose a cover image', [
          { path: 'cover', message: 'A cover image is required', code: 'custom' },
        ]);
      }
      const imageType = detectImageType(req.file.buffer);
      if (!imageType)
        throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload a JPEG, PNG or WebP cover image');
      res.json(await searchCoverImage(req.file.buffer, imageType, req.auth!.userId));
    },
  );

  router.post(
    '/confirm-ocr-metadata',
    authorized(PERMISSIONS.SCANNER_USE, PERMISSIONS.CATALOGUE_WRITE),
    validateBody(ocrMetadataConfirmSchema),
    async (req, res) => {
      res
        .status(201)
        .json(
          await confirmOcrMetadata(
            req.body as z.infer<typeof ocrMetadataConfirmSchema>,
            auditContext(req),
          ),
        );
    },
  );

  router.get('/logs', scannerUse, validateQuery(logQuerySchema), async (_req, res) => {
    const query = res.locals['query'] as z.infer<typeof logQuerySchema>;
    const prisma = getPrisma();
    const where = { userId: _req.auth!.userId };
    const [rows, total] = await prisma.$transaction([
      prisma.scanLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(query),
        select: {
          id: true,
          mode: true,
          rawValue: true,
          normalizedIsbn: true,
          outcome: true,
          editionId: true,
          provider: true,
          confidence: true,
          createdAt: true,
        },
      }),
      prisma.scanLog.count({ where }),
    ]);
    res.json(
      paginated(
        rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        total,
        query,
      ),
    );
  });

  return router;
}
