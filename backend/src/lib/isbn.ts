/**
 * ISBN helpers. Editions store ISBNs normalised: `isbn13` = 13 digits (978/979 prefix),
 * `isbn10` = 9 digits + check digit (0-9 or X). The database enforces these formats.
 */

export interface NormalizedIsbn {
  isbn13: string;
  /** Present when the input was an ISBN-10, or when a 978-prefixed ISBN-13 has an ISBN-10 form. */
  isbn10: string | null;
}

/** Strips spaces, hyphens and an optional "ISBN" prefix; upper-cases X. */
export function cleanIsbn(raw: string): string {
  return raw
    .trim()
    .replace(/^isbn(?:-1[03])?:?\s*/i, '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

export function isValidIsbn10(value: string): boolean {
  if (!/^[0-9]{9}[0-9X]$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = value[i]!;
    const digit = ch === 'X' ? 10 : Number(ch);
    sum += digit * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(value: string): boolean {
  if (!/^97[89][0-9]{10}$/.test(value)) return false;
  return isbn13CheckDigit(value.slice(0, 12)) === value[12];
}

function isbn13CheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

function isbn10CheckDigit(first9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(first9[i]) * (10 - i);
  const check = (11 - (sum % 11)) % 11;
  return check === 10 ? 'X' : String(check);
}

export function isbn10To13(isbn10: string): string {
  const first12 = `978${isbn10.slice(0, 9)}`;
  return first12 + isbn13CheckDigit(first12);
}

export function isbn13To10(isbn13: string): string | null {
  if (!isbn13.startsWith('978')) return null; // 979 ISBNs have no ISBN-10 form
  const first9 = isbn13.slice(3, 12);
  return first9 + isbn10CheckDigit(first9);
}

/**
 * Normalises an ISBN-10 or ISBN-13 (with or without hyphens). Returns null when the value is not a
 * valid ISBN — callers must then treat the input as unknown, never guess.
 */
export function normalizeIsbn(raw: string): NormalizedIsbn | null {
  const value = cleanIsbn(raw);
  if (value.length === 10 && isValidIsbn10(value)) {
    return { isbn13: isbn10To13(value), isbn10: value };
  }
  if (value.length === 13 && isValidIsbn13(value)) {
    return { isbn13: value, isbn10: isbn13To10(value) };
  }
  return null;
}
