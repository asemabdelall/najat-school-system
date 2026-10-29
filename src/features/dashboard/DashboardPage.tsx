import * as React from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock, FileClock, Flag, GraduationCap, ListChecks, Percent, School, UserX } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { CompletionBadge, DueBadge, FollowUpStatusBadge, IncidentStatusBadge } from '@/components/ui/status-badges';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import { addDays, formatDate, formatNumber, formatPercent, formatWeekday, isSchoolDay, kuwaitToday, previousSchoolDay, startOfMonth } from '@/lib/format';
import { useClasses, useCurrentYear, useSchoolSettings } from '@/lib/queries';
import { periodLabel, sessionCompletion, type AttendanceMode } from '@/lib/domain/attendance';
import { dueState, type FollowUpStatus } from '@/lib/domain/followups';
import type { IncidentStatus } from '@/lib/domain/behavior';
import { cn } from '@/lib/utils';
import { useEnrollmentCounts } from '@/features/classes/api';
import { AbsenceChart, RateChart, type TrendRow } from './AttendanceCharts';
import { Stagger, StaggerItem } from '@/components/motion/Stagger';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';

type Overview = {
  active_students: number; classes: number; active_enrollments: number;
  present: number; late: number; absent: number; excused: number; attendance_rate: number | null;
  sessions_total: number; sessions_submitted: number;
  pending_incidents: number; open_follow_ups: number; overdue_follow_ups: number; pending_excuses: number;
};

type RangeKey = 'today' | 'week' | 'month' | 'year';

function useRange(key: RangeKey, yearStart?: string) {
  const today = kuwaitToday();
  const last = previousSchoolDay(today);
  switch (key) {
    case 'today': return { from: last, to: last, label: last === today ? 'اليوم' : `آخر يوم دراسي (${formatWeekday(last)})` };
    case 'week': return { from: addDays(today, -6), to: today, label: 'آخر ٧ أيام' };
    case 'month': return { from: startOfMonth(today), to: today, label: 'الشهر الحالي' };
    case 'year': return { from: yearStart ?? startOfMonth(today), to: today, label: 'منذ بداية العام' };
  }
}

