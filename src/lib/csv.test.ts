import { describe, expect, it } from 'vitest';
import { escapeCsvCell, toCsv } from './csv';

describe('CSV export', () => {
  it('starts with a UTF-8 BOM and uses CRLF', () => {
    const csv = toCsv([{ a: 'محمد', b: 1 }], [{ header: 'الاسم', value: (r) => r.a }, { header: 'العدد', value: (r) => r.b }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('﻿الاسم,العدد\r\nمحمد,1\r\n');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(escapeCsvCell('أ، ب, ج')).toBe('"أ، ب, ج"');
    expect(escapeCsvCell('قال "نعم"')).toBe('"قال ""نعم"""');
    expect(escapeCsvCell('سطر\nثان')).toBe('"سطر\nثان"');
  });
  it('neutralises spreadsheet formula injection in text', () => {
    expect(escapeCsvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvCell(-5)).toBe('-5'); // numbers are untouched
  });
  it('renders null/undefined as empty', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });
});
