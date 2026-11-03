import * as React from 'react';
import { m } from 'motion/react';
import { CalendarClock, CheckCircle2, FileSignature, Flag, Gavel, Info, ShieldCheck, UserX } from 'lucide-react';
import { Stagger, StaggerItem } from '@/components/motion/Stagger';
import { formatDate, formatDateTime, formatNumber, formatWeekday, kuwaitToday } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SEVERITY_LABELS } from '@/lib/domain/behavior';
import { DISCIPLINE_TYPE_LABELS, SUSPENSION_PHASE_LABELS, returnDate, schoolDaysBetween, suspensionPhase } from '@/lib/domain/discipline';
import type { PortalAction } from '@/lib/domain/portal';
import { AllClear, PageTitle, Panel, Pill, usePortalData } from './ui';

const SEVERITY_TONE = { low: 'neutral', medium: 'warning', high: 'danger' } as const;
const SEVERITY_BAR = { low: 'bg-line-strong', medium: 'bg-[var(--chart-late)]', high: 'bg-[var(--chart-absent)]' } as const;

/** Arabic count agreement for school days. */
function schoolDaysText(n: number) {
  if (n === 1) return 'يوم دراسي واحد';
  if (n === 2) return 'يومان دراسيان';
  if (n >= 3 && n <= 10) return `${formatNumber(n)} أيام دراسية`;
  return `${formatNumber(n)} يومًا دراسيًا`;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-surface-sunken px-4 py-3 text-xs leading-relaxed text-fg-muted">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {children}
    </p>
  );
}

