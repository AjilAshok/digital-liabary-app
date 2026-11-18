import { z } from 'zod';
import { normalizeIsbn } from '../../lib/isbn.js';
import { paginationQuerySchema } from '../../lib/pagination.js';
import { accessionNumberSchema } from '../settings/accession.js';
import { EDITABLE_STATUSES, REGISTRATION_STATUSES } from './copy-rules.js';

const currentYear = new Date().getFullYear();

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const CONTRIBUTOR_ROLES = [
  'AUTHOR',
  'EDITOR',
  'TRANSLATOR',
  'ILLUSTRATOR',
  'COMPILER',
] as const;
export const ACQUISITION_TYPES = [
  'LEGACY_OLD_STOCK',
  'PURCHASED_NEW',
  'DONATED',
  'TRANSFERRED',
  'OTHER',
] as const;
export const CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'] as const;
export const COPY_STATUSES = [
  'AVAILABLE',
  'ISSUED',
  'RESERVED',
  'DAMAGED',
  'MISSING',
  'UNDER_REPAIR',
  'DISCARDED',
  'PENDING_VERIFICATION',
] as const;

/** A contributor is either an existing author (authorId) or a new one (name [+ authorNumber]). */
const contributorSchema = z
  .object({
    authorId: z.uuid().optional(),
    name: z.string().trim().max(200).optional(),
    authorNumber: z
      .string()
      .trim()
      .max(30)
      .regex(/^[A-Za-z0-9./-]*$/, 'Author number may contain letters, digits and . / - only')
      .optional(),
    confirmDuplicateName: z.boolean().optional().default(false),
    role: z.enum(CONTRIBUTOR_ROLES).default('AUTHOR'),
  })
  .refine((c) => Boolean(c.authorId) !== Boolean(c.name), {
    message: 'Choose an existing author or enter a new author name',
  });

export type ContributorInput = z.infer<typeof contributorSchema>;

/** ISBN accepted in any common form; stored normalised. Empty string = no ISBN. */
export const isbnInputSchema = z
  .string()
  .trim()
  .max(20)
  .optional()
  .nullable()
  .transform((v, ctx) => {
    if (!v) return null;
    const n = normalizeIsbn(v);
    if (!n) {
      ctx.addIssue({
        code: 'custom',
        message: 'Not a valid ISBN-10 or ISBN-13 (check digit failed)',
      });
      return z.NEVER;
    }
    return n;
  });

export const editionInputSchema = z.object({
  isbn: isbnInputSchema,
  editionStatement: optionalText(120),
  publisherId: z
    .uuid()
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  publicationYear: z
    .number()
    .int()
    .min(1000, 'Enter a four-digit year')
    .max(currentYear + 1, `Year cannot be after ${currentYear + 1}`)
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  language: optionalText(40),
  pageCount: z
    .number()
    .int()
    .min(1)
    .max(100_000)
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  format: optionalText(40),
  /** Set when the librarian deliberately records a second edition with an ISBN that already exists. */
  confirmDuplicateIsbn: z.boolean().optional().default(false),
});

export type EditionInput = z.infer<typeof editionInputSchema>;

const workFields = {
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(300)
    .transform((v) => v.replace(/\s+/g, ' ')),
  subtitle: optionalText(300),
  description: optionalText(5000),
  originalLanguage: optionalText(40),
  categoryId: z
    .uuid()
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  authors: z.array(contributorSchema).max(20).default([]),
};

export const createBookSchema = z.object({
  ...workFields,
  edition: editionInputSchema,
  /** Set when the librarian confirms a new title despite a same-title match. */
  confirmNewTitle: z.boolean().optional().default(false),
});
export type CreateBookInput = z.infer<typeof createBookSchema>;

export const updateBookSchema = z.object(workFields);
export type UpdateBookInput = z.infer<typeof updateBookSchema>;

export const bookListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  categoryId: z.uuid().optional(),
  authorId: z.uuid().optional(),
  publisherId: z.uuid().optional(),
  sort: z.enum(['title', '-title', 'createdAt', '-createdAt']).default('title'),
});
export type BookListQuery = z.infer<typeof bookListQuerySchema>;

