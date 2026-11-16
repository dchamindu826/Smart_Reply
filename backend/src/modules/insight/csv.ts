/**
 * CSV writer for exports. Quotes cells that need it and defuses spreadsheet formulas
 * (CSV injection): a text cell starting with `=`, `+`, `-`, `@`, tab or carriage return
 * gets a leading apostrophe so Excel and Sheets show it as text.
 */
export type CsvCell = string | number | boolean | null | undefined | Date;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === 'number') s = Number.isFinite(value) ? String(value) : '';
  else if (typeof value === 'boolean') s = value ? 'yes' : 'no';
  else {
    s = value;
    if (FORMULA_START.test(s)) s = `'${s}`;
  }
  if (/[",\r\n]/.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Header plus rows, CRLF line ends, with a UTF-8 byte order mark so Excel reads Sinhala and Tamil. */
export function toCsv(header: string[], rows: CsvCell[][]): Buffer {
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) lines.push(r.map(csvCell).join(','));
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8');
}
