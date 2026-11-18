import { z } from 'zod';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { COPY_STATUSES } from '../catalogue/catalogue.schemas.js';

export const searchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(120),
  categoryId: z.uuid().optional(),
  publisherId: z.uuid().optional(),
  shelfId: z.uuid().optional(),
  rackId: z.uuid().optional(),
  status: z.enum(COPY_STATUSES).optional(),
  stockType: z.enum(['old', 'new']).optional(),
  sort: z.enum(['relevance', 'title', '-title', 'newest']).default('relevance'),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