// ---------------------------------------------------------------------
// Behavior
// ---------------------------------------------------------------------
export function PortalBehavior() {
  const d = usePortalData();
  const counts = { low: 0, medium: 0, high: 0 };
  d.behavior.forEach((b) => counts[b.severity]++);
  const resolved = d.behavior.filter((b) => b.status === 'resolved').length;
  return (
    <div>
      <PageTitle title="السلوك" subtitle="الملاحظات السلوكية بعد مراجعتها من إدارة المدرسة" />
      <div className="space-y-5">
        {d.behavior.length === 0 ? (
          <Panel>
            <AllClear icon={ShieldCheck} title="سجل سلوكي نظيف" body="لا توجد أي ملاحظات سلوكية مسجلة على الطالب هذا العام. استمر على هذا المستوى المميز." />
          </Panel>
        ) : (
          <>
            <Stagger className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'إجمالي الملاحظات', value: d.behavior.length, cls: 'text-fg-strong' },
                { label: 'درجة مرتفعة', value: counts.high, cls: 'text-danger' },
                { label: 'درجة متوسطة', value: counts.medium, cls: 'text-warning' },
                { label: 'تمت معالجتها', value: resolved, cls: 'text-success' },
              ].map((x) => (
                <StaggerItem key={x.label} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                  <p className={cn('tabular text-2xl font-extrabold', x.cls)}>{formatNumber(x.value)}</p>
                  <p className="text-xs font-semibold text-fg-muted">{x.label}</p>
                </StaggerItem>
              ))}
            </Stagger>
            <Panel title="الملاحظات" subtitle="الأحدث أولًا" icon={Flag}>
              <Stagger as="ul" className="space-y-2.5">
                {d.behavior.map((b, i) => (
                  <StaggerItem as="li" key={i} className="relative overflow-hidden rounded-xl border border-line bg-surface ps-5">
                    <span className={cn('absolute inset-y-0 start-0 w-1.5', SEVERITY_BAR[b.severity])} aria-hidden />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3.5 pe-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{b.category}</p>
                        <p className="text-xs text-fg-muted">{formatWeekday(b.date)} <span className="tabular">{formatDate(b.date)}</span></p>
                      </div>
                      <Pill tone={SEVERITY_TONE[b.severity]}>درجة {SEVERITY_LABELS[b.severity]}</Pill>
                      <Pill tone={b.status === 'resolved' ? 'success' : 'info'}>{b.status === 'resolved' ? 'تمت معالجتها' : 'تمت مراجعتها'}</Pill>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </Panel>
          </>
        )}
        <Note>تُعرض الملاحظة هنا بعد أن تراجعها إدارة المدرسة وتعتمدها. للاستفسار عن أي ملاحظة تواصل مع الأخصائي الاجتماعي.</Note>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Actions & penalties
// ---------------------------------------------------------------------
/** Written for families (the staff descriptions talk about recording). */
const ACTION_MEANING = {
  guardian_summons: 'تطلب المدرسة حضور ولي الأمر في موعد محدد لمناقشة وضع الطالب.',
  suspension: 'إيقاف الطالب عن الدراسة أيامًا محددة بقرار رسمي، ويعود في التاريخ المذكور.',
  pledge: 'تعهد مكتوب يوقّعه الطالب وولي أمره بعدم تكرار المخالفة.',
} as const;

const ACTION_ICON = { guardian_summons: CalendarClock, suspension: UserX, pledge: FileSignature } as const;
const ACTION_COLOR = {
  guardian_summons: 'bg-[var(--chart-late)] text-white',
  suspension: 'bg-[var(--chart-absent)] text-white',
  pledge: 'bg-brand text-white',
} as const;

function actionStatus(a: PortalAction, today: string, nowMs: number): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' } {
  if (a.type === 'guardian_summons') {
    if (a.status === 'attended') return { label: 'تم الحضور', tone: 'success' };
    if (a.status === 'no_show') return { label: 'لم يتم الحضور', tone: 'danger' };
    return a.meeting_at && Date.parse(a.meeting_at) > nowMs ? { label: 'موعد قادم', tone: 'warning' } : { label: 'مجدول', tone: 'info' };
  }
  if (a.type === 'suspension' && a.suspension_from && a.suspension_to) {
    const p = suspensionPhase(a.suspension_from, a.suspension_to, today);
    return { label: SUSPENSION_PHASE_LABELS[p], tone: p === 'active' ? 'danger' : p === 'upcoming' ? 'warning' : 'neutral' };
  }
  if (a.type === 'pledge') return a.signed_on ? { label: 'تم التوقيع', tone: 'success' } : { label: 'بانتظار التوقيع', tone: 'warning' };
  return { label: '', tone: 'neutral' };
}

function ActionCard({ a, today, nowMs }: { a: PortalAction; today: string; nowMs: number }) {
  const st = actionStatus(a, today, nowMs);
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold">{DISCIPLINE_TYPE_LABELS[a.type]}</p>
        <Pill tone={st.tone}>{st.label}</Pill>
        <span className="tabular ms-auto text-xs text-fg-muted">{formatDate(a.date.slice(0, 10))}</span>
      </div>
      <p className="mt-1.5 text-sm">{a.reason}</p>

      {a.type === 'guardian_summons' && a.meeting_at && (
        <dl className={cn('mt-3 grid gap-2 rounded-lg p-3 text-sm sm:grid-cols-2', st.label === 'موعد قادم' ? 'bg-warning-soft' : 'bg-surface-sunken')}>
          <div><dt className="text-xs text-fg-muted">موعد المقابلة</dt><dd className="tabular font-bold">{formatWeekday(a.meeting_at.slice(0, 10))} · {formatDateTime(a.meeting_at)}</dd></div>
          {a.meeting_with && <div><dt className="text-xs text-fg-muted">المقابلة مع</dt><dd className="font-bold">{a.meeting_with}</dd></div>}
        </dl>
      )}
      {a.type === 'suspension' && a.suspension_from && a.suspension_to && (
        <dl className={cn('mt-3 grid grid-cols-2 gap-2 rounded-lg p-3 text-sm sm:grid-cols-4', st.tone === 'danger' ? 'bg-danger-soft' : 'bg-surface-sunken')}>
          <div><dt className="text-xs text-fg-muted">من</dt><dd className="tabular font-bold">{formatDate(a.suspension_from)}</dd></div>
          <div><dt className="text-xs text-fg-muted">إلى</dt><dd className="tabular font-bold">{formatDate(a.suspension_to)}</dd></div>
          <div><dt className="text-xs text-fg-muted">المدة</dt><dd className="font-bold">{schoolDaysText(schoolDaysBetween(a.suspension_from, a.suspension_to))}</dd></div>
          <div><dt className="text-xs text-fg-muted">العودة</dt><dd className="font-bold">{formatWeekday(returnDate(a.suspension_to))} <span className="tabular">{formatDate(returnDate(a.suspension_to))}</span></dd></div>
          {a.decision_number && <div className="col-span-2 sm:col-span-4"><dt className="inline text-xs text-fg-muted">رقم القرار: </dt><dd className="ltr tabular inline font-bold">{a.decision_number}</dd></div>}
        </dl>
      )}
      {a.type === 'pledge' && (
        <p className={cn('mt-3 rounded-lg p-3 text-sm', a.signed_on ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
          {a.signed_on ? <>وقّع الطالب وولي الأمر التعهد بتاريخ <span className="tabular font-bold">{formatDate(a.signed_on)}</span></> : 'يُرجى حضور الطالب وولي الأمر إلى المدرسة لتوقيع التعهد.'}
        </p>
      )}
    </div>
  );
}

export function PortalActions() {
  const d = usePortalData();
  const today = kuwaitToday();
  const [now] = React.useState(() => Date.now());
  const counts = { guardian_summons: 0, suspension: 0, pledge: 0 };
  d.discipline.forEach((a) => counts[a.type]++);
  return (
    <div>
      <PageTitle title="الإجراءات والجزاءات" subtitle="استدعاءات ولي الأمر وقرارات الفصل والتعهدات" />
      <div className="space-y-5">
        <Stagger className="grid grid-cols-3 gap-3">
          {(Object.keys(counts) as (keyof typeof counts)[]).map((k) => {
            const Icon = ACTION_ICON[k];
            return (
              <StaggerItem key={k} className="rounded-xl border border-line bg-surface p-4 shadow-sm">
                <span className={cn('grid size-9 place-items-center rounded-lg', counts[k] ? ACTION_COLOR[k] : 'bg-surface-sunken text-fg-subtle')}><Icon className="size-[18px]" aria-hidden /></span>
                <p className="tabular mt-2 text-2xl font-extrabold text-fg-strong">{formatNumber(counts[k])}</p>
                <p className="text-xs font-semibold text-fg-muted">{DISCIPLINE_TYPE_LABELS[k]}</p>
              </StaggerItem>
            );
          })}
        </Stagger>

        {d.discipline.length === 0 ? (
          <Panel><AllClear icon={CheckCircle2} title="لا توجد إجراءات أو جزاءات" body="لم يُتخذ أي إجراء انضباطي بحق الطالب هذا العام." /></Panel>
        ) : (
          <Panel title="السجل الزمني" subtitle="الأحدث أولًا" icon={Gavel}>
            <ol className="relative space-y-4 ps-12">
              <span className="absolute inset-y-2 start-[1.1rem] w-0.5 rounded-full bg-line" aria-hidden />
              {d.discipline.map((a, i) => {
                const Icon = ACTION_ICON[a.type];
                return (
                  <m.li key={i} className="relative" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i, duration: 0.3 }}>
                    <span className={cn('absolute -start-12 top-3 grid size-9 place-items-center rounded-full shadow-sm ring-4 ring-surface', ACTION_COLOR[a.type])}>
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <ActionCard a={a} today={today} nowMs={now} />
                  </m.li>
                );
              })}
            </ol>
          </Panel>
        )}

        <Panel title="ما معنى كل إجراء؟" icon={Info}>
          <dl className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(ACTION_ICON) as (keyof typeof ACTION_ICON)[]).map((k) => {
              const Icon = ACTION_ICON[k];
              return (
                <div key={k} className="rounded-lg bg-surface-sunken p-3">
                  <dt className="flex items-center gap-2 text-sm font-bold"><Icon className="size-4 text-fg-muted" aria-hidden /> {DISCIPLINE_TYPE_LABELS[k]}</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-fg-muted">{ACTION_MEANING[k]}</dd>
                </div>
              );
            })}
          </dl>
        </Panel>
      </div>
    </div>
  );
}
