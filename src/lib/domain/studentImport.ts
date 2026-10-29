/**
 * Bulk student import: header mapping and row validation. Mirrors the
 * database constraints on public.students so problems are reported per row
 * before anything is written; create_student() still enforces them.
 */
export type ImportField = 'student_number' | 'full_name' | 'class' | 'date_of_birth' | 'guardian_name' | 'guardian_phone' | 'notes';

export const IMPORT_COLUMNS: { field: ImportField; header: string; required?: boolean; aliases: string[]; example: string }[] = [
  { field: 'student_number', header: 'الرقم الطلابي', required: true, aliases: ['رقم الطالب', 'الرقم', 'student_number', 'student number', 'id'], example: 'NJ-2027-0001' },
  { field: 'full_name', header: 'اسم الطالب', required: true, aliases: ['الاسم', 'الاسم الكامل', 'الاسم الرباعي', 'full_name', 'name'], example: 'محمد أحمد عبدالله الكندري' },
  { field: 'class', header: 'الفصل', aliases: ['الشعبة', 'class', 'section'], example: '10/1' },
  { field: 'date_of_birth', header: 'تاريخ الميلاد', aliases: ['الميلاد', 'date_of_birth', 'dob', 'birth date'], example: '2010-03-15' },
  { field: 'guardian_name', header: 'ولي الأمر', aliases: ['اسم ولي الأمر', 'guardian', 'guardian_name'], example: 'أحمد عبدالله الكندري' },
  { field: 'guardian_phone', header: 'هاتف ولي الأمر', aliases: ['الهاتف', 'رقم الهاتف', 'جوال ولي الأمر', 'phone', 'guardian_phone'], example: '+965 5000 0000' },
  { field: 'notes', header: 'ملاحظات', aliases: ['notes'], example: '' },
];

export type ImportClass = { id: string; name: string; grade_level: number; section: string };
export type ImportRow = {
  line: number;
  values: Record<ImportField, string>;
  classId: string | null;
  className: string | null;
  errors: string[];
};

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
export function latinDigits(s: string): string {
  return s.replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) - (d >= '۰' ? 0x06f0 : 0x0660)) % 10));
}
const norm = (s: string) => latinDigits(s).trim().toLowerCase().replace(/\s+/g, ' ');
const classKey = (s: string) => norm(s).replace(/^(فصل|الفصل|class)\s*/, '').replace(/[\\\-–_. ]+/g, '/');

/** Map each import field to its column index, or report missing required headers. */
export function mapHeaders(header: string[]): { map: Partial<Record<ImportField, number>>; missing: string[] } {
  const map: Partial<Record<ImportField, number>> = {};
  header.forEach((h, i) => {
    const key = norm(h.replace(/\*/g, ''));
    const col = IMPORT_COLUMNS.find((c) => norm(c.header) === key || c.aliases.some((a) => norm(a) === key));
    if (col && map[col.field] === undefined) map[col.field] = i;
  });
  const missing = IMPORT_COLUMNS.filter((c) => c.required && map[c.field] === undefined).map((c) => c.header);
  return { map, missing };
}

/** YYYY-MM-DD, or DD/MM/YYYY as written in Kuwait. Returns ISO or null. */
export function parseDate(raw: string): string | null {
  const s = latinDigits(raw).trim();
  let y: number, mo: number, d: number;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function validateImport(rows: string[][], map: Partial<Record<ImportField, number>>, classes: ImportClass[], existingNumbers: Set<string>): ImportRow[] {
  const byKey = new Map<string, ImportClass>();
  for (const c of classes) {
    byKey.set(classKey(`${c.grade_level}/${c.section}`), c);
    byKey.set(classKey(c.name), c);
  }
  const seen = new Map<string, number>();
  return rows.map((cells, i) => {
    const values = Object.fromEntries(
      IMPORT_COLUMNS.map((c) => [c.field, map[c.field] === undefined ? '' : (cells[map[c.field]!] ?? '').trim()]),
    ) as Record<ImportField, string>;
    values.student_number = latinDigits(values.student_number).toUpperCase();
    values.guardian_phone = latinDigits(values.guardian_phone);
    const errors: string[] = [];
    const line = i + 2; // header is line 1

    if (!values.student_number) errors.push('الرقم الطلابي مطلوب');
    else if (!/^[A-Za-z0-9-]{3,20}$/.test(values.student_number)) errors.push('الرقم الطلابي: ٣–٢٠ حرفًا إنجليزيًا أو رقمًا أو شرطة');
    else {
      const key = values.student_number.toLowerCase();
      if (existingNumbers.has(key)) errors.push('الرقم الطلابي مسجل مسبقًا في النظام');
      else if (seen.has(key)) errors.push(`الرقم الطلابي مكرر في الملف (السطر ${seen.get(key)})`);
      else seen.set(key, line);
    }
    const nameLen = values.full_name.length;
    if (!nameLen) errors.push('اسم الطالب مطلوب');
    else if (nameLen < 3 || nameLen > 120) errors.push('اسم الطالب بين ٣ و١٢٠ حرفًا');

    let dob = '';
    if (values.date_of_birth) {
      const iso = parseDate(values.date_of_birth);
      if (!iso) errors.push('تاريخ الميلاد غير مفهوم (استخدم 2010-03-15 أو 15/03/2010)');
      else if (iso < '1990-01-01' || iso > '2020-12-31') errors.push('تاريخ الميلاد خارج النطاق المسموح');
      else dob = iso;
    }
    values.date_of_birth = dob;
    if (values.guardian_name.length > 120) errors.push('اسم ولي الأمر أطول من ١٢٠ حرفًا');
    if (values.guardian_phone && !/^\+?[0-9 ]{7,20}$/.test(values.guardian_phone)) errors.push('هاتف ولي الأمر غير صالح');
    if (values.notes.length > 2000) errors.push('الملاحظات أطول من ٢٠٠٠ حرف');

    let cls: ImportClass | undefined;
    if (values.class) {
      cls = byKey.get(classKey(values.class));
      if (!cls) errors.push(`الفصل «${values.class}» غير موجود في العام الدراسي الحالي`);
    }
    return { line, values, classId: cls?.id ?? null, className: cls?.name ?? null, errors };
  });
}
