import { describe, expect, it } from 'vitest';
import { detectImageType } from '../../src/lib/image.js';
import {
  createBookSchema,
  registerCopiesSchema,
  updateCopySchema,
} from '../../src/modules/catalogue/catalogue.schemas.js';
import { checkStatusTransition } from '../../src/modules/catalogue/copy-rules.js';
import { accessionConfigSchema, formatAccession } from '../../src/modules/settings/accession.js';

describe('formatAccession', () => {
  it('applies the configured prefix and zero padding', () => {
    expect(formatAccession('ACC-', 42, 6)).toBe('ACC-000042');
    expect(formatAccession('', 7, 0)).toBe('7');
    expect(formatAccession('L/', 123456, 3)).toBe('L/123456'); // padding never truncates
  });

  it('validates numbering settings', () => {
    expect(
      accessionConfigSchema.safeParse({ prefix: 'ACC-', padding: 6, nextValue: 1 }).success,
    ).toBe(true);
    expect(
      accessionConfigSchema.safeParse({ prefix: 'bad prefix', padding: 6, nextValue: 1 }).success,
    ).toBe(false);
    expect(accessionConfigSchema.safeParse({ prefix: '', padding: 13, nextValue: 1 }).success).toBe(
      false,
    );
    expect(accessionConfigSchema.safeParse({ prefix: '', padding: 6, nextValue: 0 }).success).toBe(
      false,
    );
  });
});

describe('checkStatusTransition', () => {
  it('allows a no-op without extra permission', () => {
    expect(checkStatusTransition('AVAILABLE', 'AVAILABLE')).toEqual({
      ok: true,
      needsChangeStatusPermission: false,
    });
  });

  it('lets a pending copy become available without the change-status permission', () => {
    expect(checkStatusTransition('PENDING_VERIFICATION', 'AVAILABLE')).toEqual({
      ok: true,
      needsChangeStatusPermission: false,
    });
  });

  it('requires copies.change_status for damaged / missing / repair / discarded, in or out', () => {
    for (const to of ['DAMAGED', 'MISSING', 'UNDER_REPAIR', 'DISCARDED'] as const) {
      expect(checkStatusTransition('AVAILABLE', to)).toEqual({
        ok: true,
        needsChangeStatusPermission: true,
      });
    }
    expect(checkStatusTransition('DAMAGED', 'AVAILABLE')).toEqual({
      ok: true,
      needsChangeStatusPermission: true,
    });
  });

  it('leaves ISSUED and RESERVED to circulation', () => {
    expect(checkStatusTransition('ISSUED', 'AVAILABLE').ok).toBe(false);
    expect(checkStatusTransition('RESERVED', 'MISSING').ok).toBe(false);
    expect(checkStatusTransition('AVAILABLE', 'ISSUED').ok).toBe(false);
    expect(checkStatusTransition('AVAILABLE', 'RESERVED').ok).toBe(false);
  });

  it('never returns a discarded copy to stock', () => {
    expect(checkStatusTransition('DISCARDED', 'AVAILABLE').ok).toBe(false);
  });
});