function RangePicker({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  const opts: [RangeKey, string][] = [['today', 'اليوم'], ['week', '٧ أيام'], ['month', 'الشهر'], ['year', 'العام']];
  return (
    <div role="radiogroup" aria-label="الفترة الزمنية" className="inline-flex rounded-md border border-line bg-surface-sunken p-0.5">
      {opts.map(([k, l]) => (
        <button key={k} role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={cn('h-8 rounded px-3 text-[0.8125rem] font-semibold text-fg-muted', value === k && 'bg-surface text-brand shadow-sm dark:text-link')}>
          {l}
        </button>
      ))}
    </div>
  );
}

function ManagerDashboard() {
  const year = useCurrentYear();
  const [rangeKey, setRangeKey] = React.useState<RangeKey>('week');
  const range = useRange(rangeKey, year.data?.starts_on);
  const trendRange = rangeKey === 'today' ? { from: addDays(range.to, -13), to: range.to } : range;
  const today = kuwaitToday();

  const overview = useQuery({
    queryKey: ['dashboard', 'overview', range.from, range.to],
    queryFn: async () => unwrap(await supabase.rpc('dashboard_overview', { p_from: range.from, p_to: range.to })) as unknown as Overview,
  });
  const trend = useQuery({
    queryKey: ['dashboard', 'trend', trendRange.from, trendRange.to],
    queryFn: async () => unwrap(await supabase.rpc('attendance_trend', { p_from: trendRange.from, p_to: trendRange.to })) as TrendRow[],
  });
  const incidents = useQuery({
    queryKey: ['dashboard', 'pending-incidents'],
    queryFn: async () =>
      unwrap(await supabase.from('behavior_incidents').select('id, incident_date, status, behavior_categories(name), incident_students(count)').in('status', ['submitted', 'under_review']).order('created_at', { ascending: false }).limit(5)),
  });
  const overdue = useQuery({
    queryKey: ['dashboard', 'overdue'],
    queryFn: async () =>
      unwrap(await supabase.from('follow_up_tasks').select('id, title, status, due_date, assignee:profiles!follow_up_tasks_assigned_to_fkey(full_name)').in('status', ['open', 'in_progress']).lt('due_date', today).order('due_date').limit(5)),
  });

  const o = overview.data;
  const loading = overview.isPending;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">مؤشرات الحضور للفترة: <span className="font-bold text-fg">{range.label}</span> ({formatDate(range.from)}{range.from !== range.to && ` – ${formatDate(range.to)}`})</p>
        <RangePicker value={rangeKey} onChange={setRangeKey} />
      </div>
      {overview.isError ? (
        <Card className="mb-5"><ErrorState error={overview.error} onRetry={() => overview.refetch()} /></Card>
      ) : (
        <Stagger className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard loading={loading} label="الطلاب المنتظمون" value={<AnimatedNumber value={o?.active_students} />} hint={`${formatNumber(o?.active_enrollments)} تسجيل في ${formatNumber(o?.classes)} فصلًا`} icon={<GraduationCap />} to="/students" />
          <StatCard loading={loading} label="نسبة الحضور" value={<AnimatedNumber value={o?.attendance_rate} format={formatPercent} />} hint={`من ${formatNumber((o?.present ?? 0) + (o?.late ?? 0) + (o?.absent ?? 0) + (o?.excused ?? 0))} سجل مرصود`} icon={<Percent />} tone="success" to="/reports" />
          <StatCard loading={loading} label="حالات الغياب" value={<AnimatedNumber value={o?.absent} />} hint={`${formatNumber(o?.excused)} غياب بعذر · ${formatNumber(o?.late)} تأخر`} icon={<UserX />} tone="danger" to="/reports" />
          <StatCard loading={loading} label="الجلسات المعتمدة" value={`${formatNumber(o?.sessions_submitted)} / ${formatNumber(o?.sessions_total)}`} hint="الجلسات التي بدأ رصدها في الفترة" icon={<CalendarCheck2 />} tone="info" to="/attendance" />
          <StatCard loading={loading} label="بلاغات بانتظار القرار" value={<AnimatedNumber value={o?.pending_incidents} />} icon={<Flag />} tone="warning" to="/behavior?status=open" />
          <StatCard loading={loading} label="مهام متابعة نشطة" value={<AnimatedNumber value={o?.open_follow_ups} />} icon={<ListChecks />} to="/follow-ups" />
          <StatCard loading={loading} label="مهام متأخرة" value={<AnimatedNumber value={o?.overdue_follow_ups} />} hint={o?.overdue_follow_ups ? 'تجاوزت تاريخ الاستحقاق' : 'لا توجد مهام متأخرة'} icon={<AlertTriangle />} tone={o?.overdue_follow_ups ? 'danger' : 'success'} to="/follow-ups?overdue=1&status=active" />
          <StatCard loading={loading} label="أعذار بانتظار المراجعة" value={<AnimatedNumber value={o?.pending_excuses} />} icon={<FileClock />} tone="info" to="/attendance/excuses" />
        </Stagger>
      )}

      <Stagger delay={0.15} className="mb-5 grid gap-5 xl:grid-cols-2">
        <StaggerItem>
        <Card>
          <CardHeader title="نسبة الحضور اليومية" description="(حاضر + متأخر) ÷ المرصود. لا تُحتسب الأيام أو الطلاب غير المرصودين." />
          <CardContent>
            {trend.isPending ? <LoadingState rows={3} className="p-0" /> : trend.isError ? <ErrorState error={trend.error} onRetry={() => trend.refetch()} /> : trend.data.length === 0 ? <EmptyState title="لا توجد بيانات حضور مرصودة في الفترة" /> : <RateChart data={trend.data} />}
          </CardContent>
        </Card>
        </StaggerItem>
        <StaggerItem>
        <Card>
          <CardHeader title="الغياب والتأخر اليومي" description="عدد السجلات غير الحاضرة لكل يوم" />
          <CardContent>
            {trend.isPending ? <LoadingState rows={3} className="p-0" /> : trend.isError ? <ErrorState error={trend.error} onRetry={() => trend.refetch()} /> : trend.data.length === 0 ? <EmptyState title="لا توجد بيانات" /> : <AbsenceChart data={trend.data} />}
          </CardContent>
        </Card>
        </StaggerItem>
      </Stagger>

      <Stagger delay={0.25} className="grid gap-5 xl:grid-cols-2">
        <StaggerItem>
        <Card>
          <CardHeader icon={<Flag />} title="بلاغات تنتظر المراجعة" actions={<Button asChild variant="ghost" size="sm"><Link to="/behavior?status=open">عرض الكل</Link></Button>} />
          {incidents.isPending ? <LoadingState rows={3} /> : incidents.isError ? <ErrorState error={incidents.error} /> : incidents.data.length === 0 ? <EmptyState icon={<CheckCircle2 />} title="لا توجد بلاغات معلقة" className="py-8" /> : (
            <ul className="divide-y divide-line">
              {incidents.data.map((i) => (
                <li key={i.id}>
                  <Link to={`/behavior/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{i.behavior_categories?.name}</span>
                      <span className="text-xs text-fg-muted">{formatDate(i.incident_date)} · {formatNumber(i.incident_students[0]?.count ?? 0)} طالب</span>
                    </span>
                    <IncidentStatusBadge status={i.status as IncidentStatus} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </StaggerItem>
        <StaggerItem>
        <Card>
          <CardHeader icon={<AlertTriangle />} title="مهام متابعة متأخرة" actions={<Button asChild variant="ghost" size="sm"><Link to="/follow-ups?overdue=1&status=active">عرض الكل</Link></Button>} />
          {overdue.isPending ? <LoadingState rows={3} /> : overdue.isError ? <ErrorState error={overdue.error} /> : overdue.data.length === 0 ? <EmptyState icon={<CheckCircle2 />} title="لا توجد مهام متأخرة" className="py-8" /> : (
            <ul className="divide-y divide-line">
              {overdue.data.map((t) => (
                <li key={t.id}>
                  <Link to={`/follow-ups/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{t.title}</span>
                      <span className="text-xs text-fg-muted">{t.assignee?.full_name}</span>
                    </span>
                    <DueBadge state={dueState(t.status as FollowUpStatus, t.due_date, today)} dueDate={t.due_date} today={today} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </StaggerItem>
      </Stagger>
    </>
  );
}

function TeacherDashboard() {
  const { profile } = useAuth();
  const today = kuwaitToday();
  const day = previousSchoolDay(today);
  const settings = useSchoolSettings();
  const mode = (settings.data?.attendance_mode ?? 'daily') as AttendanceMode;
  const periods = mode === 'daily' ? [0] : Array.from({ length: settings.data?.periods_per_day ?? 7 }, (_, i) => i + 1);
  const year = useCurrentYear();
  const classes = useClasses(year.data?.id ?? undefined);
  const counts = useEnrollmentCounts(year.data?.id ?? undefined);
  const sessions = useQuery({
    queryKey: ['dashboard', 'teacher-sessions', day],
    queryFn: async () => unwrap(await supabase.from('attendance_sessions').select('class_id, period, status, attendance_records(count)').eq('session_date', day)),
  });
  const tasks = useQuery({
    queryKey: ['dashboard', 'teacher-tasks', profile?.id],
    queryFn: async () =>
      unwrap(await supabase.from('follow_up_tasks').select('id, title, status, due_date, students(full_name)').eq('assigned_to', profile!.id).in('status', ['open', 'in_progress']).order('due_date', { nullsFirst: false }).limit(8)),
    enabled: Boolean(profile),
  });
  const myIncidents = useQuery({
    queryKey: ['dashboard', 'teacher-incidents'],
    queryFn: async () => unwrap(await supabase.from('behavior_incidents').select('id, incident_date, status, behavior_categories(name)').order('created_at', { ascending: false }).limit(5)),
  });

  const byKey = new Map((sessions.data ?? []).map((s) => [`${s.class_id}|${s.period}`, s]));
  const pendingSlots = (classes.data ?? []).reduce((n, c) => n + periods.filter((p) => byKey.get(`${c.id}|${p}`)?.status !== 'submitted').length, 0);
  const totalStudents = (classes.data ?? []).reduce((n, c) => n + (counts.data?.get(c.id) ?? 0), 0);
  const overdue = (tasks.data ?? []).filter((t) => dueState(t.status as FollowUpStatus, t.due_date, today) === 'overdue').length;

  return (
    <>
      <Stagger className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard loading={classes.isPending} label="فصولي" value={<AnimatedNumber value={classes.data?.length} />} hint={`${formatNumber(totalStudents)} طالب`} icon={<School />} to="/classes" />
        <StatCard loading={sessions.isPending} label="جلسات بانتظار الاعتماد" value={<AnimatedNumber value={pendingSlots} />} hint={isSchoolDay(today) ? 'لليوم' : `لـ ${formatWeekday(day)}`} icon={<Clock />} tone={pendingSlots ? 'warning' : 'success'} to="/attendance" />
        <StatCard loading={tasks.isPending} label="مهامي النشطة" value={<AnimatedNumber value={tasks.data?.length} />} icon={<ListChecks />} to="/follow-ups" />
        <StatCard loading={tasks.isPending} label="مهام متأخرة" value={<AnimatedNumber value={overdue} />} icon={<AlertTriangle />} tone={overdue ? 'danger' : 'success'} to="/follow-ups?overdue=1" />
      </Stagger>
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader icon={<CalendarCheck2 />} title={`رصد ${isSchoolDay(today) ? 'اليوم' : formatWeekday(day)}`} description={formatDate(day)} />
          {classes.isPending || sessions.isPending ? <LoadingState rows={4} /> : (classes.data ?? []).length === 0 ? (
            <EmptyState icon={<School />} title="لا توجد فصول مسندة إليك" description="تواصل مع شؤون الطلبة لإسناد فصولك." />
          ) : (
            <ul className="divide-y divide-line">
              {classes.data!.flatMap((c) => periods.map((p) => {
                const s = byKey.get(`${c.id}|${p}`);
                const state = sessionCompletion(counts.data?.get(c.id) ?? 0, s?.attendance_records[0]?.count ?? 0, s ? (s.status as 'draft' | 'submitted') : null);
                return (
                  <li key={`${c.id}-${p}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="font-semibold">فصل {c.name}</p>
                      <p className="text-xs text-fg-muted">{periodLabel(p)} · {formatNumber(counts.data?.get(c.id) ?? 0)} طالب</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CompletionBadge state={state} />
                      <Button asChild size="sm" variant={state === 'submitted' ? 'secondary' : 'primary'}>
                        <Link to={`/attendance/take?class=${c.id}&date=${day}&period=${p}`}>{state === 'submitted' ? 'عرض' : state === 'not_started' ? 'ابدأ الرصد' : 'متابعة الرصد'}</Link>
                      </Button>
                    </div>
                  </li>
                );
              }))}
            </ul>
          )}
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader icon={<ListChecks />} title="مهامي" actions={<Button asChild variant="ghost" size="sm"><Link to="/follow-ups">الكل</Link></Button>} />
            {tasks.isPending ? <LoadingState rows={3} /> : (tasks.data ?? []).length === 0 ? <EmptyState icon={<CheckCircle2 />} title="لا توجد مهام نشطة" className="py-8" /> : (
              <ul className="divide-y divide-line">
                {tasks.data!.map((t) => (
                  <li key={t.id}>
                    <Link to={`/follow-ups/${t.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{t.title}</span>
                        <span className="text-xs text-fg-muted">{t.students?.full_name ?? '—'} · {formatDate(t.due_date)}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1"><FollowUpStatusBadge status={t.status as FollowUpStatus} /><DueBadge state={dueState(t.status as FollowUpStatus, t.due_date, today)} dueDate={t.due_date} today={today} /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader icon={<Flag />} title="آخر بلاغاتي" actions={<Button asChild variant="ghost" size="sm"><Link to="/behavior/new">رفع بلاغ</Link></Button>} />
            {myIncidents.isPending ? <LoadingState rows={2} /> : (myIncidents.data ?? []).length === 0 ? <EmptyState title="لم ترفع أي بلاغ" className="py-8" /> : (
              <ul className="divide-y divide-line">
                {myIncidents.data!.map((i) => (
                  <li key={i.id}><Link to={`/behavior/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-hover"><span className="text-sm"><span className="font-semibold">{i.behavior_categories?.name}</span> <span className="text-xs text-fg-muted">· {formatDate(i.incident_date)}</span></span><IncidentStatusBadge status={i.status as IncidentStatus} /></Link></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

export function DashboardPage() {
  const { isManager, profile } = useAuth();
  const today = kuwaitToday();
  return (
    <>
      <PageHeader
        title={`مرحبًا، ${profile?.full_name.replace(/\s*\(.*\)$/, '') ?? ''}`}
        description={`${formatWeekday(today)} ${formatDate(today)}`}
        actions={
          <>
            <Button asChild variant="secondary"><Link to="/behavior/new"><Flag /> رفع بلاغ</Link></Button>
            <Button asChild><Link to="/attendance/take"><CalendarCheck2 /> رصد الحضور</Link></Button>
          </>
        }
      />
      {isManager ? <ManagerDashboard /> : <TeacherDashboard />}
    </>
  );
}
