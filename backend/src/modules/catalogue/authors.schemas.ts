import { z } from 'zod';

const currentDate = new Date().toISOString().slice(0, 10);

export const authorIdParams = z.object({ id: z.uuid() });

export const authorInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(200)
    .transform((value) => value.replace(/\s+/g, ' ')),
  authorNumber: z
    .union([
      z
        .string()
        .trim()
        .max(30)
        .regex(/^[A-Za-z0-9./-]+$/, 'Author number may contain letters, digits and . / - only'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .transform((value) => value || null),
  description: z.string().trim().max(5000).optional().nullable(),
  nationality: z.string().trim().max(80).optional().nullable(),
  dateOfBirth: z
    .union([
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
        .refine((value) => {
          const date = new Date(`${value}T00:00:00.000Z`);
          return (
            !Number.isNaN(date.getTime()) &&
            date.toISOString().slice(0, 10) === value &&
            value <= currentDate
          );
        }, 'Enter a valid date of birth not in the future'),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .transform((value) => (value ? new Date(`${value}T00:00:00.000Z`) : null)),
  confirmDuplicateName: z.boolean().optional().default(false),
});

export type AuthorInput = z.infer<typeof authorInputSchema>;
