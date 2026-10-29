import * as React from 'react';
import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { downloadCsv, parseCsv, toCsv } from '@/lib/csv';
import { formatNumber } from '@/lib/format';
import { useDocumentTitle } from '@/lib/hooks';
import { useClasses, useCurrentYear } from '@/lib/queries';
import { EASE_OUT, spring } from '@/lib/motion';
import { IMPORT_COLUMNS, mapHeaders, validateImport, type ImportRow } from '@/lib/domain/studentImport';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/input';
import { EmptyState, LoadingState } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';

const MAX_ROWS = 3000;
const CONCURRENCY = 4;

type Result = { line: number; number: string; name: string; ok: boolean; message?: string };

/** All existing student numbers (lower-case), paged past the 1000-row API cap. */
async function existingNumbers(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('students').select('student_number').range(from, from + 999);
    if (error) throw error;
    data.forEach((s) => out.add(s.student_number.toLowerCase()));
    if (data.length < 1000) return out;
  }
}

function downloadTemplate() {
  const sample = [Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.field, c.example]))];
  downloadCsv('قالب-استيراد-الطلاب.csv', toCsv(sample, IMPORT_COLUMNS.map((c) => ({ header: c.header, value: (r: Record<string, string>) => r[c.field] }))));
}

export function ImportStudentsPage() {
  useDocumentTitle('استيراد الطلاب');
  const qc = useQueryClient();
  const year = useCurrentYear();
  const classes = useClasses(year.isLoading ? undefined : (year.data?.id ?? null));
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ImportRow[] | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [errorsOnly, setErrorsOnly] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = React.useState<Result[] | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const valid = rows?.filter((r) => r.errors.length === 0) ?? [];
  const invalid = rows?.filter((r) => r.errors.length > 0) ?? [];
  const running = progress !== null && results === null;

  const reset = () => {
    setRows(null);
    setFileName(null);
    setFileError(null);
    setProgress(null);
    setResults(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  async function readFile(file: File) {
    reset();
    setFileName(file.name);
    if (/\.xlsx?$/i.test(file.name)) {
      setFileError('ملفات Excel تُحفظ أولًا بصيغة CSV: من Excel اختر «حفظ باسم» ثم «CSV UTF-8 (محدد بفاصلة)».');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFileError('حجم الملف أكبر من ٥ ميغابايت.');
      return;
    }
    setReading(true);
    try {
      const table = parseCsv(await file.text());
      if (table.length < 2) throw new Error('الملف لا يحتوي على صفوف طلاب بعد سطر العناوين.');
      const { map, missing } = mapHeaders(table[0]);
      if (missing.length) throw new Error(`أعمدة مطلوبة غير موجودة: ${missing.join('، ')}. استخدم القالب لضبط العناوين.`);
      const body = table.slice(1);
      if (body.length > MAX_ROWS) throw new Error(`الحد الأقصى ${formatNumber(MAX_ROWS)} طالب في الملف الواحد.`);
      setRows(validateImport(body, map, classes.data ?? [], await existingNumbers()));
    } catch (e) {
      setFileError(e instanceof Error && /[؀-ۿ]/.test(e.message) ? e.message : errorMessage(e, 'تعذر قراءة الملف. تأكد أنه ملف CSV بترميز UTF-8.'));
    } finally {
      setReading(false);
    }
  }

  async function runImport() {
    const queue = [...valid];
    const out: Result[] = [];
    setProgress({ done: 0, total: queue.length });
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        const v = r.values;
        const { error } = await supabase.rpc('create_student', {
          p_student_number: v.student_number,
          p_full_name: v.full_name,
          p_date_of_birth: (v.date_of_birth || null) as string,
          p_guardian_name: v.guardian_name,
          p_guardian_phone: v.guardian_phone,
          p_notes: v.notes,
          p_class_id: r.classId as string,
        });
        out.push({ line: r.line, number: v.student_number, name: v.full_name, ok: !error, message: error ? errorMessage(error) : undefined });
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    out.sort((a, b) => a.line - b.line);
    setResults(out);
    void qc.invalidateQueries({ queryKey: ['students'] });
    void qc.invalidateQueries({ queryKey: ['classes'] });
  }

  const failures = results?.filter((r) => !r.ok) ?? [];
  const created = (results?.length ?? 0) - failures.length;

  function downloadProblems() {
    const list = [
      ...invalid.map((r) => ({ line: r.line, number: r.values.student_number, name: r.values.full_name, message: r.errors.join('؛ ') })),
      ...failures.map((r) => ({ line: r.line, number: r.number, name: r.name, message: r.message ?? '' })),
    ].sort((a, b) => a.line - b.line);
    downloadCsv(
      'مشكلات-استيراد-الطلاب.csv',
      toCsv(list, [
        { header: 'السطر', value: (r) => r.line },
        { header: 'الرقم الطلابي', value: (r) => r.number },
        { header: 'اسم الطالب', value: (r) => r.name },
        { header: 'المشكلة', value: (r) => r.message },
      ]),
    );
  }

  const shown = (errorsOnly ? invalid : rows ?? []).slice(0, 500);

  return (
    <>
      <PageHeader
        title="استيراد الطلاب"
        description="إضافة طلاب العام الدراسي دفعة واحدة من ملف CSV، مع تسجيلهم في فصولهم"
        breadcrumbs={[{ label: 'الطلاب', to: '/students' }, { label: 'استيراد' }]}
        actions={
          <Button variant="secondary" onClick={downloadTemplate}>
            <Download /> تنزيل القالب
          </Button>
        }
      />

      {year.isLoading || classes.isLoading ? (
        <LoadingState rows={3} />
      ) : !year.data ? (
        <Card>
          <EmptyState
            icon={<AlertTriangle />}
            title="لا يوجد عام دراسي حالي"
            description="حدّد العام الدراسي الحالي وأنشئ فصوله أولًا، ثم عُد لاستيراد الطلاب."
            action={<Button asChild><Link to="/settings">إعدادات العام الدراسي</Link></Button>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {!rows && (
            <Card>
              <CardContent className="space-y-5">
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="اختيار ملف CSV للطلاب"
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const f = e.dataTransfer.files[0];
                    if (f) void readFile(f);
                  }}
                  className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${dragging ? 'border-brand bg-brand-soft' : 'border-line-strong hover:bg-surface-hover'}`}
                >
                  <m.span animate={dragging ? { y: -6, scale: 1.08 } : { y: 0, scale: 1 }} transition={spring.pop} className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand dark:text-link">
                    {reading ? <FileSpreadsheet className="size-6 animate-pulse" /> : <Upload className="size-6" />}
                  </m.span>
                  <p className="mt-4 font-bold">{reading ? 'جارٍ قراءة الملف والتحقق منه…' : 'اسحب ملف CSV إلى هنا أو اضغط للاختيار'}</p>
                  <p className="mt-1 text-sm text-fg-muted">ملف CSV بترميز UTF-8، حتى {formatNumber(MAX_ROWS)} طالب. لا يُحفظ أي شيء قبل مراجعتك.</p>
                  <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
                </div>
                <AnimatePresence>
                  {fileError && (
                    <m.p role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft p-3 text-sm font-semibold text-danger">
                      <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {fileName}: {fileError}
                    </m.p>
                  )}
                </AnimatePresence>
                <div className="grid gap-5 text-sm md:grid-cols-2">
                  <div>
                    <h3 className="font-bold">الأعمدة</h3>
                    <ul className="mt-2 space-y-1 text-fg-muted">
                      {IMPORT_COLUMNS.map((c) => (
                        <li key={c.field}>
                          <span className="font-semibold text-fg">{c.header}</span>
                          {c.required ? ' (مطلوب)' : ' (اختياري)'}
                          {c.example && (
                            <>
                              {' — '}
                              <span className="ltr text-fg-subtle">{c.example}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-2 text-fg-muted">
                    <h3 className="font-bold text-fg">قبل الرفع</h3>
                    <p>الفصل يُكتب كما في النظام، مثل <span className="ltr">10/1</span>، ويجب أن يكون من فصول العام {year.data.name}.</p>
                    <p>تاريخ الميلاد بالشكل <span className="ltr">2010-03-15</span> أو <span className="ltr">15/03/2010</span>. الأرقام العربية مقبولة.</p>
                    <p>من Excel: «حفظ باسم» ثم «CSV UTF-8». الطلاب المسجلون مسبقًا برقمهم الطلابي لا يُكررون.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {rows && !results && (
            <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }}>
              <Card>
                <CardHeader
                  icon={<FileSpreadsheet />}
                  title={`مراجعة ${fileName}`}
                  description={`${formatNumber(rows.length)} صف: ${formatNumber(valid.length)} جاهز للاستيراد، ${formatNumber(invalid.length)} به مشكلات لن يُستورد.`}
                  actions={
                    <>
                      <Button variant="ghost" onClick={reset} disabled={running}>
                        <RotateCcw /> ملف آخر
                      </Button>
                      {invalid.length > 0 && (
                        <Button variant="secondary" onClick={downloadProblems} disabled={running}>
                          <Download /> المشكلات (CSV)
                        </Button>
                      )}
                      <Button onClick={() => void runImport()} disabled={valid.length === 0 || running} loading={running}>
                        <Upload /> استيراد {formatNumber(valid.length)} طالب
                      </Button>
                    </>
                  }
                />
                {progress && (
                  <div className="border-b border-line px-5 py-4" aria-live="polite">
                    <p className="mb-2 text-sm font-semibold">
                      جارٍ الاستيراد: {formatNumber(progress.done)} من {formatNumber(progress.total)}
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
                      <m.div className="h-full origin-right rounded-full bg-success" animate={{ scaleX: progress.total ? progress.done / progress.total : 0 }} transition={spring.sheet} />
                    </div>
                  </div>
                )}
                {invalid.length > 0 && (
                  <label className="flex items-center gap-2 border-b border-line px-5 py-3 text-sm">
                    <Checkbox checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> عرض الصفوف التي بها مشكلات فقط
                  </label>
                )}
                <Table caption="معاينة صفوف الملف">
                  <THead>
                    <tr>
                      <Th>السطر</Th>
                      <Th>الرقم الطلابي</Th>
                      <Th>اسم الطالب</Th>
                      <Th>الفصل</Th>
                      <Th>تاريخ الميلاد</Th>
                      <Th>الحالة</Th>
                    </tr>
                  </THead>
                  <TBody>
                    {shown.map((r) => (
                      <Tr key={r.line}>
                        <Td className="tabular text-fg-muted">{r.line}</Td>
                        <Td className="ltr text-end tabular">{r.values.student_number || '—'}</Td>
                        <Td className="font-semibold">{r.values.full_name || '—'}</Td>
                        <Td>{r.className ?? (r.values.class || <span className="text-fg-subtle">بدون فصل</span>)}</Td>
                        <Td className="tabular">{r.values.date_of_birth || '—'}</Td>
                        <Td>
                          {r.errors.length === 0 ? (
                            <Badge tone="success"><CheckCircle2 /> جاهز</Badge>
                          ) : (
                            <span className="flex flex-col gap-1">
                              {r.errors.map((e) => (
                                <Badge key={e} tone="danger" className="whitespace-normal"><XCircle /> {e}</Badge>
                              ))}
                            </span>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
                {(errorsOnly ? invalid : rows).length > shown.length && (
                  <p className="px-5 py-3 text-sm text-fg-muted">تُعرض أول {formatNumber(shown.length)} صفوف فقط؛ يشمل الاستيراد الملف كله.</p>
                )}
              </Card>
            </m.div>
          )}

          {results && (
            <m.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={spring.sheet}>
              <Card>
                <CardContent className="flex flex-col items-center py-10 text-center">
                  <m.span initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.pop, delay: 0.1 }} className={`grid size-16 place-items-center rounded-full ${failures.length ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'}`}>
                    {failures.length ? <AlertTriangle className="size-8" /> : <CheckCircle2 className="size-8" />}
                  </m.span>
                  <h2 className="mt-4 text-xl font-bold">تمت إضافة {formatNumber(created)} طالب</h2>
                  <p className="mt-1 text-sm text-fg-muted">
                    {failures.length || invalid.length
                      ? `لم يُستورد ${formatNumber(failures.length + invalid.length)} صف. نزّل ملف المشكلات وصحّحها ثم أعد رفعها وحدها.`
                      : 'استُورد الملف كاملًا، وسُجل كل طالب في فصله.'}
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    <Button asChild><Link to="/students">عرض الطلاب</Link></Button>
                    {(failures.length > 0 || invalid.length > 0) && (
                      <Button variant="secondary" onClick={downloadProblems}><Download /> المشكلات (CSV)</Button>
                    )}
                    <Button variant="ghost" onClick={reset}><RotateCcw /> استيراد ملف آخر</Button>
                  </div>
                </CardContent>
              </Card>
            </m.div>
          )}
        </div>
      )}
    </>
  );
}
