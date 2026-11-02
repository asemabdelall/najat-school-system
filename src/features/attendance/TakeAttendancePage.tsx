import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { m } from 'motion/react';
import { spring } from '@/lib/motion';
import { AlertTriangle, ArrowLeft, CalendarX2, Check, CheckCheck, Clock, Copy, FileCheck2, History, Lock, RotateCcw, Save, Send, Unlock, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import { AttendanceBadge, CompletionBadge } from '@/components/ui/status-badges';
import { errorMessage } from '@/lib/errors';
import { addDays, formatDate, formatDateTime, formatNumber, formatWeekday, isSchoolDay, kuwaitToday, previousSchoolDay } from '@/lib/format';
import { useUnsavedChanges } from '@/lib/hooks';
import { useClasses, useCurrentYear, useSchoolSettings } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  ATTENDANCE_LABELS, ATTENDANCE_STATUSES, countMarks, periodLabel, sessionCompletion, sessionPeriod,
  type AttendanceMode, type AttendanceStatus,
} from '@/lib/domain/attendance';
import { useReopenSession, useRoster, useSaveAttendance, useSession, useSessionsForDate, type MarkEntry } from './api';
import { CompletionLegend, PeriodStrip } from './PeriodStrip';

const STATUS_STYLE: Record<AttendanceStatus, { icon: React.ElementType; on: string }> = {
  present: { icon: Check, on: 'border-success bg-success text-white dark:text-slate-950' },
  absent: { icon: X, on: 'border-danger bg-danger text-white dark:text-slate-950' },
  late: { icon: Clock, on: 'border-warning bg-warning text-white dark:text-slate-950' },
  excused: { icon: FileCheck2, on: 'border-info bg-info text-white dark:text-slate-950' },
};

/** Radio-group of the four statuses for one student; the highlight glides to the chosen status. */
function StatusPicker({ id, name, value, disabled, onChange }: { id: string; name: string; value: AttendanceStatus | null; disabled: boolean; onChange: (s: AttendanceStatus) => void }) {
  return (
    <div role="radiogroup" aria-label={`حالة ${name}`} className="inline-flex w-full gap-1 rounded-xl bg-surface-sunken p-1 sm:w-auto">
      {ATTENDANCE_STATUSES.map((s) => {
        const Icon = STATUS_STYLE[s].icon;
        const checked = value === s;
        return (
          <m.button
            key={s}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(s)}
            whileTap={disabled ? undefined : { scale: 0.94 }}
            className={cn(
              'relative inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none',
              checked ? 'text-white dark:text-slate-950' : 'text-fg-muted hover:bg-surface hover:text-fg',
            )}
          >
            {checked && (
              <m.span layoutId={`att-${id}`} transition={spring.indicator} className={cn('absolute inset-0 rounded-lg shadow-sm', STATUS_STYLE[s].on)} aria-hidden />
            )}
            <Icon className="relative size-3.5" aria-hidden />
            <span className="relative">{ATTENDANCE_LABELS[s]}</span>
          </m.button>
        );
      })}
    </div>
  );
}

