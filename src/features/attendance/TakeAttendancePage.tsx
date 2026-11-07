import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { m } from 'motion/react';
import { AlertTriangle, ArrowLeft, CalendarX2, Check, CheckCheck, Clock, Copy, FileCheck2, History, Lock, MessageSquarePlus, RotateCcw, Save, Send, Unlock, X } from 'lucide-react';
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

const STATUS_STYLE: Record<AttendanceStatus, { icon: React.ElementType; short: string; on: string; edge: string; tint: string }> = {
  present: { icon: Check, short: 'حاضر', on: 'bg-success text-white shadow-[0_6px_14px_-6px_var(--color-success)] dark:text-slate-950', edge: 'border-s-success', tint: '' },
  absent: { icon: X, short: 'غائب', on: 'bg-[var(--chart-absent)] text-white shadow-[0_6px_14px_-6px_var(--chart-absent)]', edge: 'border-s-[var(--chart-absent)]', tint: 'bg-danger-soft/50' },
  late: { icon: Clock, short: 'متأخر', on: 'bg-[var(--chart-late)] text-white shadow-[0_6px_14px_-6px_var(--chart-late)]', edge: 'border-s-[var(--chart-late)]', tint: 'bg-warning-soft/50' },
  excused: { icon: FileCheck2, short: 'بعذر', on: 'bg-[var(--chart-excused)] text-white shadow-[0_6px_14px_-6px_var(--chart-excused)]', edge: 'border-s-[var(--chart-excused)]', tint: 'bg-info-soft/50' },
};

