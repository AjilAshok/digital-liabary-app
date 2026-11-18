import { Router } from 'express';
import type { z } from 'zod';
import { getPrisma } from '../../db/prisma.js';
import { AppError } from '../../lib/errors.js';
import { auditContext } from '../../lib/request-context.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAnyPermission, requirePermissions } from '../../middleware/authorize.js';
import { validateBody } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../security/permissions.js';
import { recordAudit } from '../audit/audit.service.js';
import {
  ACCESSION_SEQUENCE_KEY,
  accessionConfigSchema,
  formatAccession,
  getAccessionConfig,
} from './accession.js';

export function settingsRouter(): Router {
  const router = Router();
  router.use(authenticate);

  /** Readable by anyone who registers copies (the form shows the next number). */
  router.get(
    '/accession',
    requireAnyPermission(
      PERMISSIONS.SETTINGS_READ,
      PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.COPIES_WRITE,
    ),
    async (_req, res) => {
      const config = await getAccessionConfig(getPrisma());
      res.json({
        configured: config !== null,
        config,
        preview: config ? formatAccession(config.prefix, config.nextValue, config.padding) : null,
      });
    },
  );

  router.put(
    '/accession',
    requirePermissions(PERMISSIONS.SETTINGS_MANAGE),
    validateBody(accessionConfigSchema),
    async (req, res) => {
      const input = req.body as z.infer<typeof accessionConfigSchema>;
      const preview = formatAccession(input.prefix, input.nextValue, input.padding);
      if (preview.length > 40) {
        throw new AppError(422, 'VALIDATION_FAILED', 'Request validation failed', [
          {
            path: 'padding',
            message: 'Generated numbers would exceed 40 characters',
            code: 'custom',
          },
        ]);
      }
      await getPrisma().$transaction(async (tx) => {
        const before = await getAccessionConfig(tx);
        await tx.numberSequence.upsert({
          where: { key: ACCESSION_SEQUENCE_KEY },
          update: input,
          create: { key: ACCESSION_SEQUENCE_KEY, ...input },
        });
        await recordAudit(
          {
            action: 'settings.updated',
            entityType: 'NumberSequence',
            entityId: ACCESSION_SEQUENCE_KEY,
            before: before ?? undefined,
            after: input,
          },
          auditContext(req),
          tx,
        );
      });
      res.json({ configured: true, config: input, preview });
    },
  );

  return router;
}
