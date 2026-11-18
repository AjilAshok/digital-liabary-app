import { Router } from 'express';
import { authorized } from '../../middleware/authorize.js';
import { validateQuery } from '../../middleware/validate.js';
import { PERMISSIONS } from '../../security/permissions.js';
import { searchLibrary } from './search.service.js';
import { searchQuerySchema, type SearchQuery } from './search.schemas.js';

export function searchRouter(): Router {
  const router = Router();
  const searchRead = authorized(PERMISSIONS.CATALOGUE_READ, PERMISSIONS.COPIES_READ);

  router.get('/', searchRead, validateQuery(searchQuerySchema), async (_req, res) => {
    res.json(await searchLibrary(res.locals['query'] as SearchQuery));
  });

  return router;
}
