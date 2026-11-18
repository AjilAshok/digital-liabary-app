import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { allocateAccessionNumbers } from '../../src/modules/settings/accession.js';

describe('automatic accession allocation', () => {
  it('skips numbers already used and advances the sequence', async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ prefix: 'lib', padding: 6, nextValue: 1 }]),
      bookCopy: { findMany: vi.fn().mockResolvedValue([{ accessionNumber: 'lib000001' }]) },
      numberSequence: { update: vi.fn().mockResolvedValue({}) },
    };
    const numbers = await allocateAccessionNumbers(
      transaction as unknown as Prisma.TransactionClient,
      2,
    );
    expect(numbers).toEqual(['lib000002', 'lib000003']);
    expect(transaction.numberSequence.update).toHaveBeenCalledWith({
      where: { key: 'ACCESSION' },
      data: { nextValue: 4 },
    });
  });
});