describe('detectImageType', () => {
  const bytes = (...b: number[]) => Uint8Array.from(b);
  it('recognises JPEG, PNG and WebP by their magic numbers', () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe('png');
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
    expect(detectImageType(webp)).toBe('webp');
  });

  it('rejects everything else, whatever the file is called', () => {
    expect(
      detectImageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(detectImageType(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(detectImageType(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // %PDF
    expect(detectImageType(bytes())).toBeNull();
  });
});

describe('createBookSchema', () => {
  const base = { title: '  Pride   and Prejudice ', edition: {} };

  it('normalises title whitespace and accepts a book without ISBN or authors', () => {
    const r = createBookSchema.parse(base);
    expect(r.title).toBe('Pride and Prejudice');
    expect(r.edition.isbn).toBeNull();
    expect(r.authors).toEqual([]);
  });

  it('normalises ISBN-10 input to ISBN-13 and rejects bad check digits', () => {
    const ok = createBookSchema.parse({ ...base, edition: { isbn: '0-14-143951-3' } });
    expect(ok.edition.isbn).toEqual({ isbn13: '9780141439518', isbn10: '0141439513' });
    const bad = createBookSchema.safeParse({ ...base, edition: { isbn: '9780141439519' } });
    expect(bad.success).toBe(false);
  });

  it('requires each contributor to be either an existing author or a new name', () => {
    expect(createBookSchema.safeParse({ ...base, authors: [{ role: 'AUTHOR' }] }).success).toBe(
      false,
    );
    expect(
      createBookSchema.safeParse({
        ...base,
        authors: [{ authorId: '0195f0a0-0000-7000-8000-000000000000', name: 'X' }],
      }).success,
    ).toBe(false);
    expect(
      createBookSchema.safeParse({ ...base, authors: [{ name: 'Jane Austen' }] }).success,
    ).toBe(true);
  });

  it('rejects implausible publication years', () => {
    expect(createBookSchema.safeParse({ ...base, edition: { publicationYear: 99 } }).success).toBe(
      false,
    );
    expect(
      createBookSchema.safeParse({ ...base, edition: { publicationYear: 3000 } }).success,
    ).toBe(false);
  });
});

describe('registerCopiesSchema', () => {
  const base = { quantity: 2, acquisitionType: 'LEGACY_OLD_STOCK' as const };

  it('accepts automatic numbering without accession numbers', () => {
    const r = registerCopiesSchema.parse({ ...base, accessionMode: 'auto' });
    expect(r.status).toBe('AVAILABLE');
    expect(r.condition).toBe('GOOD');
  });

  it('requires exactly one manual accession number per copy, with no repeats', () => {
    expect(
      registerCopiesSchema.safeParse({ ...base, accessionMode: 'manual', accessionNumbers: ['A1'] })
        .success,
    ).toBe(false);
    expect(
      registerCopiesSchema.safeParse({
        ...base,
        accessionMode: 'manual',
        accessionNumbers: ['A1', 'a1'],
      }).success,
    ).toBe(false);
    expect(
      registerCopiesSchema.safeParse({
        ...base,
        accessionMode: 'manual',
        accessionNumbers: ['A1', 'A2'],
      }).success,
    ).toBe(true);
  });

  it('rejects unsafe accession characters, circulation statuses and bad money', () => {
    expect(
      registerCopiesSchema.safeParse({
        ...base,
        quantity: 1,
        accessionMode: 'manual',
        accessionNumbers: ['A 1'],
      }).success,
    ).toBe(false);
    expect(
      registerCopiesSchema.safeParse({ ...base, accessionMode: 'auto', status: 'ISSUED' }).success,
    ).toBe(false);
    expect(
      registerCopiesSchema.safeParse({ ...base, accessionMode: 'auto', acquisitionPrice: '-5' })
        .success,
    ).toBe(false);
    expect(
      registerCopiesSchema.safeParse({ ...base, accessionMode: 'auto', acquisitionPrice: '12.345' })
        .success,
    ).toBe(false);
  });

  it('caps a batch at 100 copies and rejects future acquisition dates', () => {
    expect(
      registerCopiesSchema.safeParse({ ...base, quantity: 101, accessionMode: 'auto' }).success,
    ).toBe(false);
    expect(
      registerCopiesSchema.safeParse({
        ...base,
        accessionMode: 'auto',
        acquisitionDate: '2999-01-01',
      }).success,
    ).toBe(false);
  });
});

describe('updateCopySchema', () => {
  it('rejects an empty update and circulation statuses', () => {
    expect(updateCopySchema.safeParse({}).success).toBe(false);
    expect(updateCopySchema.safeParse({ reason: 'only a reason' }).success).toBe(false);
    expect(updateCopySchema.safeParse({ status: 'ISSUED' }).success).toBe(false);
    expect(updateCopySchema.safeParse({ status: 'MISSING', reason: 'Not on shelf' }).success).toBe(
      true,
    );
  });
});
