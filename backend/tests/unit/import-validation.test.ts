import { describe, expect, it } from 'vitest';
import {
  validateImportValues,
  type ImportValues,
} from '../../src/modules/imports/import-validation.js';

const valid: ImportValues = {
  title: 'Example',
  authorName: '',
  authorNumber: '',
  isbn: '0-14-143951-3',
  accessionNumber: 'A-1',
  shelfRack: '',
  price: '12.30',
  oldNew: 'old',
  condition: 'good',
};

describe('import row validation', () => {
  it('normalizes valid rows without altering the input', () => {
    const result = validateImportValues(valid);
    expect(result.errors).toEqual([]);
    expect(result.isbn?.isbn13).toBe('9780141439518');
    expect(result.oldNew).toBe('OLD');
    expect(valid.oldNew).toBe('old');
  });

  it('reports invalid required fields and untrusted values', () => {
    const result = validateImportValues({
      ...valid,
      title: '',
      authorNumber: '1',
      isbn: 'bad',
      price: '-1',
      oldNew: 'unknown',
      condition: 'unknown',
    });
    expect(result.errors.map((error) => error.field)).toEqual([
      'title',
      'authorName',
      'isbn',
      'price',
      'oldNew',
      'condition',
    ]);
  });
});