/** Four equal, thumb-sized buttons (icon above a short word). */
function StatusPicker({ name, value, disabled, onChange }: { name: string; value: AttendanceStatus | null; disabled: boolean; onChange: (s: AttendanceStatus) => void }) {
  return (
    <div role="radiogroup" aria-label={`حالة ${name}`} className="grid w-full grid-cols-4 gap-2 md:w-[23rem]">
      {ATTENDANCE_STATUSES.map((s) => {
        const st = STATUS_STYLE[s];
        const checked = value === s;
        return (
          <m.button
            key={s}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={ATTENDANCE_LABELS[s]}
            disabled={disabled}
            onClick={() => onChange(s)}
            whileTap={disabled ? undefined : { scale: 0.92 }}
            animate={checked ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={{ duration: 0.22 }}
            className={cn(
              'flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-sm font-bold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
              checked ? st.on : 'border border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
            )}
          >
            <st.icon className="size-5" strokeWidth={checked ? 3 : 2.25} aria-hidden />
            <span className="leading-none">{st.short}</span>
          </m.button>
        );
      })}
    </div>
  );
}

/** − 5 + stepper for minutes late. */
function MinutesStepper({ value, disabled, label, onChange }: { value: number | null; disabled: boolean; label: string; onChange: (v: number) => void }) {
  const v = value ?? 5;
  const set = (n: number) => onChange(Math.min(300, Math.max(1, n)));
  return (
    <div className="flex items-center gap-2 text-sm font-bold text-warning">
      <Clock className="size-4" aria-hidden />
      <span>دقائق التأخر</span>
      <div className="flex items-center rounded-lg border border-warning-line bg-surface">
        <button type="button" className="grid size-9 place-items-center text-lg disabled:opacity-40" disabled={disabled || v <= 1} onClick={() => set(v - 5 < 1 ? 1 : v - 5)} aria-label="إنقاص">−</button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={300}
          aria-label={label}
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => e.target.value && set(Number(e.target.value))}
          className="tabular h-9 w-12 bg-transparent text-center text-base text-fg outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" className="grid size-9 place-items-center text-lg disabled:opacity-40" disabled={disabled || v >= 300} onClick={() => set(v + 5)} aria-label="زيادة">+</button>
      </div>
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
  const [filter, setFilter] = React.useState<'all' | 'unmarked' | AttendanceStatus>('all');
  const [openNotes, setOpenNotes] = React.useState<Set<string>>(new Set());
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
    setOpenNotes(new Set());
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
      />

      <Card className="no-print mb-4 overflow-hidden">
        <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-5 lg:grid-cols-[minmax(13rem,18rem)_minmax(11rem,14rem)_1fr]">
          <div>
            <label htmlFor="att-class" className="mb-1.5 block text-sm font-bold text-fg-strong">الفصل</label>
            <Select id="att-class" value={classId ?? ''} onChange={(e) => updateParam('class', e.target.value)}>
              <option value="" disabled>اختر الفصل</option>
              {classes.data?.map((c) => <option key={c.id} value={c.id}>فصل {c.name}</option>)}
            </Select>
          </div>
          <div>
            <label htmlFor="att-date" className="mb-1.5 block text-sm font-bold text-fg-strong">التاريخ</label>
            <Input id="att-date" type="date" value={date} max={today} min={minDate} onChange={(e) => e.target.value && updateParam('date', e.target.value)} />
          </div>
          <p className="col-span-2 self-end text-sm font-semibold text-fg-muted lg:col-span-1 lg:pb-2.5">
            {formatWeekday(date)} · {formatDate(date)}
          </p>
        </div>
        {mode === 'period' && (
          <div className="border-t border-line bg-surface-sunken/40 px-4 py-3 sm:px-5">
            <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5 [&>div]:flex-nowrap">
              <PeriodStrip periods={periods} value={period} stateFor={stateFor} onChange={(p) => updateParam('period', String(p))} />
            </div>
            {classId && <div className="mt-2 hidden md:block"><CompletionLegend /></div>}
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

          <Card className="overflow-visible">
            <div className="sticky top-16 z-20 rounded-t-lg border-b border-line bg-surface/95 px-4 pb-3 pt-4 backdrop-blur sm:top-[4.5rem] sm:px-5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="text-base font-extrabold text-fg-strong">فصل {selectedClass?.name} · {periodLabel(period)}</p>
                    <CompletionBadge state={completion} />
                  </div>
                  <p className="mt-1 text-sm text-fg-muted" aria-live="polite">
                    تم رصد <b className="tabular text-fg-strong">{formatNumber(counts.marked)}</b> من <span className="tabular">{formatNumber(students.length)}</span>
                    {counts.unmarked > 0 && <> · متبقٍ <b className="tabular text-warning">{formatNumber(counts.unmarked)}</b></>}
                  </p>
                </div>
                {!readOnly && counts.unmarked > 0 && (
                  <Button size="md" variant="accent" onClick={markAllUnmarkedPresent} className="shrink-0">
                    <CheckCheck /> <span className="sm:hidden">الكل حاضر</span><span className="hidden sm:inline">الباقون حاضرون</span>
                  </Button>
                )}
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                <m.div className="h-full rounded-full [background:var(--brand-gradient)]" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
              </div>

              <div role="tablist" aria-label="تصفية الطلاب" className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:-mx-5 sm:px-5">
                {([
                  ['all', 'الكل', students.length, 'bg-surface-sunken text-fg'],
                  ['unmarked', 'لم يُرصد', counts.unmarked, 'bg-surface-sunken text-fg'],
                  ['present', 'حاضر', counts.present, 'bg-success-soft text-success'],
                  ['absent', 'غائب', counts.absent, 'bg-danger-soft text-danger'],
                  ['late', 'متأخر', counts.late, 'bg-warning-soft text-warning'],
                  ['excused', 'بعذر', counts.excused, 'bg-info-soft text-info'],
                ] as const).map(([key, label, n, tone]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={filter === key}
                    onClick={() => setFilter(key)}
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold transition-colors',
                      filter === key ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-fg-muted hover:border-line-strong',
                    )}
                  >
                    {label}
                    <span className={cn('tabular min-w-6 rounded-full px-1.5 text-center text-xs leading-5', filter === key ? 'bg-white/20 text-on-brand' : tone)}>{formatNumber(n)}</span>
                  </button>
                ))}
              </div>
              {!readOnly && prevPeriod && prevRecords.length > 0 && counts.unmarked > 0 && (
                <button type="button" onClick={copyFromPrevious} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-link hover:underline">
                  <Copy className="size-4" aria-hidden /> نسخ الحالات من {periodLabel(prevPeriod)}
                </button>
              )}
            </div>

            <ol className="divide-y divide-line" aria-label="قائمة طلاب الجلسة">
              {visible.map((s) => {
                const m = marks.get(s.student_id);
                const st = m?.status ?? null;
                const changed = changes.some((c) => c.student_id === s.student_id);
                const idx = students.indexOf(s) + 1;
                const noteOpen = openNotes.has(s.student_id) || Boolean(m?.note);
                return (
                  <li
                    key={s.student_id}
                    className={cn(
                      'border-s-4 px-4 py-3.5 transition-colors sm:px-5',
                      st ? STATUS_STYLE[st].edge : 'border-s-transparent',
                      st && STATUS_STYLE[st].tint,
                    )}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className={cn('tabular grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold', st ? 'bg-surface text-fg-muted ring-1 ring-line' : 'border border-dashed border-line-strong text-fg-subtle')}>
                          {formatNumber(idx)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-bold leading-snug text-fg-strong">{s.full_name}</p>
                          <p className="flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                            <span className="ltr tabular">{s.student_number}</span>
                            {changed && <span className="font-bold text-warning">· غير محفوظ</span>}
                          </p>
                        </div>
                        {!readOnly && !noteOpen && (
                          <button
                            type="button"
                            onClick={() => setOpenNotes((prev) => new Set(prev).add(s.student_id))}
                            className="grid size-9 shrink-0 place-items-center rounded-full text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg md:order-last"
                            aria-label={`إضافة ملاحظة لـ ${s.full_name}`}
                            title="إضافة ملاحظة"
                          >
                            <MessageSquarePlus className="size-[1.15rem]" aria-hidden />
                          </button>
                        )}
                      </div>
                      <StatusPicker name={s.full_name} value={st} disabled={readOnly} onChange={(v) => setMark(s.student_id, { status: v, minutes_late: v === 'late' ? (m?.minutes_late ?? 5) : null })} />
                    </div>
                    {(st === 'late' || noteOpen) && (
                      <div className="mt-3 flex flex-wrap items-center gap-3 md:ps-12">
                        {st === 'late' && (
                          <MinutesStepper value={m?.minutes_late ?? null} disabled={readOnly} label={`دقائق تأخر ${s.full_name}`} onChange={(v) => setMark(s.student_id, { minutes_late: v })} />
                        )}
                        {noteOpen && (
                          <Input
                            className="h-10 min-w-0 flex-1 basis-56 text-sm"
                            placeholder="ملاحظة (اختياري)"
                            aria-label={`ملاحظة ${s.full_name}`}
                            maxLength={500}
                            disabled={readOnly}
                            autoFocus={openNotes.has(s.student_id) && !m?.note}
                            value={m?.note ?? ''}
                            onChange={(e) => setMark(s.student_id, { note: e.target.value })}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
              {visible.length === 0 && <li><EmptyState icon={<CheckCheck />} title={filter === 'unmarked' ? 'تم رصد جميع الطلاب' : 'لا يوجد طلاب بهذه الحالة'} className="py-8" /></li>}
            </ol>

            {!readOnly && (
              <div className="sticky bottom-0 z-20 rounded-b-lg border-t border-line bg-surface/95 px-4 py-3 shadow-[0_-8px_20px_-14px_rgb(15_23_42/0.35)] backdrop-blur max-sm:bottom-[calc(4.25rem+env(safe-area-inset-bottom))] sm:px-5">
                <div className="flex items-center gap-2 sm:gap-3">
                  <p className="hidden text-sm text-fg-muted lg:block" aria-live="polite">
                    {dirty ? `${formatNumber(changes.length)} تغيير غير محفوظ` : 'لا توجد تغييرات غير محفوظة'}
                  </p>
                  {submitted ? (
                    <Button className="flex-1 lg:ms-auto lg:flex-none" disabled={!dirty} onClick={() => setCorrectionOpen(true)}><Save /> حفظ التصحيح</Button>
                  ) : (
                    <>
                      <Button variant="secondary" className="lg:ms-auto" disabled={!dirty} loading={save.isPending && !save.variables?.submit} onClick={() => persist(false)} aria-label="حفظ كمسودة">
                        <Save /> <span className="hidden sm:inline">حفظ كمسودة</span><span className="sm:hidden">حفظ</span>
                      </Button>
                      <Button className="flex-1 lg:flex-none" disabled={counts.unmarked > 0} loading={save.isPending && save.variables?.submit} onClick={() => persist(true)}>
                        <Send className="rtl:-scale-x-100" />
                        {counts.unmarked > 0 ? `متبقٍ ${formatNumber(counts.unmarked)} للاعتماد` : `اعتماد ${periodLabel(period)}`}
                      </Button>
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
