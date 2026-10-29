import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { m } from 'motion/react';
import { spring } from '@/lib/motion';
import { AlertTriangle, CalendarX2, Check, CheckCheck, Clock, FileCheck2, History, Lock, RotateCcw, Save, Send, Unlock, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/input';
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
import { useReopenSession, useRoster, useSaveAttendance, useSession, type MarkEntry } from './api';

const STATUS_STYLE: Record<AttendanceStatus, { icon: React.ElementType; on: string }> = {
  present: { icon: Check, on: 'border-success bg-success text-white dark:text-slate-950' },
  absent: { icon: X, on: 'border-danger bg-danger text-white dark:text-slate-950' },
  late: { icon: Clock, on: 'border-warning bg-warning text-white dark:text-slate-950' },
  excused: { icon: FileCheck2, on: 'border-info bg-info text-white dark:text-slate-950' },
};

/** Radio-group of the four statuses for one student; the highlight glides to the chosen status. */
function StatusPicker({ id, name, value, disabled, onChange }: { id: string; name: string; value: AttendanceStatus | null; disabled: boolean; onChange: (s: AttendanceStatus) => void }) {
  return (
    <div role="radiogroup" aria-label={`حالة ${name}`} className="inline-flex flex-wrap gap-1">
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
              'relative inline-flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
              checked ? 'border-transparent text-white dark:text-slate-950' : 'border-line-strong bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg',
            )}
          >
            {checked && (
              <m.span layoutId={`att-${id}`} transition={spring.indicator} className={cn('absolute inset-0 rounded-md', STATUS_STYLE[s].on)} aria-hidden />
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
  const save = useSaveAttendance();
  const reopen = useReopenSession();

  const [marks, setMarks] = React.useState<Map<string, MarkEntry>>(new Map());
  const [saved, setSaved] = React.useState<Map<string, MarkEntry>>(new Map());
  const [onlyUnmarked, setOnlyUnmarked] = React.useState(false);
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
  const visible = onlyUnmarked ? students.filter((s) => !marks.get(s.student_id)?.status) : students;
  const selectedClass = classes.data?.find((c) => c.id === classId);

  return (
    <>
      <PageHeader
        title="رصد الحضور"
        breadcrumbs={[{ label: 'الحضور والغياب', to: '/attendance' }, { label: 'رصد الحضور' }]}
        description={mode === 'daily' ? 'نظام الحضور: يومي (جلسة واحدة لكل فصل يوميًا)' : `نظام الحضور: بالحصة (${formatNumber(settings.data?.periods_per_day)} حصص يوميًا)`}
      />

      <Card className="no-print mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_2fr]">
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
          {mode === 'period' && (
            <div>
              <label htmlFor="att-period" className="mb-1 block text-xs font-semibold text-fg-muted">الحصة</label>
              <Select id="att-period" value={period} onChange={(e) => updateParam('period', e.target.value)}>
                {Array.from({ length: settings.data?.periods_per_day ?? 7 }, (_, i) => <option key={i + 1} value={i + 1}>الحصة {formatNumber(i + 1)}</option>)}
              </Select>
            </div>
          )}
          <div className="flex items-end text-sm text-fg-muted sm:col-span-3 lg:col-span-1">
            {formatWeekday(date)} {formatDate(date)} · {periodLabel(period)}
          </div>
        </div>
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
            <div className="sticky top-16 z-20 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-t-lg border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
              <div className="flex items-center gap-2">
                <p className="font-bold">فصل {selectedClass?.name}</p>
                <CompletionBadge state={completion} />
              </div>
              <dl className="tabular flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]" aria-label="ملخص الرصد">
                {ATTENDANCE_STATUSES.map((s) => (
                  <div key={s} className="flex gap-1"><dt className="text-fg-muted">{ATTENDANCE_LABELS[s]}:</dt><dd className="font-bold">{formatNumber(counts[s])}</dd></div>
                ))}
                <div className="flex gap-1"><dt className="text-fg-muted">لم يُرصد:</dt><dd className={cn('font-bold', counts.unmarked > 0 && 'text-warning')}>{formatNumber(counts.unmarked)}</dd></div>
              </dl>
              <div className="ms-auto flex flex-wrap items-center gap-2">
                {!readOnly && counts.unmarked > 0 && (
                  <Button size="sm" variant="subtle" onClick={markAllUnmarkedPresent}><CheckCheck /> تحديد غير المرصودين حاضرين</Button>
                )}
                <label className="flex items-center gap-1.5 text-[0.8125rem] text-fg-muted">
                  <Checkbox checked={onlyUnmarked} onChange={(e) => setOnlyUnmarked(e.target.checked)} /> غير المرصودين فقط
                </label>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                <m.div className="h-full [background:var(--brand-gradient)]" animate={{ width: `${(counts.marked / students.length) * 100}%` }} transition={spring.sheet} />
              </div>
            </div>

            <ol className="divide-y divide-line" aria-label="قائمة طلاب الجلسة">
              {visible.map((s, i) => {
                const m = marks.get(s.student_id);
                const changed = changes.some((c) => c.student_id === s.student_id);
                return (
                  <li key={s.student_id} className={cn('grid gap-2 px-4 py-2.5 md:grid-cols-[2.5rem_minmax(12rem,1fr)_auto_minmax(10rem,14rem)] md:items-center', changed && 'bg-warning-soft/50', !m?.status && 'bg-surface-sunken/40')}>
                    <span className="tabular hidden text-sm text-fg-subtle md:block">{formatNumber(students.indexOf(s) + 1 || i + 1)}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{s.full_name}</p>
                      <p className="flex items-center gap-2 text-xs text-fg-muted">
                        <span className="ltr tabular">{s.student_number}</span>
                        {!m?.status && <AttendanceBadge status={null} />}
                        {changed && <span className="font-semibold text-warning">· غير محفوظ</span>}
                      </p>
                    </div>
                    <StatusPicker id={s.student_id} name={s.full_name} value={m?.status ?? null} disabled={readOnly} onChange={(st) => setMark(s.student_id, { status: st, minutes_late: st === 'late' ? (m?.minutes_late ?? 5) : null })} />
                    <div className="flex gap-2">
                      {m?.status === 'late' && (
                        <label className="flex shrink-0 items-center gap-1 text-xs text-fg-muted">
                          <Input type="number" min={1} max={300} className="h-8 w-16 px-2 text-center" aria-label={`دقائق تأخر ${s.full_name}`} disabled={readOnly} value={m.minutes_late ?? ''} onChange={(e) => setMark(s.student_id, { minutes_late: e.target.value ? Math.min(300, Math.max(1, Number(e.target.value))) : null })} />
                          د
                        </label>
                      )}
                      <Input className="h-8 text-xs" placeholder="ملاحظة (اختياري)" aria-label={`ملاحظة ${s.full_name}`} maxLength={500} disabled={readOnly} value={m?.note ?? ''} onChange={(e) => setMark(s.student_id, { note: e.target.value })} />
                    </div>
                  </li>
                );
              })}
              {visible.length === 0 && <li><EmptyState icon={<CheckCheck />} title="تم رصد جميع الطلاب" className="py-8" /></li>}
            </ol>

            {!readOnly && (
              <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-b-lg border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
                <p className="text-[0.8125rem] text-fg-muted" aria-live="polite">
                  {dirty ? `${formatNumber(changes.length)} تغيير غير محفوظ` : 'لا توجد تغييرات غير محفوظة'}
                  {!submitted && counts.unmarked > 0 && ` · يتطلب الاعتماد رصد جميع الطلاب (${formatNumber(counts.unmarked)} متبقٍ)`}
                </p>
                <div className="ms-auto flex gap-2">
                  {submitted ? (
                    <Button disabled={!dirty} onClick={() => setCorrectionOpen(true)}><Save /> حفظ التصحيح</Button>
                  ) : (
                    <>
                      <Button variant="secondary" disabled={!dirty} loading={save.isPending && !save.variables?.submit} onClick={() => persist(false)}><Save /> حفظ كمسودة</Button>
                      <Button disabled={counts.unmarked > 0} loading={save.isPending && save.variables?.submit} onClick={() => persist(true)}><Send className="rtl:-scale-x-100" /> اعتماد الحضور</Button>
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
