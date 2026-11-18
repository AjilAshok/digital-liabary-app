import { z } from 'zod';
import { isbnInputSchema } from '../catalogue/catalogue.schemas.js';

export const isbnLookupSchema = z.object({
  isbn: z.string().trim().min(1, 'Enter an ISBN').max(40),
});

export type IsbnLookupInput = z.infer<typeof isbnLookupSchema>;

export const metadataConfirmSchema = z.object({
  provider: z.enum(['GOOGLE_BOOKS', 'OPEN_LIBRARY']),
  externalId: z.string().trim().min(1).max(200),
  isbn: z.string().trim().min(1).max(40),
  isbn13: z
    .string()
    .regex(/^97[89]\d{10}$/)
    .optional(),
  title: z.string().trim().min(1).max(300),
  subtitle: z.string().trim().max(300).nullable().optional(),
  editionStatement: z.string().trim().max(120).nullable().optional(),
  authors: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  publisher: z.string().trim().max(200).nullable().optional(),
  publicationYear: z
    .number()
    .int()
    .min(1000)
    .max(new Date().getFullYear() + 1)
    .nullable()
    .optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  language: z.string().trim().max(40).nullable().optional(),
  pageCount: z.number().int().min(1).max(100_000).nullable().optional(),
  confidence: z.number().min(0).max(1),
});

export type MetadataConfirmInput = z.infer<typeof metadataConfirmSchema>;

export const ocrMetadataConfirmSchema = z.object({
  title: z.string().trim().min(1).max(300),
  subtitle: z.string().trim().max(300).nullable().optional(),
  editionStatement: z.string().trim().max(120).nullable().optional(),
  isbn: isbnInputSchema,
  authors: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  publisher: z.string().trim().max(200).nullable().optional(),
  publicationYear: z
    .number()
    .int()
    .min(1000)
    .max(new Date().getFullYear() + 1)
    .nullable()
    .optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  language: z.string().trim().max(40).nullable().optional(),
  pageCount: z.number().int().min(1).max(100_000).nullable().optional(),
  provider: z.string().trim().max(80).default('OCR'),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type OcrMetadataConfirmInput = z.infer<typeof ocrMetadataConfirmSchema>;
