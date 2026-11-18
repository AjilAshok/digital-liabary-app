import { normalizeIsbn } from '../../lib/isbn.js';
import { ACCESSION_PATTERN } from '../settings/accession.js';

export const IMPORT_COLUMNS = [
  'title',
  'authorName',
  'authorNumber',
  'isbn',
  'accessionNumber',
  'shelfRack',
  'price',
  'oldNew',
  'condition',
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];
export type ImportValues = Record<ImportColumn, string>;
export type ImportError = { field: string; message: string };

export function validateImportValues(values: ImportValues) {
  const cleaned = Object.fromEntries(
    IMPORT_COLUMNS.map((column) => [column, values[column].trim()]),
  ) as ImportValues;
  const errors: ImportError[] = [];
  for (const column of IMPORT_COLUMNS) {
    if (cleaned[column].length > 500)
      errors.push({ field: column, message: 'Maximum length is 500 characters' });
  }
  for (const column of ['title', 'accessionNumber', 'oldNew', 'condition'] as const) {
    if (!cleaned[column]) errors.push({ field: column, message: 'Required' });
  }
  if (cleaned.title.length > 300)
    errors.push({ field: 'title', message: 'Maximum length is 300 characters' });
  if (cleaned.authorName.length > 200)
    errors.push({ field: 'authorName', message: 'Maximum length is 200 characters' });
  if (cleaned.authorNumber && !/^[A-Za-z0-9./-]{1,30}$/.test(cleaned.authorNumber))
    errors.push({
      field: 'authorNumber',
      message: 'Use at most 30 letters, digits, dots, slashes or hyphens',
    });
  if (cleaned.accessionNumber && !ACCESSION_PATTERN.test(cleaned.accessionNumber))
    errors.push({
      field: 'accessionNumber',
      message:
        'Use at most 40 letters, digits, dots, underscores, slashes or hyphens, starting with a letter or digit',
    });
  if (cleaned.authorNumber && !cleaned.authorName) {
    errors.push({
      field: 'authorName',
      message: 'Author name is required when author number is supplied',
    });
  }
  const isbn = cleaned.isbn ? normalizeIsbn(cleaned.isbn) : null;
  if (cleaned.isbn && !isbn)
    errors.push({ field: 'isbn', message: 'Invalid ISBN checksum or format' });
  if (cleaned.price && !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(cleaned.price)) {
    errors.push({
      field: 'price',
      message: 'Price must be a non-negative amount with at most two decimal places',
    });
  }
  const oldNew = cleaned.oldNew.toUpperCase();
  if (oldNew && oldNew !== 'OLD' && oldNew !== 'NEW') {
    errors.push({ field: 'oldNew', message: 'Use OLD or NEW' });
  }
  const condition = cleaned.condition.toUpperCase();
  if (condition && !['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'].includes(condition)) {
    errors.push({ field: 'condition', message: 'Use NEW, GOOD, FAIR, POOR or DAMAGED' });
  }
  return { values: cleaned, isbn, oldNew, condition, errors };
}
