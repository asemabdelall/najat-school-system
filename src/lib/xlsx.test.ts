import { describe, expect, it } from 'vitest';
import { buildXlsx, columnLetter, crc32, escapeXml, safeSheetName } from './xlsx';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('xlsx writer', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('maps column indexes to letters', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });
  it('escapes XML and drops characters XML cannot hold', () => {
    expect(escapeXml('a<b>&"c"\u0001')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });
  it('makes sheet names valid and unique', () => {
    const used = new Set<string>();
    expect(safeSheetName('فصل 12/1', used)).toBe('فصل 12 1');
    expect(safeSheetName('فصل 12/1', used)).toBe('فصل 12 1 2');
    expect(safeSheetName('x'.repeat(40), used)).toHaveLength(31);
  });
  it('builds a zip with the workbook parts, RTL sheet and inline (non-formula) text', () => {
    const bytes = buildXlsx([
      { name: 'النتائج', columns: [{ header: 'الاسم', value: (r: { n: string; s: number }) => r.n }, { header: 'الدرجة', value: (r) => r.s }], rows: [{ n: '=HYPERLINK("x")', s: 4.5 }] },
    ]);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    const body = text(bytes);
    for (const part of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) expect(body).toContain(part);
    expect(body).toContain('rightToLeft="1"');
    expect(body).toContain('<sheet name="النتائج"');
    expect(body).toContain('t="inlineStr"><is><t xml:space="preserve">=HYPERLINK(&quot;x&quot;)</t>');
    expect(body).not.toContain('<f>');
    expect(body).toContain('<v>4.5</v>');
  });
});
