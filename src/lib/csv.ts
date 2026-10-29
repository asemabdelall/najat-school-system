/**
 * CSV export suitable for Arabic spreadsheet workflows: UTF-8 with BOM
 * (so Excel detects the encoding), CRLF line endings, RFC 4180 quoting,
 * and neutralisation of spreadsheet formula injection.
 */
export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined };

export function escapeCsvCell(raw: string | number | null | undefined): string {
  if (raw == null) return '';
  let value = String(raw);
  // Prevent formula injection (=, +, -, @, tab, CR) for text values.
  if (typeof raw === 'string' && /^[=+\-@\t\r]/.test(value)) value = `'${value}`;
  if (/[",\r\n]/.test(value) || value !== value.trim()) value = `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCsvCell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => escapeCsvCell(c.value(row))).join(','));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * RFC 4180 CSV parser for imports. Accepts a UTF-8 BOM, CRLF or LF, quoted
 * cells with embedded separators/newlines, and comma, semicolon (Excel in
 * Arabic locales) or tab separators, detected from the header line.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1] as const);
  const sep = counts.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Drop fully empty lines (trailing newline, blank rows left by Excel).
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