export function TakeAttendancePage() {
  const { profile, isManager } = useAuth();
  const [params, setParams] = useSearchParams();
  const settings = useSchoolSettings();
  const year = useCurrentYear();
  const classes = useClasses(year.data?.id ?? undefined);
  const today = kuwaitToday();
  const mode = (settings.data?.attendance_mode ?? 'daily') as AttendanceMode;
  const backdate = settings.data?.teacher_backdate_days ?? 1;
  const minDate = isManager ? year.data?.starts_on : addDays(today, -backdate);

  const classId = params.get('class') ?? null;
  const date = params.get('date') ?? previousSchoolDay(today);
  const period = sessionPeriod(mode, params.get('period') ? Number(params.get('period')) : 1);

  const roster = useRoster(classId, date);
  const sessionQ = useSession(classId, date, period);
  const daySessions = useSessionsForDate(date);
  const periods = mode === 'daily' ? [0] : Array.from({ length: settings.data?.periods_per_day ?? 7 }, (_, i) => i + 1);
  const prevPeriod = mode === 'period' && period > 1 ? period - 1 : null;
  const prevQ = useSession(prevPeriod ? classId : null, date, prevPeriod ?? 0);
  const save = useSaveAttendance();
  const reopen = useReopenSession();

  const [marks, setMarks] = React.useState<Map<string, MarkEntry>>(new Map());
  const [saved, setSaved] = React.useState<Map<string, MarkEntry>>(new Map());
  const [filter, setFilter] = React.useState<'all' | 'unmarked' | 'absent' | 'late'>('all');
  const [correctionOpen, setCorrectionOpen] = React.useState(false);
  const [reopenOpen, setReopenOpen] = React.useState(false);

  // Reset local state from the server whenever the session data changes.
  const sessionData = sessionQ.data;
  React.useEffect(() => {
    if (!sessionData) return;
    const m = new Map<string, MarkEntry>();
    for (const r of sessionData.records) m.set(r.student_id, { status: r.status as AttendanceStatus, minutes_late: r.minutes_late, note: r.note ?? '' });
    setMarks(new Map(m));
    setSaved(m);
  }, [sessionData]);

  const session = sessionData?.session ?? null;
  const submitted = session?.status === 'submitted';
  const canCorrect = isManager || (session?.taken_by === profile?.id && date === today);
  const readOnly = submitted && !canCorrect;

  const students = React.useMemo(() => roster.data ?? [], [roster.data]);
  const changes = React.useMemo(() => {
    const out: { student_id: string; status: AttendanceStatus | null; minutes_late: number | null; note: string | null }[] = [];
    for (const s of students) {
      const cur = marks.get(s.student_id);
      const old = saved.get(s.student_id);
      if ((cur?.status ?? null) !== (old?.status ?? null) || (cur?.minutes_late ?? null) !== (old?.minutes_late ?? null) || (cur?.note ?? '') !== (old?.note ?? '')) {
        out.push({ student_id: s.student_id, status: cur?.status ?? null, minutes_late: cur?.status === 'late' ? (cur.minutes_late ?? null) : null, note: cur?.note?.trim() || null });
      }
    }
    return out;
  }, [students, marks, saved]);
  const dirty = changes.length > 0;
  const { blocker } = useUnsavedChanges(dirty);

  const counts = countMarks(students.map((s) => marks.get(s.student_id)?.status ?? null));
  const completion = sessionCompletion(students.length, counts.marked, session?.status === 'submitted' ? 'submitted' : session ? 'draft' : null);

  const setMark = (studentId: string, patch: Partial<MarkEntry>) =>
    setMarks((prev) => {
      const next = new Map(prev);
      const cur = next.get(studentId) ?? { status: null, minutes_late: null, note: '' };
      next.set(studentId, { ...cur, ...patch });
      return next;
    });

  // Copies the previous period's marks to students not yet marked in this period.
  const prevRecords = prevQ.data?.records ?? [];
  const copyFromPrevious = () => {
    const prev = new Map(prevRecords.map((r) => [r.student_id, r]));
    const next = new Map(marks);
    let n = 0;
    for (const st of students) {
      const r = prev.get(st.student_id);
      if (r && !next.get(st.student_id)?.status) {
        next.set(st.student_id, { status: r.status as AttendanceStatus, minutes_late: r.status === 'late' ? r.minutes_late : null, note: next.get(st.student_id)?.note ?? '' });
        n++;
      }
    }
    setMarks(next);
    toast.success(n ? `نُسخت حالة ${formatNumber(n)} طالب من ${periodLabel(prevPeriod!)}` : 'لا توجد حالات لنسخها');
  };

  const stateFor = (p: number) => {
    const sess = (daySessions.data ?? []).find((x) => x.class_id === classId && x.period === p);
    if (p === period && session) return completion;
    return sessionCompletion(students.length, sess?.attendance_records?.[0]?.count ?? 0, sess ? (sess.status as 'draft' | 'submitted') : null);
  };

  const markAllUnmarkedPresent = () =>
    setMarks((prev) => {
      const next = new Map(prev);
      for (const s of students) if (!next.get(s.student_id)?.status) next.set(s.student_id, { status: 'present', minutes_late: null, note: next.get(s.student_id)?.note ?? '' });
      return next;
    });

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next);
  };

  async function persist(submit: boolean, reason?: string) {
    if (!classId) return;
    // Submitting sends the full set so the server can verify completeness.
    const payload = submit
      ? students.map((s) => {
          const m = marks.get(s.student_id);
          return { student_id: s.student_id, status: m?.status ?? null, minutes_late: m?.status === 'late' ? (m.minutes_late ?? null) : null, note: m?.note?.trim() || null };
        }).filter((r) => r.status !== null || changes.some((c) => c.student_id === r.student_id))
      : changes;
    try {
      await save.mutateAsync({ classId, date, period, records: payload, submit, reason });
      await sessionQ.refetch();
      toast.success(submitted ? 'تم حفظ التصحيح وتوثيقه' : submit ? 'تم اعتماد الحضور' : `تم حفظ ${formatNumber(changes.length)} تغيير كمسودة`);
      setCorrectionOpen(false);
    } catch (e) {
      // The server applies the whole batch or nothing, so local edits stay intact for retry.
      toast.error(errorMessage(e), { duration: 8000 });
    }
  }

  const invalidDay = !isSchoolDay(date);
  const futureDay = date > today;
  const tooOld = !isManager && minDate !== undefined && date < minDate;
  const visible = students.filter((s) => {
    const st = marks.get(s.student_id)?.status ?? null;
    return filter === 'all' ? true : filter === 'unmarked' ? !st : st === filter;
  });
  const nextPeriod = mode === 'period' && period < periods.length ? period + 1 : null;
  const pct = students.length ? Math.round((counts.marked / students.length) * 100) : 0;
  const selectedClass = classes.data?.find((c) => c.id === classId);

  return (
    <>
      <PageHeader
        title="رصد الحضور"
        breadcrumbs={[{ label: 'الحضور والغياب', to: '/attendance' }, { label: 'رصد الحضور' }]}
        description={mode === 'daily' ? 'حضور يومي: جلسة واحدة لكل فصل يوميًا' : `حضور بالحصة: ${formatNumber(settings.data?.periods_per_day)} حصص يوميًا، ولكل حصة رصد مستقل`}
      />

      <Card className="no-print mb-4 overflow-hidden">
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,16rem)_minmax(10rem,13rem)_1fr]">
          <div>
            <label htmlFor="att-class" className="mb-1 block text-xs font-semibold text-fg-muted">الفصل</label>
            <Select id="att-class" value={classId ?? ''} onChange={(e) => updateParam('class', e.target.value)}>
              <option value="" disabled>اختر الفصل</option>
              {classes.data?.map((c) => <option key={c.id} value={c.id}>فصل {c.name}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="att-date" className="mb-1 block text-xs font-semibold text-fg-muted">التاريخ</label>
            <Input id="att-date" type="date" value={date} max={today} min={minDate} onChange={(e) => e.target.value && updateParam('date', e.target.value)} />
          </div>
          <div className="flex items-end">
            <p className="rounded-lg bg-surface-sunken px-3 py-2.5 text-sm font-semibold text-fg">
              {formatWeekday(date)} · {formatDate(date)}
            </p>
          </div>
        </div>
        {mode === 'period' && (
          <div className="space-y-3 border-t border-line bg-surface-sunken/40 p-4">
            <PeriodStrip periods={periods} value={period} stateFor={stateFor} onChange={(p) => updateParam('period', String(p))} />
            {classId && <CompletionLegend />}
          </div>
        )}
      </Card>

      {!classId ? (
        <Card><EmptyState icon={<CalendarX2 />} title="اختر الفصل للبدء" description="تظهر هنا قائمة الطلاب المسجلين في الفصل بتاريخ الجلسة." /></Card>
      ) : invalidDay || futureDay || tooOld ? (
        <Card>
          <EmptyState
            icon={<CalendarX2 />}
            title={futureDay ? 'لا يمكن رصد تاريخ مستقبلي' : invalidDay ? 'يوم عطلة أسبوعية' : 'انتهت مهلة الرصد لهذا اليوم'}
            description={tooOld ? `يمكن للمعلم الرصد حتى ${formatNumber(backdate)} يوم سابق. للتصحيح تواصل مع شؤون الطلبة.` : 'أيام الدراسة من الأحد إلى الخميس.'}
            action={<Button variant="secondary" onClick={() => updateParam('date', previousSchoolDay(today))}>آخر يوم دراسي</Button>}
          />
        </Card>
      ) : roster.isPending || sessionQ.isPending ? (
        <Card><LoadingState rows={10} /></Card>
      ) : roster.isError || sessionQ.isError ? (
        <Card><ErrorState error={roster.error ?? sessionQ.error} onRetry={() => { void roster.refetch(); void sessionQ.refetch(); }} /></Card>
      ) : students.length === 0 ? (
        <Card><EmptyState title="لا يوجد طلاب مسجلون في هذا الفصل بهذا التاريخ" /></Card>
      ) : (
        <>
          {submitted && (
            <div role="status" className={cn('mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm', canCorrect ? 'border-info-line bg-info-soft text-info' : 'border-neutral-line bg-neutral-soft text-neutral')}>
              <Lock className="size-4 shrink-0" aria-hidden />
              <span className="flex-1">
                الجلسة معتمدة بواسطة {session?.taker?.full_name ?? '—'} في {formatDateTime(session?.submitted_at)}
                {session?.submitted_late && ' (اعتماد متأخر)'}.{' '}
                {canCorrect ? 'أي تعديل يُحفظ كتصحيح موثق مع ذكر السبب.' : 'التصحيح متاح لشؤون الطلبة، أو للمعلم الراصد في اليوم نفسه.'}
              </span>
              {nextPeriod && !dirty && (
                <Button size="sm" onClick={() => updateParam('period', String(nextPeriod))}>{periodLabel(nextPeriod)} <ArrowLeft /></Button>
              )}
              {isManager && (
                <Button size="sm" variant="secondary" onClick={() => setReopenOpen(true)}><Unlock /> إعادة فتح للمعلم</Button>
              )}
            </div>
          )}
          {session?.reopened_at && !submitted && (
            <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft p-3 text-sm text-warning">
              <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden />
              أُعيد فتح الجلسة بواسطة {session.reopener?.full_name} — السبب: {session.reopen_reason}
            </div>
          )}

          <Card>
            <div className="sticky top-16 z-20 space-y-3 rounded-t-lg border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
              <div className="flex flex-wrap items-center gap-4">
                <div
                  className="relative grid size-14 shrink-0 place-items-center rounded-full"
                  style={{ background: `conic-gradient(var(--color-success) ${pct * 3.6}deg, var(--color-surface-sunken) 0deg)` }}
                  role="img"
                  aria-label={`تم رصد ${pct}٪`}
                >
                  <span className="tabular grid size-11 place-items-center rounded-full bg-surface text-sm font-bold">{formatNumber(pct)}٪</span>
                </div>
                <div className="min-w-0">
                  <p className="text-base font-bold text-fg-strong">فصل {selectedClass?.name} · {periodLabel(period)}</p>
                  <div className="mt-1"><CompletionBadge state={completion} /></div>
                </div>
                <div className="ms-auto flex flex-wrap items-center gap-2">
                  {!readOnly && prevPeriod && prevRecords.length > 0 && counts.unmarked > 0 && (
                    <Button size="sm" variant="secondary" onClick={copyFromPrevious}><Copy /> نسخ من {periodLabel(prevPeriod)}</Button>
                  )}
                  {!readOnly && counts.unmarked > 0 && (
                    <Button size="sm" variant="subtle" onClick={markAllUnmarkedPresent}><CheckCheck /> الباقون حاضرون</Button>
                  )}
                </div>
              </div>

              <div role="tablist" aria-label="تصفية الطلاب" className="flex flex-wrap gap-1.5">
                {([
                  ['all', 'الكل', students.length, 'bg-surface-sunken text-fg'],
                  ['unmarked', 'لم يُرصد', counts.unmarked, 'bg-surface-sunken text-fg'],
                  ['absent', ATTENDANCE_LABELS.absent, counts.absent, 'bg-danger-soft text-danger'],
                  ['late', ATTENDANCE_LABELS.late, counts.late, 'bg-warning-soft text-warning'],
                ] as const).map(([key, label, n, tone]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={filter === key}
                    onClick={() => setFilter(key)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-semibold transition-colors',
                      filter === key ? 'border-brand bg-brand text-on-brand' : 'border-line hover:border-line-strong',
                    )}
                  >
                    {label}
                    <span className={cn('tabular min-w-6 rounded-full px-1.5 text-center text-xs leading-5', filter === key ? 'bg-white/20 text-on-brand' : tone)}>{formatNumber(n)}</span>
                  </button>
                ))}
                <span className="ms-auto hidden items-center gap-3 text-[0.8125rem] text-fg-muted md:flex">
                  <span>{ATTENDANCE_LABELS.present}: <b className="tabular text-success">{formatNumber(counts.present)}</b></span>
                  <span>{ATTENDANCE_LABELS.excused}: <b className="tabular text-info">{formatNumber(counts.excused)}</b></span>
                </span>
              </div>
            </div>

            <ol className="divide-y divide-line" aria-label="قائمة طلاب الجلسة">
              {visible.map((s) => {
                const m = marks.get(s.student_id);
                const changed = changes.some((c) => c.student_id === s.student_id);
                const idx = students.indexOf(s) + 1;
                return (
                  <li key={s.student_id} className={cn('grid items-center gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[2.25rem_minmax(12rem,1fr)_auto_minmax(10rem,15rem)]', changed && 'bg-warning-soft/40')}>
                    <span className={cn('tabular hidden size-9 place-items-center rounded-full text-sm font-bold md:grid', m?.status ? 'bg-surface-sunken text-fg-muted' : 'border border-dashed border-line-strong text-fg-subtle')}>{formatNumber(idx)}</span>
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug">{s.full_name}</p>
                      <p className="flex items-center gap-2 text-xs text-fg-muted">
                        <span className="ltr tabular">{s.student_number}</span>
                        {!m?.status && <span className="font-semibold text-fg-subtle">· لم يُرصد</span>}
                        {changed && <span className="font-semibold text-warning">· غير محفوظ</span>}
                      </p>
                    </div>
                    <StatusPicker id={s.student_id} name={s.full_name} value={m?.status ?? null} disabled={readOnly} onChange={(st) => setMark(s.student_id, { status: st, minutes_late: st === 'late' ? (m?.minutes_late ?? 5) : null })} />
                    <div className="flex gap-2">
                      {m?.status === 'late' && (
                        <label className="flex shrink-0 items-center gap-1 text-xs text-fg-muted">
                          <Input type="number" min={1} max={300} className="h-9 w-16 px-2 text-center" aria-label={`دقائق تأخر ${s.full_name}`} disabled={readOnly} value={m.minutes_late ?? ''} onChange={(e) => setMark(s.student_id, { minutes_late: e.target.value ? Math.min(300, Math.max(1, Number(e.target.value))) : null })} />
                          د
                        </label>
                      )}
                      <Input className="h-9 text-xs" placeholder="ملاحظة (اختياري)" aria-label={`ملاحظة ${s.full_name}`} maxLength={500} disabled={readOnly} value={m?.note ?? ''} onChange={(e) => setMark(s.student_id, { note: e.target.value })} />
                    </div>
                  </li>
                );
              })}
              {visible.length === 0 && <li><EmptyState icon={<CheckCheck />} title={filter === 'unmarked' ? 'تم رصد جميع الطلاب' : 'لا يوجد طلاب بهذه الحالة'} className="py-8" /></li>}
            </ol>

            {!readOnly && (
              <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-b-lg border-t border-line bg-surface/95 px-4 py-3 backdrop-blur max-sm:bottom-[calc(4rem+env(safe-area-inset-bottom))]">
                <p className="hidden text-[0.8125rem] text-fg-muted sm:block" aria-live="polite">
                  {dirty ? `${formatNumber(changes.length)} تغيير غير محفوظ` : 'لا توجد تغييرات غير محفوظة'}
                  {!submitted && counts.unmarked > 0 && ` · يتطلب الاعتماد رصد جميع الطلاب (${formatNumber(counts.unmarked)} متبقٍ)`}
                </p>
                <div className="flex w-full gap-2 sm:ms-auto sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none">
                  {submitted ? (
                    <Button disabled={!dirty} onClick={() => setCorrectionOpen(true)}><Save /> حفظ التصحيح</Button>
                  ) : (
                    <>
                      <Button variant="secondary" disabled={!dirty} loading={save.isPending && !save.variables?.submit} onClick={() => persist(false)}><Save /> حفظ كمسودة</Button>
                      <Button disabled={counts.unmarked > 0} loading={save.isPending && save.variables?.submit} onClick={() => persist(true)}><Send className="rtl:-scale-x-100" /> اعتماد {periodLabel(period)}</Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>

          {sessionData && sessionData.corrections.length > 0 && (
            <Card className="mt-4">
              <CardHeader icon={<History />} title="سجل التصحيحات" description="كل تعديل بعد الاعتماد موثق بالسبب والمستخدم والوقت." />
              <ul className="divide-y divide-line text-sm">
                {sessionData.corrections.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 px-5 py-2.5">
                    <span className="font-semibold">{c.students?.full_name}</span>
                    <AttendanceBadge status={(c.old_status as AttendanceStatus) ?? null} />
                    <span aria-label="إلى">←</span>
                    <AttendanceBadge status={c.new_status as AttendanceStatus} />
                    <span className="text-fg-muted">— {c.reason}</span>
                    <span className="ms-auto text-xs text-fg-subtle">{c.corrector?.full_name} · {formatDateTime(c.corrected_at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-fg-muted">
        <AlertTriangle className="size-3.5" aria-hidden /> الطالب غير المرصود لا يُحتسب غائبًا. <Link to="/attendance/excuses" className="text-link hover:underline">إدارة أعذار الغياب</Link>
      </p>

      <ConfirmDialog
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        title="حفظ تصحيح على جلسة معتمدة"
        description={`سيتم تعديل ${formatNumber(changes.length)} سجل وتوثيق التصحيح في سجل الجلسة وسجل التدقيق.`}
        confirmLabel="حفظ التصحيح"
        reasonLabel="سبب التصحيح"
        loading={save.isPending}
        onConfirm={(reason) => persist(false, reason)}
      />
      <ConfirmDialog
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title="إعادة فتح الجلسة"
        description="ستعود الجلسة مسودة ليستكملها المعلم ثم يعيد اعتمادها، وسيصله إشعار بذلك."
        confirmLabel="إعادة الفتح"
        reasonLabel="سبب إعادة الفتح"
        loading={reopen.isPending}
        onConfirm={async (reason) => {
          try {
            await reopen.mutateAsync({ sessionId: session!.id, reason });
            await sessionQ.refetch();
            toast.success('أُعيد فتح الجلسة');
            setReopenOpen(false);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <UnsavedChangesDialog blocker={blocker} />
    </>
  );
}
