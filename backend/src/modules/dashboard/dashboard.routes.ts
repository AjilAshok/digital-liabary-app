import { Router } from 'express';
import { z } from 'zod';
import { auditContext } from '../../lib/request-context.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requirePermissions } from '../../middleware/authorize.js';
import { validateBody, validateQuery } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../security/permissions.js';
import * as service from './dashboard.service.js';

const chartsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});

const registerTotalSchema = z.object({
  registerTotal: z.number().int().min(0).max(100_000_000).nullable(),
});

export function dashboardRouter(): Router {
  const router = Router();
  router.use(authenticate, requirePermissions(PERMISSIONS.DASHBOARD_READ));

  router.get('/summary', async (_req, res) => {
    res.json(await service.getSummary());
  });

  router.get('/charts', validateQuery(chartsQuerySchema), async (_req, res) => {
    const { months } = res.locals['query'] as z.infer<typeof chartsQuerySchema>;
    res.json(await service.getCharts(months));
  });

  router.get('/recent-activities', async (req, res) => {
    res.json(
      await service.getRecentActivities({
        canReadAuditLog: req.auth!.permissions.has(PERMISSIONS.AUDIT_LOGS_READ),
        canReadMembers: req.auth!.permissions.has(PERMISSIONS.MEMBERS_READ),
      }),
    );
  });

  router.put(
    '/digitization-target',
    requirePermissions(PERMISSIONS.SETTINGS_MANAGE),
    validateBody(registerTotalSchema),
    async (req, res) => {
      const { registerTotal } = req.body as z.infer<typeof registerTotalSchema>;
      await service.setRegisterTotal(registerTotal, req.auth!.userId, auditContext(req));
      res.json({ digitization: (await service.getSummary()).digitization });
    },
  );

  return router;
}
