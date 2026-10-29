import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/csv';
import { latinDigits, mapHeaders, parseDate, validateImport } from './studentImport';

const classes = [
  { id: 'c101', name: 'فصل 10/1', grade_level: 10, section: '1' },
  { id: 'c112', name: 'فصل 11/2', grade_level: 11, section: '2' },
];

describe('parseCsv', () => {
  it('handles BOM, CRLF, quotes and blank lines', () => {
    const rows = parseCsv('﻿أ,ب\r\n"س، ""ص""",2\r\n\r\n"سطر\nثان",3\n');
    expect(rows).toEqual([['أ', 'ب'], ['س، "ص"', '2'], ['سطر\nثان', '3']]);
  });
  it('detects semicolon and tab separators', () => {
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });
});

describe('student import', () => {
  it('maps Arabic and English headers and reports missing required ones', () => {
    expect(mapHeaders(['الرقم الطلابي *', 'الاسم الكامل', 'Class']).map).toEqual({ student_number: 0, full_name: 1, class: 2 });
    expect(mapHeaders(['الفصل']).missing).toEqual(['الرقم الطلابي', 'اسم الطالب']);
  });
  it('normalises digits and dates', () => {
    expect(latinDigits('١٠/١ ۲۰')).toBe('10/1 20');
    expect(parseDate('15/03/2010')).toBe('2010-03-15');
    expect(parseDate('٢٠١٠-٠٣-١٥')).toBe('2010-03-15');
    expect(parseDate('31/02/2010')).toBeNull();
  });
  it('validates rows against the database rules, the file and existing students', () => {
    const { map } = mapHeaders(['الرقم الطلابي', 'اسم الطالب', 'الفصل', 'تاريخ الميلاد', 'هاتف ولي الأمر']);
    const rows = validateImport(
      [
        ['nj-1001', 'محمد أحمد الكندري', '١٠/١', '15/03/2010', '+965 5000 0000'],
        ['NJ-1001', 'خالد علي', '11-2', '', ''],
        ['NJ-0007', 'سالم', 'فصل 12/9', '1980-01-01', 'abc'],
        ['', 'اب', '', '', ''],
      ],
      map,
      classes,
      new Set(['nj-0007']),
    );
    expect(rows[0]).toMatchObject({ line: 2, errors: [], classId: 'c101', values: { student_number: 'NJ-1001', date_of_birth: '2010-03-15' } });
    expect(rows[1].errors).toEqual(['الرقم الطلابي مكرر في الملف (السطر 2)']);
    expect(rows[1].classId).toBe('c112');
    expect(rows[2].errors).toHaveLength(4); // existing number, out-of-range DOB, bad phone, unknown class
    expect(rows[3].errors).toEqual(['الرقم الطلابي مطلوب', 'اسم الطالب بين ٣ و١٢٠ حرفًا']);
  });
});
