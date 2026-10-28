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
