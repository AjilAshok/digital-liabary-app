import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import { SaxesParser } from 'saxes';
import { StringDecoder } from 'node:string_decoder';
import { AppError } from '../../lib/errors.js';
import { IMPORT_COLUMNS, type ImportError, type ImportValues } from './import-validation.js';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 500;
const MAX_EXPANDED_BYTES = 25 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 200;
const badWorkbook = (message: string) => new AppError(422, 'INVALID_WORKBOOK', message);

async function checkZip(buffer: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return reject(badWorkbook('Invalid XLSX archive'));
      let total = 0;
      let count = 0;
      const names = new Set<string>();
      const fail = () => {
        zip.close();
        reject(badWorkbook('Invalid or oversized XLSX archive'));
      };
      zip.on('error', fail);
      zip.on('end', resolve);
      zip.on('entry', (entry: yauzl.Entry) => {
        count += 1;
        total += entry.uncompressedSize;
        if (
          count > MAX_ZIP_ENTRIES ||
          total > MAX_EXPANDED_BYTES ||
          names.has(entry.fileName) ||
          (entry.generalPurposeBitFlag & 1) !== 0
        )
          return fail();
        names.add(entry.fileName);
        if (entry.fileName.endsWith('/')) return zip.readEntry();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return fail();
          stream.on('error', fail);
          if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.fileName)) {
            let rows = 0;
            let cells = 0;
            let invalid = false;
            const parser = new SaxesParser();
            const decoder = new StringDecoder('utf8');
            parser.on('opentag', (tag) => {
              const name = tag.name.split(':').at(-1);
              const reference = String(tag.attributes['r'] ?? '');
              if (name === 'row') {
                rows++;
                if (
                  rows > MAX_ROWS + 1 ||
                  (reference && (!/^\d+$/.test(reference) || Number(reference) > MAX_ROWS + 1))
                )
                  invalid = true;
              }
              if (name === 'c') {
                cells++;
                const match = /^([A-Z]+)(\d+)$/i.exec(reference);
                if (
                  cells > (MAX_ROWS + 1) * IMPORT_COLUMNS.length ||
                  !match ||
                  match[1]!.length !== 1 ||
                  match[1]!.toUpperCase().charCodeAt(0) - 64 > IMPORT_COLUMNS.length ||
                  Number(match[2]) > MAX_ROWS + 1
                )
                  invalid = true;
              }
            });
            parser.on('error', () => {
              invalid = true;
            });
            stream.on('data', (chunk: Buffer) => {
              if (invalid) return;
              try {
                parser.write(decoder.write(chunk));
              } catch {
                invalid = true;
              }
            });
            stream.on('end', () => {
              try {
                parser.write(decoder.end()).close();
              } catch {
                invalid = true;
              }
              if (invalid) fail();
              else zip.readEntry();
            });
          } else {
            stream.on('end', () => zip.readEntry());
          }
          stream.resume();
        });
      });
      zip.readEntry();
    });
  });
}

export async function makeTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow([...IMPORT_COLUMNS]);
  sheet.columns.forEach((column) => {
    column.width = 22;
  });
  sheet.getRow(1).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export type ParsedImportRow = {
  rowNumber: number;
  values: ImportValues;
  sourceErrors: ImportError[];
  cells: Record<string, unknown>;
};

export async function parseWorkbook(buffer: Buffer): Promise<ParsedImportRow[]> {
  if (buffer.length > MAX_UPLOAD_BYTES)
    throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'The uploaded file is too large');
  await checkZip(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw badWorkbook('Could not read XLSX workbook');
  }
  if (workbook.worksheets.length !== 1)
    throw badWorkbook('Workbook must contain exactly one worksheet');
  const sheet = workbook.worksheets[0]!;
  if (sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > IMPORT_COLUMNS.length)
    throw badWorkbook(`Maximum ${MAX_ROWS} data rows and ${IMPORT_COLUMNS.length} columns`);
  if (IMPORT_COLUMNS.some((column, index) => sheet.getRow(1).getCell(index + 1).value !== column))
    throw badWorkbook('Header must match the template exactly');
  const result: ParsedImportRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values = {} as ImportValues;
    const cells: Record<string, unknown> = {};
    const sourceErrors: ImportError[] = [];
    for (const [index, column] of IMPORT_COLUMNS.entries()) {
      const value = row.getCell(index + 1).value;
      cells[column] = value ?? null;
      if (value === null || value === undefined) values[column] = '';
      else if (typeof value === 'string') values[column] = value;
      else if (typeof value === 'number') {
        values[column] = String(value);
        if (['isbn', 'accessionNumber', 'authorNumber'].includes(column))
          sourceErrors.push({
            field: column,
            message: 'Enter identifiers as text to preserve leading zeroes',
          });
      } else {
        values[column] = JSON.stringify(value);
        sourceErrors.push({
          field: column,
          message:
            'Use plain text or a numeric price; formulas and other cell types require correction',
        });
      }
    }
    if (Object.values(values).some((value) => value !== ''))
      result.push({ rowNumber, values, sourceErrors, cells });
  }
  if (result.length === 0) throw badWorkbook('Workbook contains no data rows');
  return result;
}
