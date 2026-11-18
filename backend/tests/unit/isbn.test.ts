import { describe, expect, it } from 'vitest';
import {
  cleanIsbn,
  isbn10To13,
  isbn13To10,
  isValidIsbn10,
  isValidIsbn13,
  normalizeIsbn,
} from '../../src/lib/isbn.js';
import { normalizeText } from '../../src/lib/text.js';

describe('ISBN helpers', () => {
  it('cleans prefixes, hyphens and spaces', () => {
    expect(cleanIsbn(' ISBN-13: 978-0-14-143951-8 ')).toBe('9780141439518');
    expect(cleanIsbn('0-547-92822-x')).toBe('054792822X');
  });

  it('validates check digits', () => {
    expect(isValidIsbn13('9780141439518')).toBe(true);
    expect(isValidIsbn13('9780141439519')).toBe(false);
    expect(isValidIsbn13('1234567890123')).toBe(false); // not 978/979
    expect(isValidIsbn10('054792822X')).toBe(true);
    expect(isValidIsbn10('0547928221')).toBe(false);
  });

  it('converts between ISBN-10 and ISBN-13', () => {
    expect(isbn10To13('0141439513')).toBe('9780141439518');
    expect(isbn13To10('9780547928227')).toBe('054792822X');
    expect(isbn13To10('9791032305690')).toBeNull();
  });

  it('normalises either form to the stored shape', () => {
    expect(normalizeIsbn('0-452-28423-6')).toEqual({
      isbn13: '9780452284234',
      isbn10: '0452284236',
    });
    expect(normalizeIsbn('978-0-06-112008-4')).toEqual({
      isbn13: '9780061120084',
      isbn10: '0061120081',
    });
  });

  it('rejects invalid input instead of guessing', () => {
    expect(normalizeIsbn('')).toBeNull();
    expect(normalizeIsbn('not an isbn')).toBeNull();
    expect(normalizeIsbn('9780141439510')).toBeNull();
  });
});

describe('normalizeText', () => {
  it('lower-cases, collapses whitespace and trims', () => {
    expect(normalizeText('  Pride   and\tPrejudice ')).toBe('pride and prejudice');
  });

  it('applies NFKC but keeps diacritics', () => {
    expect(normalizeText('ＡＢＣ')).toBe('abc');
    expect(normalizeText('Müller')).not.toBe(normalizeText('Muller'));
  });
});
