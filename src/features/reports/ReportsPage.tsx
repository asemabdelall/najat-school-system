import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarRange, Download, Flag, ListChecks, Printer, School, Users } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StudentPicker, type PickedStudent } from '@/components/StudentPicker';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import { downloadCsv, toCsv, type CsvColumn } from '@/lib/csv';
import { formatDate, formatNumber, formatPercent, kuwaitToday, startOfMonth } from '@/lib/format';
import { useClasses, useCurrentYear, useSchoolSettings } from '@/lib/queries';
import { pivotIncidents, reportFilename, totalAttendance, validateRange, type IncidentSummaryRow } from '@/lib/domain/reports';
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUSES } from '@/lib/domain/behavior';
import { AbsenceChart, type TrendRow } from '@/features/dashboard/AttendanceCharts';

type Tab = 'students' | 'classes' | 'daily' | 'behavior' | 'followups';

function ReportToolbar({ count, onExport, title }: { count: number; onExport: () => void; title: string }) {
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
      <p className="text-sm text-fg-muted" aria-live="polite">{formatNumber(count)} صف · {title}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer /> طباعة</Button>
        <Button size="sm" variant="secondary" disabled={count === 0} onClick={onExport}><Download /> تصدير CSV</Button>
      </div>
    </div>
  );
}

const num = (v: number | null | undefined) => formatNumber(Number(v ?? 0));

