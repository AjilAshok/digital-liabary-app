/**
 * Accession-number generation. The FORMAT is library-configured (prefix + zero-padded counter in
 * `number_sequences` key ACCESSION) — nothing is assumed. Until an administrator configures it,
 * copies must be registered with manually entered accession numbers.
 */
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/errors.js';

export const ACCESSION_SEQUENCE_KEY = 'ACCESSION';

/** Allowed characters for any accession number (generated or manual). */
export const ACCESSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/._-]{0,39}$/;

export const accessionNumberSchema = z
  .string()
  .trim()
  .min(1, 'Accession number is required')
  .max(40, 'Accession number must be at most 40 characters')
  .regex(
    ACCESSION_PATTERN,
    'Use letters, digits and - _ . / only (must start with a letter or digit)',
  );

export const accessionConfigSchema = z.object({
  prefix: z
    .string()
    .trim()
    .max(20)
    .regex(/^[A-Za-z0-9/._-]*$/, 'Prefix may contain letters, digits and - _ . / only'),
  padding: z.number().int().min(0).max(12),
  nextValue: z.number().int().min(1).max(999_999_999_999),
});

export type AccessionConfig = z.infer<typeof accessionConfigSchema>;

export function formatAccession(prefix: string, value: number, padding: number): string {
  return `${prefix}${String(value).padStart(padding, '0')}`;
}

type Tx = Prisma.TransactionClient;

export async function getAccessionConfig(
  db: Pick<Tx, 'numberSequence'>,
): Promise<AccessionConfig | null> {
  const row = await db.numberSequence.findUnique({ where: { key: ACCESSION_SEQUENCE_KEY } });
  return row ? { prefix: row.prefix, padding: row.padding, nextValue: row.nextValue } : null;
}

/**
 * Reserves `count` new accession numbers inside the caller's transaction.
 * The sequence row is locked (`FOR UPDATE`) so concurrent registrations never receive the same
 * number; numbers already used (e.g. legacy numbers entered manually) are skipped.
 */
export async function allocateAccessionNumbers(tx: Tx, count: number): Promise<string[]> {
  const rows = await tx.$queryRaw<{ prefix: string; padding: number; nextValue: number }[]>`
    SELECT prefix, padding, "nextValue" FROM number_sequences
    WHERE key = ${ACCESSION_SEQUENCE_KEY} FOR UPDATE`;
  const seq = rows[0];
  if (!seq) {
    throw new AppError(
      409,
      'ACCESSION_NOT_CONFIGURED',
      'Automatic accession numbering is not configured. Enter accession numbers manually or ask an administrator to configure numbering in Settings.',
    );
  }

  const result: string[] = [];
  let value = seq.nextValue;
  // Bound the scan so a misconfigured sequence cannot loop forever.
  const limit = value + count + 10_000;
  while (result.length < count) {
    if (value > limit) {
      throw new AppError(
        409,
        'ACCESSION_EXHAUSTED',
        'Could not find free accession numbers; check the numbering settings.',
      );
    }
    const batch = Array.from({ length: count - result.length + 20 }, (_, i) =>
      formatAccession(seq.prefix, value + i, seq.padding),
    );
    const taken = new Set(
      (
        await tx.bookCopy.findMany({
          where: { accessionNumber: { in: batch } },
          select: { accessionNumber: true },
        })
      ).map((c) => c.accessionNumber),
    );
    for (const candidate of batch) {
      value += 1;
      if (!taken.has(candidate)) {
        result.push(candidate);
        if (result.length === count) break;
      }
    }
  }

  await tx.numberSequence.update({
    where: { key: ACCESSION_SEQUENCE_KEY },
    data: { nextValue: value },
  });
  return result;
}
