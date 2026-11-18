import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { IMPORT_COLUMNS } from '../../src/modules/imports/import-validation.js';
import { makeTemplate, parseWorkbook } from '../../src/modules/imports/import-workbook.js';

describe('import workbooks', () => {
  it('creates a template with the exact headers', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await makeTemplate()) as never);
    expect((workbook.worksheets[0]!.getRow(1).values as ExcelJS.CellValue[]).slice(1)).toEqual([
      ...IMPORT_COLUMNS,
    ]);
  });
  it('rejects invalid archives and excessive rows', async () => {
    await expect(parseWorkbook(Buffer.from('not a workbook'))).rejects.toMatchObject({
      code: 'INVALID_WORKBOOK',
    });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Import');
    sheet.addRow([...IMPORT_COLUMNS]);
    sheet.getCell('A502').value = 'too far';
    await expect(
      parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer())),
    ).rejects.toMatchObject({ code: 'INVALID_WORKBOOK' });
  });
  it('flags formulas and numeric identifiers for correction', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Import');
    sheet.addRow([...IMPORT_COLUMNS]);
    sheet.addRow(['Title', '', '', '', 123, '', { formula: '1+1', result: 2 }, 'old', 'good']);
    const [row] = await parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(row?.sourceErrors.map((error) => error.field)).toEqual(['accessionNumber', 'price']);
  });
});
