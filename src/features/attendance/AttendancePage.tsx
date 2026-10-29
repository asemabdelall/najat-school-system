import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarCheck2, CalendarX2, ClipboardList, FileClock } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { CompletionBadge } from '@/components/ui/status-badges';
import { addDays, formatDate, formatNumber, formatWeekday, isSchoolDay, kuwaitToday, previousSchoolDay } from '@/lib/format';
import { useClasses, useCurrentYear, useSchoolSettings } from '@/lib/queries';
import { periodLabel, sessionCompletion, type AttendanceMode } from '@/lib/domain/attendance';
import { useEnrollmentCounts } from '@/features/classes/api';
import { useRecentSessions, useSessionsForDate } from './api';

const PAGE = 20;

function countOf(rel: { count: number }[] | null | undefined) {
  return rel?.[0]?.count ?? 0;
}

export function AttendancePage() {
  const { can } = useAuth();
  const today = kuwaitToday();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? previousSchoolDay(today);
  const settings = useSchoolSettings();
  const mode = (settings.data?.attendance_mode ?? 'daily') as AttendanceMode;
  const periods = mode === 'daily' ? [0] : Array.from({ length: settings.data?.periods_per_day ?? 7 }, (_, i) => i + 1);
  const year = useCurrentYear();
  const classes = useClasses(year.data?.id ?? undefined);
  const counts = useEnrollmentCounts(year.data?.id ?? undefined);
  const sessions = useSessionsForDate(date);

  const [histClass, setHistClass] = React.useState<string | null>(null);
  const [histStatus, setHistStatus] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const history = useRecentSessions({ from: addDays(today, -60), to: today, classId: histClass, status: histStatus, page, pageSize: PAGE });

  const byKey = new Map((sessions.data ?? []).map((s) => [`${s.class_id}|${s.period}`, s]));
  const totalSlots = (classes.data?.length ?? 0) * periods.length;
  const submittedSlots = (sessions.data ?? []).filter((s) => s.status === 'submitted' && periods.includes(s.period)).length;

  return (
    <>
      <PageHeader
        title="الحضور والغياب"
        description={`حالة الرصد لكل فصل · النظام الحالي: ${mode === 'daily' ? 'حضور يومي' : 'حضور بالحصة'}`}
        actions={
          <>
            <Button asChild variant="secondary"><Link to="/attendance/excuses"><FileClock /> أعذار الغياب</Link></Button>
            <Button asChild><Link to={`/attendance/take?date=${date}`}><CalendarCheck2 /> رصد الحضور</Link></Button>
          </>
        }
      />

      <Card className="mb-5">
        <CardHeader
          icon={<ClipboardList />}
          title={`رصد ${formatWeekday(date)} ${formatDate(date)}`}
          description={isSchoolDay(date) ? `${formatNumber(submittedSlots)} من ${formatNumber(totalSlots)} جلسة معتمدة` : 'يوم عطلة أسبوعية'}
          actions={
            <>
              <label htmlFor="overview-date" className="sr-only">التاريخ</label>
              <div className="w-44"><Input id="overview-date" type="date" className="h-9" value={date} max={today} onChange={(e) => e.target.value && setParams({ date: e.target.value })} /></div>
            </>
          }
        />
        {classes.isPending || sessions.isPending ? (
          <LoadingState rows={4} />
        ) : sessions.isError ? (
          <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
        ) : !isSchoolDay(date) ? (
          <EmptyState icon={<CalendarX2 />} title="لا يوجد رصد في يومي الجمعة والسبت" />
        ) : (classes.data ?? []).length === 0 ? (
          <EmptyState title={can('attendance.oversee') ? 'لا توجد فصول للعام الحالي' : 'لا توجد فصول مسندة إليك'} />
        ) : (
          <Table caption="حالة رصد الفصول">
            <THead>
              <Tr>
                <Th>الفصل</Th>
                {periods.map((p) => <Th key={p}>{periodLabel(p)}</Th>)}
              </Tr>
            </THead>
            <TBody>
              {classes.data!.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-semibold whitespace-nowrap">فصل {c.name}</Td>
                  {periods.map((p) => {
                    const s = byKey.get(`${c.id}|${p}`);
                    const enrolled = counts.data?.get(c.id) ?? 0;
                    const marked = countOf(s?.attendance_records);
                    const state = sessionCompletion(enrolled, marked, s ? (s.status as 'draft' | 'submitted') : null);
                    return (
                      <Td key={p}>
                        <Link to={`/attendance/take?class=${c.id}&date=${date}&period=${p}`} className="inline-flex flex-wrap items-center gap-2 rounded-md hover:underline" aria-label={`فتح رصد فصل ${c.name} ${periodLabel(p)}`}>
                          <CompletionBadge state={state} />
                          {s && state !== 'submitted' && <span className="tabular text-xs text-fg-muted">{formatNumber(marked)}/{formatNumber(enrolled)}</span>}
                          {s?.submitted_late && <Badge tone="warning">متأخر</Badge>}
                        </Link>
                      </Td>
                    );
                  })}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="الجلسات السابقة"
          description="آخر ٦٠ يومًا"
          actions={
            <>
              <Select aria-label="تصفية حسب الفصل" className="h-9 w-36" value={histClass ?? ''} onChange={(e) => { setHistClass(e.target.value || null); setPage(1); }}>
                <option value="">كل الفصول</option>
                {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select aria-label="تصفية حسب الحالة" className="h-9 w-36" value={histStatus ?? ''} onChange={(e) => { setHistStatus(e.target.value || null); setPage(1); }}>
                <option value="">كل الحالات</option>
                <option value="submitted">معتمدة</option>
                <option value="draft">مسودة</option>
              </Select>
            </>
          }
        />
        {history.isPending ? (
          <LoadingState />
        ) : history.isError ? (
          <ErrorState error={history.error} onRetry={() => history.refetch()} />
        ) : history.data.rows.length === 0 ? (
          <EmptyState title="لا توجد جلسات مطابقة" />
        ) : (
          <>
            <Table caption="الجلسات السابقة">
              <THead><Tr><Th>التاريخ</Th><Th>الفصل</Th><Th>الجلسة</Th><Th>المرصودون</Th><Th>الحالة</Th><Th className="hidden md:table-cell">الراصد</Th></Tr></THead>
              <TBody>
                {history.data.rows.map((s) => (
                  <Tr key={s.id} className="hover:bg-surface-hover">
                    <Td className="whitespace-nowrap">
                      <Link to={`/attendance/take?class=${s.class_id}&date=${s.session_date}&period=${s.period}`} className="font-semibold text-link hover:underline">{formatDate(s.session_date)}</Link>
                    </Td>
                    <Td>{s.school_classes?.name}</Td>
                    <Td className="text-fg-muted">{periodLabel(s.period)}</Td>
                    <Td className="tabular">{formatNumber(countOf(s.attendance_records))}</Td>
                    <Td className="space-x-1 space-x-reverse whitespace-nowrap">
                      <CompletionBadge state={s.status === 'submitted' ? 'submitted' : 'in_progress'} />
                      {s.submitted_late && <Badge tone="warning">متأخر</Badge>}
                      {s.reopened_at && s.status === 'draft' && <Badge tone="info">أُعيد فتحها</Badge>}
                    </Td>
                    <Td className="hidden text-fg-muted md:table-cell">{s.taker?.full_name ?? '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE} total={history.data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
