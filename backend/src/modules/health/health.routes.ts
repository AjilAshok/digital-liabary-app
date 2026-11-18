import { Router } from 'express';
import { getPrisma } from '../../db/prisma.js';
import { logger } from '../../lib/logger.js';

export function healthRouter(): Router {
  const router = Router();

  /** Liveness: the process is up. */
  router.get('/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  /** Readiness: the database is reachable. Returns no internal details. */
  router.get('/ready', async (req, res) => {
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'up' });
    } catch (err) {
      logger.warn({ err, requestId: req.id }, 'Readiness check failed');
      res.status(503).json({ status: 'unavailable', database: 'down' });
    }
  });

  return router;
}