const moneyCore = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount like 250 or 250.50');

const isoDateCore = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Invalid date')
  .refine(
    (v) => new Date(`${v}T00:00:00Z`).getTime() <= Date.now() + 86_400_000,
    'Date cannot be in the future',
  );
const toDate = (v: string) => new Date(`${v}T00:00:00Z`);

/** Create semantics: absent or empty → null. */
const money = z
  .union([moneyCore, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null));
const isoDate = z
  .union([isoDateCore, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? toDate(v) : null));

/**
 * PATCH semantics: an ABSENT field stays undefined (leave unchanged) and only an explicit null or
 * empty string clears the value. Never default a missing PATCH field to null — that would silently
 * erase stored data.
 */
const patchMoney = z
  .union([moneyCore, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));
const patchDate = z
  .union([isoDateCore, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v ? toDate(v) : null));
const patchText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

export const registerCopiesSchema = z
  .object({
    quantity: z.number().int().min(1, 'At least one copy').max(100, 'At most 100 copies at a time'),
    accessionMode: z.enum(['auto', 'manual']),
    accessionNumbers: z.array(accessionNumberSchema).max(100).optional(),
    acquisitionType: z.enum(ACQUISITION_TYPES),
    acquisitionDate: isoDate,
    acquisitionPrice: money,
    condition: z.enum(CONDITIONS).default('GOOD'),
    status: z.enum(REGISTRATION_STATUSES).default('AVAILABLE'),
    shelfId: z
      .uuid()
      .optional()
      .nullable()
      .transform((v) => v ?? null),
    remarks: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.accessionMode === 'manual') {
      const list = v.accessionNumbers ?? [];
      if (list.length !== v.quantity) {
        ctx.addIssue({
          code: 'custom',
          path: ['accessionNumbers'],
          message: `Enter exactly ${v.quantity} accession number${v.quantity === 1 ? '' : 's'}`,
        });
      }
      const seen = new Set<string>();
      list.forEach((a, i) => {
        const key = a.toUpperCase();
        if (seen.has(key)) {
          ctx.addIssue({
            code: 'custom',
            path: ['accessionNumbers', i],
            message: `${a} is listed twice`,
          });
        }
        seen.add(key);
      });
    }
  });
export type RegisterCopiesInput = z.infer<typeof registerCopiesSchema>;

export const updateCopySchema = z
  .object({
    condition: z.enum(CONDITIONS).optional(),
    status: z.enum(EDITABLE_STATUSES).optional(),
    shelfId: z.uuid().nullable().optional(),
    acquisitionType: z.enum(ACQUISITION_TYPES).optional(),
    acquisitionDate: patchDate,
    acquisitionPrice: patchMoney,
    remarks: patchText(500),
    /** Why the status/condition/location changed — stored in copy history. */
    reason: patchText(300),
  })
  .refine(
    (v) => Object.entries(v).some(([k, val]) => k !== 'reason' && val !== undefined),
    'Nothing to update',
  );
export type UpdateCopyInput = z.infer<typeof updateCopySchema>;

export const copyListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  bookId: z.uuid().optional(),
  editionId: z.uuid().optional(),
  status: z.enum(COPY_STATUSES).optional(),
  condition: z.enum(CONDITIONS).optional(),
  acquisitionType: z.enum(ACQUISITION_TYPES).optional(),
  /** "old" = legacy stock, "new" = purchased — convenience filter for the old/new classification. */
  stock: z.enum(['old', 'new']).optional(),
  shelfId: z.uuid().optional(),
  unshelved: z.enum(['true', 'false']).optional(),
  includeDiscarded: z.enum(['true', 'false']).default('false'),
  sort: z
    .enum(['accessionNumber', '-accessionNumber', 'createdAt', '-createdAt'])
    .default('-createdAt'),
});
export type CopyListQuery = z.infer<typeof copyListQuerySchema>;

export const idParams = z.object({ id: z.uuid() });
