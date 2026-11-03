import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { m } from 'motion/react';
import {
  CalendarCheck2, CalendarClock, CheckCircle2, Clock, Compass, FileCheck2, FileSignature, Flag, GraduationCap,
  Lock, LogOut, Printer, UserX, X,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/button';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { useDocumentTitle } from '@/lib/hooks';
import { formatDate, formatDateTime, formatNumber, formatPercent, formatWeekday, kuwaitToday } from '@/lib/format';
import { EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { careerLabel } from '@/lib/domain/career';
import { EXCUSE_REASON_LABELS } from '@/lib/domain/attendance';
import { SEVERITY_LABELS } from '@/lib/domain/behavior';
import { DISCIPLINE_TYPE_LABELS, returnDate, schoolDaysBetween, suspensionPhase } from '@/lib/domain/discipline';
import { ATTENDANCE_TONE_TEXT, EXCUSE_STATUS_TEXT, attendanceTone, summarizeDay, type PortalData } from '@/lib/domain/portal';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';

const SCHOOL = 'ثانوية النجاة بنين – حولي';

// ---------------------------------------------------------------------
// Student view
// ---------------------------------------------------------------------
const SECTIONS = [
  { id: 'attendance', label: 'الحضور', icon: CalendarCheck2 },
  { id: 'behavior', label: 'السلوك', icon: Flag },
  { id: 'actions', label: 'الإجراءات', icon: FileSignature },
  { id: 'career', label: 'الميول المهنية', icon: Compass },
] as const;

function Section({ id, title, icon: Icon, children, aside }: { id: string; title: string; icon: React.ElementType; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-20 rounded-2xl border border-line bg-surface p-5 shadow-sm print:break-inside-avoid print:border-slate-300 print:shadow-none sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand dark:text-link"><Icon className="size-[18px]" aria-hidden /></span>
        <h2 id={`${id}-h`} className="text-lg font-bold text-fg-strong">{title}</h2>
        {aside && <div className="ms-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function Quiet({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">
      <Icon className="size-4 shrink-0" aria-hidden /> {children}
    </p>
  );
}

const MARK_STYLE = {
  absent: { label: 'غياب', cls: 'bg-danger-soft text-danger border-danger-line', icon: X },
  late: { label: 'تأخر', cls: 'bg-warning-soft text-warning border-warning-line', icon: Clock },
  excused: { label: 'غياب بعذر', cls: 'bg-info-soft text-info border-info-line', icon: FileCheck2 },
  present: { label: 'حضور', cls: 'bg-success-soft text-success border-success-line', icon: CheckCircle2 },
} as const;

const TONE_BAR: Record<ReturnType<typeof attendanceTone>, string> = {
  excellent: 'bg-success', good: 'bg-success', watch: 'bg-warning', concern: 'bg-danger', none: 'bg-line-strong',
};

function AttendanceSection({ d }: { d: PortalData }) {
  const a = d.attendance;
  const tone = attendanceTone(a.rate);
  const [all, setAll] = React.useState(false);
  const days = all ? d.days : d.days.slice(0, 8);
  return (
    <Section id="attendance" title="الحضور والغياب" icon={CalendarCheck2}>
      <div className="rounded-xl bg-surface-sunken/60 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm text-fg-muted">نسبة الحضور</p>
          <p className="tabular text-3xl font-bold text-fg-strong">{formatPercent(a.rate)}</p>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden>
          <m.div className={cn('h-full rounded-full', TONE_BAR[tone])} initial={{ width: 0 }} animate={{ width: `${a.rate ?? 0}%` }} transition={{ duration: 0.9, ease: EASE_OUT }} />
        </div>
        <p className="mt-2 text-sm font-semibold text-fg">{ATTENDANCE_TONE_TEXT[tone]}</p>
        <ul className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <li className="rounded-lg bg-surface px-3 py-2"><span className="block text-xs text-fg-muted">أيام غياب</span><span className="tabular text-lg font-bold text-danger">{formatNumber(a.absent_days)}</span></li>
          <li className="rounded-lg bg-surface px-3 py-2"><span className="block text-xs text-fg-muted">حصص غياب</span><span className="tabular text-lg font-bold text-fg-strong">{formatNumber(a.absent)}</span></li>
          <li className="rounded-lg bg-surface px-3 py-2"><span className="block text-xs text-fg-muted">مرات التأخر</span><span className="tabular text-lg font-bold text-warning">{formatNumber(a.late)}</span></li>
          <li className="rounded-lg bg-surface px-3 py-2"><span className="block text-xs text-fg-muted">غياب بعذر</span><span className="tabular text-lg font-bold text-info">{formatNumber(a.excused)}</span></li>
        </ul>
      </div>

      <h3 className="mb-2 mt-5 text-sm font-bold text-fg-muted">أيام الغياب والتأخر</h3>
      {d.days.length === 0 ? (
        <Quiet icon={CheckCircle2}>{a.recorded_days ? 'لا توجد أيام غياب أو تأخر حتى الآن' : 'لم يُرصد حضور بعد'}</Quiet>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {days.map((day) => (
              <li key={day.day} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                <span className="min-w-28 text-sm font-semibold">{formatWeekday(day.day)} <span className="tabular font-normal text-fg-muted">{formatDate(day.day)}</span></span>
                <span className="flex flex-wrap gap-1.5">
                  {summarizeDay(day, formatNumber).map((s) => {
                    const st = MARK_STYLE[s.status];
                    return (
                      <span key={s.status} className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', st.cls)}>
                        <st.icon className="size-3" aria-hidden /> {st.label} · {s.periods}
                      </span>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
          {d.days.length > 8 && (
            <Button variant="ghost" size="sm" className="no-print mt-2" onClick={() => setAll(!all)}>{all ? 'عرض أقل' : `عرض كل الأيام (${formatNumber(d.days.length)})`}</Button>
          )}
        </>
      )}

      {d.excuses.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-sm font-bold text-fg-muted">أعذار الغياب المقدمة</h3>
          <ul className="space-y-2">
            {d.excuses.map((x, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-4 py-2.5 text-sm">
                <span>{EXCUSE_REASON_LABELS[x.reason_type] ?? x.reason_type} · <span className="tabular text-fg-muted">{x.from === x.to ? formatDate(x.from) : `${formatDate(x.from)} – ${formatDate(x.to)}`}</span></span>
                <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', x.status === 'approved' ? 'bg-success-soft text-success' : x.status === 'rejected' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning')}>{EXCUSE_STATUS_TEXT[x.status]}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

function BehaviorSection({ d }: { d: PortalData }) {
  return (
    <Section id="behavior" title="السلوك" icon={Flag}>
      {d.behavior.length === 0 ? (
        <Quiet icon={CheckCircle2}>لا توجد ملاحظات سلوكية مسجلة، أحسنت</Quiet>
      ) : (
        <ul className="space-y-2">
          {d.behavior.map((b, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line px-4 py-3">
              <span className="font-semibold">{b.category}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', b.severity === 'high' ? 'bg-danger-soft text-danger' : b.severity === 'medium' ? 'bg-warning-soft text-warning' : 'bg-neutral-soft text-neutral')}>{SEVERITY_LABELS[b.severity]}</span>
              <span className="ms-auto text-sm text-fg-muted"><span className="tabular">{formatDate(b.date)}</span> · {b.status === 'resolved' ? 'تمت معالجتها' : 'تمت مراجعتها'}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-fg-subtle">تظهر هنا الملاحظات بعد مراجعتها من إدارة المدرسة.</p>
    </Section>
  );
}

const ACTION_ICON = { guardian_summons: CalendarClock, suspension: UserX, pledge: FileSignature } as const;

function ActionsSection({ d }: { d: PortalData }) {
  const today = kuwaitToday();
  const [now] = React.useState(() => Date.now());
  return (
    <Section id="actions" title="الإجراءات والجزاءات" icon={FileSignature}>
      {d.discipline.length === 0 ? (
        <Quiet icon={CheckCircle2}>لا توجد إجراءات أو جزاءات</Quiet>
      ) : (
        <ol className="relative space-y-4 border-s-2 border-line ps-5">
          {d.discipline.map((a, i) => {
            const Icon = ACTION_ICON[a.type];
            const upcoming = a.type === 'guardian_summons' && a.status === 'scheduled' && a.meeting_at && Date.parse(a.meeting_at) > now;
            return (
              <li key={i} className="relative">
                <span className={cn('absolute -start-[1.95rem] top-0.5 grid size-7 place-items-center rounded-full border-2 border-surface', upcoming ? 'bg-warning text-white' : 'bg-brand-soft text-brand dark:text-link')}>
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">{DISCIPLINE_TYPE_LABELS[a.type]}</p>
                    <span className="text-xs text-fg-muted tabular">{formatDate(a.date.slice(0, 10))}</span>
                  </div>
                  <p className="mt-1 text-sm text-fg">{a.reason}</p>

                  {a.type === 'guardian_summons' && a.meeting_at && (
                    <p className={cn('mt-3 rounded-lg px-3 py-2 text-sm', upcoming ? 'bg-warning-soft font-semibold text-warning' : 'bg-surface-sunken text-fg')}>
                      {upcoming ? 'مطلوب حضور ولي الأمر: ' : 'موعد المقابلة: '}
                      <span className="tabular">{formatDateTime(a.meeting_at)}</span>
                      {a.meeting_with && ` · مع ${a.meeting_with}`}
                      {a.status === 'attended' && ' · تم الحضور'}
                      {a.status === 'no_show' && ' · لم يتم الحضور'}
                    </p>
                  )}
                  {a.type === 'suspension' && a.suspension_from && a.suspension_to && (() => {
                    const phase = suspensionPhase(a.suspension_from, a.suspension_to, today);
                    return (
                      <p className={cn('mt-3 rounded-lg px-3 py-2 text-sm', phase === 'active' ? 'bg-danger-soft font-semibold text-danger' : 'bg-surface-sunken text-fg')}>
                        فصل مؤقت {formatNumber(schoolDaysBetween(a.suspension_from, a.suspension_to))} يوم دراسي: <span className="tabular">{formatDate(a.suspension_from)} – {formatDate(a.suspension_to)}</span>
                        {' · '}العودة يوم {formatWeekday(returnDate(a.suspension_to))} <span className="tabular">{formatDate(returnDate(a.suspension_to))}</span>
                        {a.decision_number && <> · قرار رقم <span className="ltr tabular">{a.decision_number}</span></>}
                      </p>
                    );
                  })()}
                  {a.type === 'pledge' && (
                    <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-sm">
                      {a.signed_on ? <>تم التوقيع بتاريخ <span className="tabular">{formatDate(a.signed_on)}</span></> : 'بانتظار توقيع الطالب وولي الأمر في المدرسة'}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

function CareerSection({ d }: { d: PortalData }) {
  const c = d.career;
  return (
    <Section id="career" title="الميول المهنية" icon={Compass}>
      {!c ? (
        <p className="rounded-xl bg-surface-sunken px-4 py-3 text-sm text-fg-muted">لم يؤدِّ الطالب اختبار الميول المهنية بعد.</p>
      ) : (
        <>
          <ol className="grid gap-2 sm:grid-cols-3">
            {[c.top_1, c.top_2, c.top_3].map((k, i) => (
              <li key={k} className={cn('flex items-center gap-3 rounded-xl px-4 py-3', i === 0 ? 'text-white shadow-md [background:var(--brand-gradient)]' : 'border border-line bg-surface')}>
                <span className={cn('tabular grid size-7 place-items-center rounded-full text-sm font-bold', i === 0 ? 'bg-white/25' : 'bg-surface-sunken text-fg-muted')}>{formatNumber(i + 1)}</span>
                <span className="font-bold">{careerLabel(k)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-fg-subtle">نتيجة اختبار يوم {formatDate(c.submitted_at.slice(0, 10))}. للنقاش حول التوجيه المهني تواصل مع المرشد الطلابي.</p>
        </>
      )}
    </Section>
  );
}

function PortalView({ d, onLogout }: { d: PortalData; onLogout: () => void }) {
  const s = d.student;
  const initials = s.full_name.split(/\s+/).slice(0, 2).map((w) => w[0]).join(' ');
  useDocumentTitle(`${s.full_name.split(/\s+/)[0]} · بوابة ولي الأمر`);
  return (
    <div className="min-h-dvh pb-12">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Logo variant="mark" className="h-8" />
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-fg-muted">{d.school ?? SCHOOL}</p>
          <Button variant="ghost" size="sm" aria-label="طباعة التقرير" onClick={() => window.print()}><Printer /> <span className="hidden sm:inline" aria-hidden>طباعة التقرير</span></Button>
          <Button variant="ghost" size="sm" aria-label="خروج" onClick={onLogout}><LogOut /> <span className="hidden sm:inline" aria-hidden>خروج</span></Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 pt-5">
        <div className="print-only mb-2 border-b pb-3">
          <p className="text-lg font-bold">{d.school ?? SCHOOL}</p>
          <p>تقرير الطالب · العام الدراسي {s.year_name} · طُبع في {formatDate(kuwaitToday())}</p>
        </div>

        <m.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
          className="overflow-hidden rounded-2xl text-white shadow-lg [background:var(--brand-gradient)] print:text-black print:shadow-none print:[background:none]"
        >
          <div className="flex items-center gap-4 p-5 sm:p-6">
            <span className="no-print grid size-16 shrink-0 place-items-center rounded-2xl bg-white/20 text-xl font-bold" aria-hidden>{initials}</span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold leading-snug sm:text-2xl">{s.full_name}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85 print:text-black">
                <span className="inline-flex items-center gap-1"><GraduationCap className="size-4" aria-hidden /> {s.class_name ? `الصف ${s.class_name}` : '—'}</span>
                <span>العام الدراسي <span className="tabular">{s.year_name}</span></span>
                <span className="ltr tabular">•••• {s.civil_id_last4}</span>
              </p>
            </div>
          </div>
        </m.section>

        {s.year_closed && (
          <p role="status" className="flex items-center gap-2 rounded-xl border border-neutral-line bg-neutral-soft px-4 py-3 text-sm text-neutral">
            <Lock className="size-4 shrink-0" aria-hidden /> انتهى العام الدراسي {s.year_name}، والبيانات المعروضة نهائية.
          </p>
        )}

        <nav aria-label="أقسام الصفحة" className="no-print sticky top-14 z-10 -mx-4 overflow-x-auto bg-canvas/90 px-4 py-2 backdrop-blur">
          <ul className="flex gap-2">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <a href={`#${id}`} className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-3.5 text-sm font-semibold text-fg-muted shadow-xs transition-colors hover:text-fg">
                  <Icon className="size-4" aria-hidden /> {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <AttendanceSection d={d} />
        <BehaviorSection d={d} />
        <ActionsSection d={d} />
        <CareerSection d={d} />

        <p className="pt-2 text-center text-xs text-fg-subtle">
          لأي استفسار عن هذه البيانات تواصل مع شؤون الطلبة في {d.school ?? SCHOOL}.
        </p>
      </main>
    </div>
  );
}

/** Shown when a signed-in student account is not linked to an active student. */
function Unavailable({ onLogout }: { onLogout: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-lg sm:p-8">
        <Logo className="mx-auto h-20" />
        <span className="mx-auto mt-5 grid size-12 place-items-center rounded-full bg-warning-soft text-warning"><UserX className="size-6" aria-hidden /></span>
        <h1 className="mt-3 text-lg font-bold text-fg-strong">لا تتوفر بيانات لهذا الحساب حاليًا</h1>
        <p className="mt-1 text-sm text-fg-muted">قد يكون الطالب منقولًا أو أن الحساب غير مرتبط بسجل طالب. تواصل مع شؤون الطلبة في {SCHOOL}.</p>
        <Button variant="secondary" className="mt-5" onClick={onLogout}><LogOut /> تسجيل الخروج</Button>
      </div>
    </main>
  );
}

export function PortalPage() {
  useDocumentTitle('بوابة ولي الأمر والطالب');
  const auth = useAuth();
  const data = useQuery({
    queryKey: ['portal', auth.session?.user.id],
    queryFn: async () => (unwrap(await supabase.rpc('portal_my_data')) as unknown as PortalData | null) ?? null,
    staleTime: 60_000,
  });
  const logout = () => void auth.signOut();

  if (data.isPending) return <div className="mx-auto max-w-3xl px-4 pt-10"><LoadingState rows={8} /></div>;
  if (data.isError) return <div className="mx-auto max-w-3xl px-4 pt-10"><ErrorState error={data.error} onRetry={() => data.refetch()} /></div>;
  if (!data.data) return <Unavailable onLogout={logout} />;
  return <PortalView d={data.data} onLogout={logout} />;
}
