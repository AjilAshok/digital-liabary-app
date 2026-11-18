/**
 * Normalises free text for duplicate detection and search columns (`normalizedTitle`,
 * `normalizedName`): Unicode NFKC, lower-case, collapsed whitespace, trimmed.
 * Diacritics are preserved — "Müller" and "Muller" are different names.
 */
export function normalizeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();
}
