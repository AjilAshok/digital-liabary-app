import { describe, expect, it } from 'vitest';
import {
  isbnLookupSchema,
  metadataConfirmSchema,
  ocrMetadataConfirmSchema,
} from '../../src/modules/scanner/scanner.schemas.js';

describe('scanner request schemas', () => {
  it('accepts raw manual ISBN input so invalid check digits can be logged as scan outcomes', () => {
    expect(isbnLookupSchema.safeParse({ isbn: '9780306406158' }).success).toBe(true);
    expect(isbnLookupSchema.safeParse({ isbn: '' }).success).toBe(false);
  });

  it('validates provider-confirmed metadata and bounds provider confidence', () => {
    const valid = metadataConfirmSchema.safeParse({
      provider: 'OPEN_LIBRARY',
      externalId: '/works/OL1W',
      isbn: '9780306406157',
      isbn13: '9780306406157',
      title: 'A Book',
      authors: ['A. Writer'],
      confidence: 0.9,
    });
    expect(valid.success).toBe(true);
    expect(
      metadataConfirmSchema.safeParse({
        provider: 'OPEN_LIBRARY',
        externalId: 'x',
        isbn: '9780306406157',
        isbn13: '9780306406157',
        title: 'A Book',
        authors: [],
        confidence: 1.1,
      }).success,
    ).toBe(false);
  });

  it('validates OCR-confirmed metadata while allowing an absent ISBN', () => {
    const base = {
      title: 'Reviewed Cover Title',
      authors: ['A. Writer'],
      provider: 'GOOGLE_CLOUD_VISION',
      confidence: 0.82,
    };
    expect(ocrMetadataConfirmSchema.safeParse(base).success).toBe(true);
    expect(ocrMetadataConfirmSchema.safeParse({ ...base, isbn: '9780306406158' }).success).toBe(
      false,
    );
    expect(ocrMetadataConfirmSchema.safeParse({ ...base, confidence: 1.2 }).success).toBe(false);
  });
});
