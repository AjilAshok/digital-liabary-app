import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { auditContext } from '../../lib/request-context.js';
import { authorized } from '../../middleware/authorize.js';
import { validateBody, validateParams } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../security/permissions.js';
import { IMPORT_COLUMNS, type ImportValues } from './import-validation.js';
import { makeTemplate, MAX_UPLOAD_BYTES } from './import-workbook.js';
import {
  confirmImport,
  correctRow,
  errorReport,
  getImport,
  uploadImport,
} from './import.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0 },
}).single('file');
const idParams = z.object({ id: z.uuid() });
const rowParams = z.object({ id: z.uuid(), rowId: z.uuid() });
const correctionSchema = z
  .object(
    Object.fromEntries(IMPORT_COLUMNS.map((column) => [column, z.string().max(500).optional()])),
  )
  .strict();
const confirmSchema = z
  .object({
    rowIds: z
      .array(z.uuid())
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Row IDs must be unique'),
  })
  .strict();
const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function importRouter(): Router {
  const router = Router();
  const read = authorized(PERMISSIONS.IMPORTS_READ);
  const manage = authorized(PERMISSIONS.IMPORTS_MANAGE);
  router.get('/template', read, async (_req, res) => {
    res
      .type(xlsxType)
      .attachment('import-template.xlsx')
      .send(await makeTemplate());
  });
  router.post(
    '/upload',
    manage,
    (req, res, next) => upload(req, res, next),
    async (req, res) => {
      if (!req.file) throw new AppError(422, 'VALIDATION_FAILED', 'An XLSX file is required');
      if (!req.file.originalname.toLowerCase().endsWith('.xlsx'))
        throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Upload an .xlsx file');
      res
        .status(201)
        .json(await uploadImport(req.file.buffer, req.file.originalname, auditContext(req)));
    },
  );
  router.get('/:id', read, validateParams(idParams), async (_req, res) => {
    res.json(await getImport((res.locals['params'] as z.infer<typeof idParams>).id));
  });
  router.patch(
    '/:id/rows/:rowId',
    manage,
    validateParams(rowParams),
    validateBody(correctionSchema),
    async (req, res) => {
      const { id, rowId } = res.locals['params'] as z.infer<typeof rowParams>;
      res.json(await correctRow(id, rowId, req.body as Partial<ImportValues>, auditContext(req)));
    },
  );
  router.get('/:id/errors.xlsx', read, validateParams(idParams), async (_req, res) => {
    const { id } = res.locals['params'] as z.infer<typeof idParams>;
    res
      .type(xlsxType)
      .attachment('import-errors.xlsx')
      .send(await errorReport(id));
  });
  router.post(
    '/:id/confirm',
    authorized(
      PERMISSIONS.IMPORTS_MANAGE,
      PERMISSIONS.CATALOGUE_WRITE,
      PERMISSIONS.COPIES_WRITE,
      PERMISSIONS.LOCATIONS_MANAGE,
    ),
    validateParams(idParams),
    validateBody(confirmSchema),
    async (req, res) => {
      const { id } = res.locals['params'] as z.infer<typeof idParams>;
      res.json(
        await confirmImport(
          id,
          (req.body as z.infer<typeof confirmSchema>).rowIds,
          auditContext(req),
        ),
      );
    },
  );
  return router;
}