export function ReportsPage() {
  const { isManager, profile } = useAuth();
  const settings = useSchoolSettings();
  const today = kuwaitToday();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) ?? 'students';
  const from = params.get('from') ?? startOfMonth(today);
  const to = params.get('to') ?? today;
  const classId = params.get('class');
  const [student, setStudent] = React.useState<PickedStudent[]>([]);
  const year = useCurrentYear();
  const classes = useClasses(year.data?.id ?? undefined);
  const rangeError = validateRange(from, to);
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const enabled = !rangeError;
  const className = classes.data?.find((c) => c.id === classId)?.name;
  const scopeLabel = `${formatDate(from)} – ${formatDate(to)}${className ? ` · فصل ${className}` : ''}${student[0] ? ` · ${student[0].full_name}` : ''}`;

  const studentReport = useQuery({
    queryKey: ['reports', 'students', from, to, classId, student[0]?.id],
    queryFn: async () => unwrap(await supabase.rpc('attendance_student_summary', { p_from: from, p_to: to, ...(classId ? { p_class_id: classId } : {}), ...(student[0] ? { p_student_id: student[0].id } : {}) })),
    enabled: enabled && tab === 'students',
  });
  const classReport = useQuery({
    queryKey: ['reports', 'classes', from, to],
    queryFn: async () => unwrap(await supabase.rpc('class_attendance_summary', { p_from: from, p_to: to })),
    enabled: enabled && tab === 'classes',
  });
  const dailyReport = useQuery({
    queryKey: ['reports', 'daily', from, to, classId],
    queryFn: async () => unwrap(await supabase.rpc('attendance_trend', { p_from: from, p_to: to, ...(classId ? { p_class_id: classId } : {}) })) as TrendRow[],
    enabled: enabled && tab === 'daily',
  });
  const behaviorReport = useQuery({
    queryKey: ['reports', 'behavior', from, to],
    queryFn: async () => pivotIncidents(unwrap(await supabase.rpc('incident_summary', { p_from: from, p_to: to })) as IncidentSummaryRow[]),
    enabled: enabled && tab === 'behavior',
  });
  const followReport = useQuery({
    queryKey: ['reports', 'followups'],
    queryFn: async () => unwrap(await supabase.rpc('follow_up_summary')),
    enabled: tab === 'followups',
  });

  const exportRows = <T,>(kind: string, rows: readonly T[], cols: CsvColumn<T>[]) => downloadCsv(reportFilename(kind, from, to), toCsv(rows, cols));
  const totals = totalAttendance(studentReport.data ?? []);
  const classTotals = totalAttendance(classReport.data ?? []);

  return (
    <>
      <PageHeader
        title="التقارير"
        description={isManager ? 'تقارير المدرسة المبنية على البيانات المرصودة فعليًا' : 'تقارير فصولك وطلابك فقط'}
      />
      {/* Print header */}
      <div className="print-only mb-4 border-b pb-3">
        <p className="text-lg font-bold">{settings.data?.school_name_ar}</p>
        <p>تقرير: {scopeLabel}</p>
        <p className="text-sm">أُعد بواسطة {profile?.full_name} في {formatDate(today)}</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => set('tab', v)} dir="rtl">
        <TabsList className="mb-4">
          <TabsTrigger value="students"><Users /> حضور الطلاب</TabsTrigger>
          <TabsTrigger value="classes"><School /> ملخص الفصول</TabsTrigger>
          <TabsTrigger value="daily"><CalendarRange /> الحضور اليومي</TabsTrigger>
          {isManager && <TabsTrigger value="behavior"><Flag /> السلوك</TabsTrigger>}
          <TabsTrigger value="followups"><ListChecks /> المتابعة</TabsTrigger>
        </TabsList>

        {tab !== 'followups' && (
          <Card className="no-print mb-4">
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(9rem,12rem))_1fr]">
              <div><label htmlFor="r-from" className="mb-1 block text-xs font-semibold text-fg-muted">من</label><Input id="r-from" type="date" value={from} max={today} onChange={(e) => set('from', e.target.value)} /></div>
              <div><label htmlFor="r-to" className="mb-1 block text-xs font-semibold text-fg-muted">إلى</label><Input id="r-to" type="date" value={to} max={today} onChange={(e) => set('to', e.target.value)} /></div>
              {(tab === 'students' || tab === 'daily') && (
                <div>
                  <label htmlFor="r-class" className="mb-1 block text-xs font-semibold text-fg-muted">الفصل</label>
                  <Select id="r-class" value={classId ?? ''} onChange={(e) => set('class', e.target.value || null)}>
                    <option value="">كل الفصول المتاحة</option>
                    {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
              )}
              {tab === 'students' && (
                <div><span className="mb-1 block text-xs font-semibold text-fg-muted">طالب محدد</span><StudentPicker id="r-student" value={student} onChange={setStudent} /></div>
              )}
            </div>
            {rangeError && <p role="alert" className="px-4 pb-3 text-sm font-semibold text-danger">{rangeError}</p>}
          </Card>
        )}

        <TabsContent value="students">
          <Card className="print-plain">
            {rangeError ? <EmptyState icon={<CalendarRange />} title={rangeError} /> : studentReport.isPending ? <LoadingState rows={8} /> : studentReport.isError ? <ErrorState error={studentReport.error} onRetry={() => studentReport.refetch()} /> : (
              <>
                <ReportToolbar count={studentReport.data.length} title={scopeLabel} onExport={() => exportRows('student-attendance', studentReport.data, [
                  { header: 'الرقم الطلابي', value: (r) => r.student_number },
                  { header: 'اسم الطالب', value: (r) => r.full_name },
                  { header: 'الفصل', value: (r) => r.class_name },
                  { header: 'حاضر', value: (r) => r.present },
                  { header: 'متأخر', value: (r) => r.late },
                  { header: 'غائب', value: (r) => r.absent },
                  { header: 'غياب بعذر', value: (r) => r.excused },
                  { header: 'إجمالي المرصود', value: (r) => r.total_marked },
                  { header: 'نسبة الحضور %', value: (r) => r.rate },
                ])} />
                {studentReport.data.length === 0 ? <EmptyState icon={<BarChart3 />} title="لا توجد سجلات حضور مرصودة للفترة والتصفية المحددة" /> : (
                  <Table caption="تقرير حضور الطلاب">
                    <THead><Tr><Th>الطالب</Th><Th>الفصل</Th><Th>حاضر</Th><Th>متأخر</Th><Th>غائب</Th><Th>بعذر</Th><Th>المرصود</Th><Th>النسبة</Th></Tr></THead>
                    <TBody>
                      {studentReport.data.map((r) => (
                        <Tr key={`${r.student_id}-${r.class_id}`}>
                          <Td><Link to={`/students/${r.student_id}`} className="font-semibold hover:text-link hover:underline">{r.full_name}</Link></Td>
                          <Td>{r.class_name}</Td>
                          <Td className="tabular">{num(r.present)}</Td><Td className="tabular">{num(r.late)}</Td>
                          <Td className="tabular font-semibold">{num(r.absent)}</Td><Td className="tabular">{num(r.excused)}</Td>
                          <Td className="tabular">{num(r.total_marked)}</Td><Td className="tabular">{formatPercent(r.rate)}</Td>
                        </Tr>
                      ))}
                      <Tr className="bg-surface-sunken font-bold" data-testid="report-totals">
                        <Td colSpan={2}>الإجمالي</Td>
                        <Td className="tabular">{num(totals.present)}</Td><Td className="tabular">{num(totals.late)}</Td>
                        <Td className="tabular">{num(totals.absent)}</Td><Td className="tabular">{num(totals.excused)}</Td>
                        <Td className="tabular">{num(totals.total_marked)}</Td><Td className="tabular">{formatPercent(totals.rate)}</Td>
                      </Tr>
                    </TBody>
                  </Table>
                )}
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="classes">
          <Card className="print-plain">
            {rangeError ? <EmptyState icon={<CalendarRange />} title={rangeError} /> : classReport.isPending ? <LoadingState /> : classReport.isError ? <ErrorState error={classReport.error} onRetry={() => classReport.refetch()} /> : (
              <>
                <ReportToolbar count={classReport.data.length} title={scopeLabel} onExport={() => exportRows('class-summary', classReport.data, [
                  { header: 'الفصل', value: (r) => r.class_name }, { header: 'الصف', value: (r) => r.grade_level },
                  { header: 'المسجلون', value: (r) => r.enrolled }, { header: 'الجلسات', value: (r) => r.sessions },
                  { header: 'الجلسات المعتمدة', value: (r) => r.sessions_submitted }, { header: 'حاضر', value: (r) => r.present },
                  { header: 'متأخر', value: (r) => r.late }, { header: 'غائب', value: (r) => r.absent },
                  { header: 'غياب بعذر', value: (r) => r.excused }, { header: 'نسبة الحضور %', value: (r) => r.rate },
                ])} />
                {classReport.data.length === 0 ? <EmptyState title="لا توجد فصول ضمن نطاقك" /> : (
                  <Table caption="ملخص الفصول">
                    <THead><Tr><Th>الفصل</Th><Th>المسجلون</Th><Th>الجلسات (المعتمدة)</Th><Th>حاضر</Th><Th>متأخر</Th><Th>غائب</Th><Th>بعذر</Th><Th>النسبة</Th></Tr></THead>
                    <TBody>
                      {classReport.data.map((r) => (
                        <Tr key={r.class_id}>
                          <Td className="font-semibold"><Link to={`/classes/${r.class_id}`} className="hover:text-link hover:underline">{r.class_name}</Link></Td>
                          <Td className="tabular">{num(r.enrolled)}</Td>
                          <Td className="tabular">{num(r.sessions)} ({num(r.sessions_submitted)})</Td>
                          <Td className="tabular">{num(r.present)}</Td><Td className="tabular">{num(r.late)}</Td><Td className="tabular">{num(r.absent)}</Td><Td className="tabular">{num(r.excused)}</Td>
                          <Td className="tabular">{formatPercent(r.rate)}</Td>
                        </Tr>
                      ))}
                      <Tr className="bg-surface-sunken font-bold">
                        <Td colSpan={3}>الإجمالي</Td>
                        <Td className="tabular">{num(classTotals.present)}</Td><Td className="tabular">{num(classTotals.late)}</Td><Td className="tabular">{num(classTotals.absent)}</Td><Td className="tabular">{num(classTotals.excused)}</Td>
                        <Td className="tabular">{formatPercent(classTotals.rate)}</Td>
                      </Tr>
                    </TBody>
                  </Table>
                )}
              </>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="daily">
          <Card className="print-plain">
            {rangeError ? <EmptyState icon={<CalendarRange />} title={rangeError} /> : dailyReport.isPending ? <LoadingState /> : dailyReport.isError ? <ErrorState error={dailyReport.error} onRetry={() => dailyReport.refetch()} /> : (
              <>
                <ReportToolbar count={dailyReport.data.length} title={scopeLabel} onExport={() => exportRows('daily-attendance', dailyReport.data, [
                  { header: 'التاريخ', value: (r) => r.day }, { header: 'حاضر', value: (r) => r.present }, { header: 'متأخر', value: (r) => r.late },
                  { header: 'غائب', value: (r) => r.absent }, { header: 'غياب بعذر', value: (r) => r.excused }, { header: 'نسبة الحضور %', value: (r) => r.rate },
                ])} />
                {dailyReport.data.length === 0 ? <EmptyState title="لا توجد بيانات" /> : (
                  <>
                    <div className="no-print p-4"><AbsenceChart data={dailyReport.data} /></div>
                    <Table caption="الحضور اليومي (عرض جدولي للرسم)">
                      <THead><Tr><Th>التاريخ</Th><Th>حاضر</Th><Th>متأخر</Th><Th>غائب</Th><Th>بعذر</Th><Th>النسبة</Th></Tr></THead>
                      <TBody>
                        {dailyReport.data.map((r) => (
                          <Tr key={r.day}><Td>{formatDate(r.day)}</Td><Td className="tabular">{num(r.present)}</Td><Td className="tabular">{num(r.late)}</Td><Td className="tabular">{num(r.absent)}</Td><Td className="tabular">{num(r.excused)}</Td><Td className="tabular">{formatPercent(r.rate)}</Td></Tr>
                        ))}
                      </TBody>
                    </Table>
                  </>
                )}
              </>
            )}
          </Card>
        </TabsContent>

        {isManager && (
          <TabsContent value="behavior">
            <Card className="print-plain">
              {rangeError ? <EmptyState icon={<CalendarRange />} title={rangeError} /> : behaviorReport.isPending ? <LoadingState /> : behaviorReport.isError ? <ErrorState error={behaviorReport.error} onRetry={() => behaviorReport.refetch()} /> : (
                <>
                  <ReportToolbar count={behaviorReport.data.length} title={scopeLabel} onExport={() => exportRows('behavior', behaviorReport.data, [
                    { header: 'التصنيف', value: (r) => r.category },
                    ...INCIDENT_STATUSES.map((s) => ({ header: INCIDENT_STATUS_LABELS[s], value: (r: (typeof behaviorReport.data)[number]) => r[s] })),
                    { header: 'الإجمالي', value: (r) => r.total },
                  ])} />
                  {behaviorReport.data.length === 0 ? <EmptyState icon={<Flag />} title="لا توجد بلاغات في الفترة" /> : (
                    <Table caption="البلاغات حسب التصنيف والحالة">
                      <THead><Tr><Th>التصنيف</Th>{INCIDENT_STATUSES.map((s) => <Th key={s}>{INCIDENT_STATUS_LABELS[s]}</Th>)}<Th>الإجمالي</Th></Tr></THead>
                      <TBody>
                        {behaviorReport.data.map((r) => (
                          <Tr key={r.category}><Td className="font-semibold">{r.category}</Td>{INCIDENT_STATUSES.map((s) => <Td key={s} className="tabular">{num(r[s])}</Td>)}<Td className="tabular font-bold">{num(r.total)}</Td></Tr>
                        ))}
                      </TBody>
                    </Table>
                  )}
                  <p className="px-4 py-3 text-xs text-fg-muted">تقرير إحصائي لدعم المتابعة فقط؛ لا يُصنّف الطلاب ولا يتضمن أحكامًا تلقائية.</p>
                </>
              )}
            </Card>
          </TabsContent>
        )}

        <TabsContent value="followups">
          <Card className="print-plain">
            {followReport.isPending ? <LoadingState /> : followReport.isError ? <ErrorState error={followReport.error} onRetry={() => followReport.refetch()} /> : (
              <>
                <ReportToolbar count={followReport.data.length} title="جميع المهام ضمن نطاقك" onExport={() => exportRows('follow-ups', followReport.data, [
                  { header: 'المسؤول', value: (r) => r.assignee_name }, { header: 'مفتوحة', value: (r) => r.open }, { header: 'قيد التنفيذ', value: (r) => r.in_progress },
                  { header: 'مكتملة', value: (r) => r.completed }, { header: 'ملغاة', value: (r) => r.cancelled }, { header: 'متأخرة', value: (r) => r.overdue },
                ])} />
                {followReport.data.length === 0 ? <EmptyState title="لا توجد مهام" /> : (
                  <Table caption="المتابعة حسب المسؤول">
                    <THead><Tr><Th>المسؤول</Th><Th>مفتوحة</Th><Th>قيد التنفيذ</Th><Th>مكتملة</Th><Th>ملغاة</Th><Th>متأخرة</Th></Tr></THead>
                    <TBody>
                      {followReport.data.map((r) => (
                        <Tr key={r.assignee_id}>
                          <Td className="font-semibold"><Link className="hover:text-link hover:underline" to={`/follow-ups?assignee=${r.assignee_id}&status=`}>{r.assignee_name}</Link></Td>
                          <Td className="tabular">{num(r.open)}</Td><Td className="tabular">{num(r.in_progress)}</Td><Td className="tabular">{num(r.completed)}</Td><Td className="tabular">{num(r.cancelled)}</Td>
                          <Td className="tabular font-semibold">{num(r.overdue)}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                )}
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>
      <p className="mt-4 text-xs text-fg-muted">قواعد الاحتساب: تُحتسب السجلات المرصودة فقط؛ الطالب غير المرصود لا يُعد غائبًا. نسبة الحضور = (حاضر + متأخر) ÷ إجمالي المرصود. التصدير يطابق البيانات المعروضة وصلاحياتك.</p>
    </>
  );
}
