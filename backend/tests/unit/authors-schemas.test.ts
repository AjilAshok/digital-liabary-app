import { describe, expect, it } from 'vitest';
import { authorInputSchema } from '../../src/modules/catalogue/authors.schemas.js';

describe('authorInputSchema', () => {
  it('normalizes names and accepts optional author profile fields', () => {
    const parsed = authorInputSchema.parse({
      name: '  Ursula   K.   Le Guin ',
      authorNumber: 'L-42',
      description: '  American author  ',
      nationality: '  American ',
      dateOfBirth: '1929-10-21',
    });

    expect(parsed.name).toBe('Ursula K. Le Guin');
    expect(parsed.description).toBe('American author');
    expect(parsed.nationality).toBe('American');
    expect(parsed.dateOfBirth?.toISOString()).toBe('1929-10-21T00:00:00.000Z');
    expect(parsed.confirmDuplicateName).toBe(false);
  });

  it('allows author numbers to be omitted', () => {
    expect(authorInputSchema.parse({ name: 'Anonymous' }).authorNumber).toBeNull();
  });

  it('rejects invalid author numbers', () => {
    expect(
      authorInputSchema.safeParse({ name: 'Ada Lovelace', authorNumber: 'A 12' }).success,
    ).toBe(false);
  });

  it('rejects impossible and future dates of birth', () => {
    expect(
      authorInputSchema.safeParse({ name: 'Invalid Date', dateOfBirth: '1900-02-29' }).success,
    ).toBe(false);
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    expect(authorInputSchema.safeParse({ name: 'Future Date', dateOfBirth: future }).success).toBe(
      false,
    );
  });

  it('accepts explicit confirmation when a same-name person is intentional', () => {
    expect(
      authorInputSchema.parse({ name: 'John Smith', confirmDuplicateName: true })
        .confirmDuplicateName,
    ).toBe(true);
  });
});
