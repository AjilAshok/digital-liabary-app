import { z } from 'zod';

/** Shared query schema for paginated list endpoints: `?page=1&pageSize=20`. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Standard list response: `{ data: T[], meta: { page, pageSize, total, totalPages } }`. */
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export function toSkipTake({ page, pageSize }: PaginationQuery): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(data: T[], total: number, query: PaginationQuery): Paginated<T> {
  return {
    data,
    meta: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    },
  };
}
