import * as React from 'react';
import { useSearchParams } from 'react-router';
import { AnimatePresence, m } from 'motion/react';
import { BarChart3, CalendarDays, CalendarX2, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileClock, ListFilter, X } from 'lucide-react';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { Button } from '@/components/ui/button';
import { formatDate, formatNumber, formatWeekday, isSchoolDay, kuwaitToday, LOCALE, startOfMonth } from '@/lib/format';
import { EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { EXCUSE_REASON_LABELS } from '@/lib/domain/attendance';
import {
  ATTENDANCE_TONE_TEXT, DAY_KIND_LABELS, EXCUSE_STATUS_TEXT, attendanceTone, dayKind, monthGrid, monthsBetween, periodStats, summarizeDay,
  type PortalData, type PortalDay,
} from '@/lib/domain/portal';
import { AllClear, KIND_STYLE, Legend, PageTitle, Panel, Pill, RateRing, WEEKDAY_SHORT, usePortalData } from './ui';

/** Arabic count agreement: حصة، حصتان، ٣ حصص. */
function periodsText(n: number) {
  return n === 1 ? 'حصة' : n === 2 ? 'حصتان' : `${formatNumber(n)} حصص`;
}
function minutesText(n: number) {
  return n === 1 ? 'دقيقة واحدة' : n === 2 ? 'دقيقتين' : n >= 3 && n <= 10 ? `${formatNumber(n)} دقائق` : `${formatNumber(n)} دقيقة`;
}

const monthFmt = new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', month: 'long', year: 'numeric' });
const monthTitle = (m: string) => monthFmt.format(new Date(`${m}T00:00:00Z`));

function Overview({ d }: { d: PortalData }) {
  const a = d.attendance;
  const total = a.present + a.late + a.absent + a.excused;
  const parts = [
    { key: 'present', label: 'حضور', value: a.present, cls: 'bg-success' },
    { key: 'late', label: 'تأخر', value: a.late, cls: 'bg-[var(--chart-late)]' },
    { key: 'excused', label: 'بعذر', value: a.excused, cls: 'bg-[var(--chart-excused)]' },
    { key: 'absent', label: 'غياب', value: a.absent, cls: 'bg-[var(--chart-absent)]' },
  ];
  const tone = attendanceTone(a.rate);
  return (
    <Panel>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <RateRing rate={a.rate} size={150} stroke={13} />
        <div className="w-full min-w-0 flex-1">
          <p className={cn('text-lg font-extrabold', tone === 'concern' ? 'text-danger' : tone === 'watch' ? 'text-warning' : 'text-fg-strong')}>{ATTENDANCE_TONE_TEXT[tone]}</p>
          <p className="text-sm text-fg-muted">
            {a.recorded_days > 0 ? <>رُصد الحضور في <span className="tabular font-semibold text-fg">{formatNumber(a.recorded_days)}</span> يومًا دراسيًا بإجمالي <span className="tabular font-semibold text-fg">{formatNumber(total)}</span> حصة.</> : 'لم يُرصد حضور بعد.'}
          </p>
          {total > 0 && (
            <>
              <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={parts.map((p) => `${p.label} ${formatNumber(p.value)}`).join('، ')}>
                {parts.filter((p) => p.value > 0).map((p, i) => (
                  <m.span
                    key={p.key}
                    className={cn('h-full', p.cls, i > 0 && 'border-s-2 border-surface')}
                    initial={{ width: 0 }}
                    animate={{ width: `${(p.value / total) * 100}%` }}
                    transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.2 + i * 0.08 }}
                  />
                ))}
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
                {parts.map((p) => (
                  <li key={p.key} className="flex items-center gap-2">
                    <span className={cn('size-2.5 shrink-0 rounded-full', p.cls)} aria-hidden />
                    <span className="text-fg-muted">{p.label}</span>
                    <span className="tabular ms-auto font-bold sm:ms-0">{formatNumber(p.value)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-5 sm:grid-cols-4">
        {[
          { label: 'أيام غياب كامل أو جزئي', value: a.absent_days, icon: CalendarX2, cls: 'text-danger' },
          { label: 'حصص الغياب', value: a.absent, icon: X, cls: 'text-danger' },
          { label: 'مرات التأخر', value: a.late, icon: Clock, cls: 'text-warning' },
          { label: 'غياب بعذر (حصص)', value: a.excused, icon: FileClock, cls: 'text-info' },
        ].map((x) => (
          <div key={x.label} className="rounded-lg bg-surface-sunken p-3">
            <x.icon className={cn('size-4', x.cls)} aria-hidden />
            <p className="mt-1 text-xl font-extrabold text-fg-strong"><AnimatedNumber value={x.value} /></p>
            <p className="text-xs text-fg-muted">{x.label}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DayDetail({ date, day, kind, onClose }: { date: string; day?: PortalDay; kind: ReturnType<typeof dayKind>; onClose: () => void }) {
  const parts = day ? summarizeDay(day, formatNumber) : [];
  const late = day?.items.filter((i) => i.status === 'late' && i.minutes_late) ?? [];
  return (
    <m.div
      key={date}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      className="overflow-hidden"
    >
      <div className="mt-4 rounded-xl border border-line bg-surface-sunken p-4">
        <div className="flex items-start gap-3">
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg', KIND_STYLE[kind].cell)}>
            {kind === 'present' ? <CheckCircle2 className="size-5" aria-hidden /> : kind === 'late' ? <Clock className="size-5" aria-hidden /> : kind === 'excused' ? <FileClock className="size-5" aria-hidden /> : kind === 'none' ? <CalendarDays className="size-5" aria-hidden /> : <CalendarX2 className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{formatWeekday(date)} <span className="tabular">{formatDate(date)}</span></p>
            <p className="text-sm text-fg-muted">{kind === 'none' ? (date > kuwaitToday() ? 'يوم قادم' : 'لم يُرصد حضور هذا اليوم') : DAY_KIND_LABELS[kind]}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="إغلاق التفاصيل"><X className="size-4" /></Button>
        </div>
        {parts.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {parts.map((p) => (
              <li key={p.status} className={cn('rounded-full border px-3 py-1 text-xs font-bold', KIND_STYLE[p.status === 'absent' ? 'absent' : p.status === 'late' ? 'late' : 'excused'].chip)}>
                {p.status === 'absent' ? 'غياب' : p.status === 'late' ? 'تأخر' : 'غياب بعذر'} · {p.periods}
              </li>
            ))}
          </ul>
        )}
        {late.length > 0 && (
          <p className="mt-2 text-xs text-fg-muted">{late.map((i) => `تأخر ${minutesText(i.minutes_late ?? 0)}${i.period ? ` في الحصة ${formatNumber(i.period)}` : ''}`).join('، ')}</p>
        )}
      </div>
    </m.div>
  );
}

function Calendar({ d }: { d: PortalData }) {
  const [params, setParams] = useSearchParams();
  const today = kuwaitToday();
  const recorded = React.useMemo(() => new Set(d.recorded_dates ?? []), [d.recorded_dates]);
  const byDay = React.useMemo(() => new Map(d.days.map((x) => [x.day, x])), [d.days]);
  const per = d.settings?.periods_per_day ?? 7;

  const firstData = [...(d.recorded_dates ?? []), ...d.days.map((x) => x.day)].sort()[0];
  const start = [d.student.year_starts_on, firstData].filter(Boolean).sort()[0] ?? today;
  const endCap = d.student.year_ends_on && d.student.year_ends_on < today ? d.student.year_ends_on : today;
  const months = React.useMemo(() => monthsBetween(start, endCap < start ? start : endCap), [start, endCap]);

  const selected = params.get('day');
  const [month, setMonth] = React.useState(() => {
    const want = startOfMonth(selected && /^\d{4}-\d{2}-\d{2}$/.test(selected) ? selected : endCap);
    return months.includes(want) ? want : months[months.length - 1];
  });
  // A day picked elsewhere (the log, the home page) opens its month.
  const selectedMonth = selected && /^\d{4}-\d{2}-\d{2}$/.test(selected) ? startOfMonth(selected) : null;
  const [seen, setSeen] = React.useState(selectedMonth);
  if (selectedMonth !== seen) {
    setSeen(selectedMonth);
    if (selectedMonth && months.includes(selectedMonth)) setMonth(selectedMonth);
  }
  const idx = months.indexOf(month);
  const grid = React.useMemo(() => monthGrid(month), [month]);
  const select = (date: string | null) => {
    const next = new URLSearchParams(params);
    if (date) next.set('day', date);
    else next.delete('day');
    setParams(next, { replace: true, preventScrollReset: true });
  };

  // Month summary
  const inMonth = grid.flat().filter((c) => c.inMonth && c.schoolDay);
  const counts = inMonth.reduce(
    (acc, c) => {
      const k = dayKind(byDay.get(c.date), recorded.has(c.date), per);
      if (k !== 'none') acc[k]++;
      return acc;
    },
    { present: 0, absent: 0, partial: 0, late: 0, excused: 0 } as Record<string, number>,
  );

  return (
    <Panel title="التقويم" subtitle="اضغط على أي يوم لعرض تفاصيله" icon={CalendarDays}>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" size="icon" onClick={() => setMonth(months[idx - 1])} disabled={idx <= 0} aria-label="الشهر السابق"><ChevronRight className="size-4" /></Button>
        <AnimatePresence mode="wait" initial={false}>
          <m.p key={month} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }} className="min-w-0 flex-1 text-center text-base font-extrabold">
            {monthTitle(month)}
          </m.p>
        </AnimatePresence>
        <Button variant="secondary" size="icon" onClick={() => setMonth(months[idx + 1])} disabled={idx >= months.length - 1} aria-label="الشهر التالي"><ChevronLeft className="size-4" /></Button>
      </div>

      <div className="grid grid-cols-5 gap-1.5 sm:gap-2" role="grid" aria-label={`تقويم ${monthTitle(month)}`}>
        {WEEKDAY_SHORT.slice(0, 5).map((w) => (
          <div key={w} role="columnheader" className="pb-1 text-center text-xs font-bold text-fg-subtle">{w}</div>
        ))}
        <AnimatePresence mode="popLayout" initial={false}>
          {grid.flat().map((c, i) => {
            if (!c.inMonth) return <div key={`${month}-${c.date}`} aria-hidden />;
            const kind = dayKind(byDay.get(c.date), recorded.has(c.date), per);
            const future = c.date > today;
            const isSel = selected === c.date;
            return (
              <m.button
                key={`${month}-${c.date}`}
                type="button"
                role="gridcell"
                aria-selected={isSel}
                aria-label={`${formatWeekday(c.date)} ${formatDate(c.date)}: ${future ? 'يوم قادم' : DAY_KIND_LABELS[kind]}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.012, 0.3), duration: 0.2 }}
                onClick={() => select(isSel ? null : c.date)}
                className={cn(
                  'relative flex aspect-[1.15] flex-col items-center justify-center rounded-lg text-sm font-bold transition-[transform,box-shadow] hover:scale-[1.04] sm:aspect-[1.6]',
                  KIND_STYLE[kind].cell,
                  kind === 'none' && (future ? 'opacity-50' : 'bg-surface-sunken'),
                  isSel && 'ring-2 ring-teal ring-offset-2 ring-offset-surface',
                  c.date === today && !isSel && 'outline outline-2 -outline-offset-2 outline-teal',
                )}
              >
                <span className="tabular">{formatNumber(Number(c.date.slice(8)))}</span>
                {(kind === 'partial' || kind === 'late') && (
                  <span className="tabular text-[0.625rem] font-semibold opacity-80">
                    {kind === 'partial' ? periodsText(byDay.get(c.date)?.items.filter((x) => x.status === 'absent').length ?? 0) : 'تأخر'}
                  </span>
                )}
              </m.button>
            );
          })}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {selected && /^\d{4}-\d{2}-\d{2}$/.test(selected) && isSchoolDay(selected) && (
          <DayDetail date={selected} day={byDay.get(selected)} kind={dayKind(byDay.get(selected), recorded.has(selected), per)} onClose={() => select(null)} />
        )}
      </AnimatePresence>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Legend />
        <p className="text-xs text-fg-muted">
          هذا الشهر: <span className="tabular font-bold text-fg">{formatNumber(counts.present)}</span> حضور كامل ·{' '}
          <span className="tabular font-bold text-danger">{formatNumber(counts.absent + counts.partial)}</span> غياب
        </p>
      </div>
    </Panel>
  );
}

function hasPeriodData(d: PortalData) {
  return d.settings?.attendance_mode === 'period' && periodStats(d.days, d.settings.periods_per_day).some((r) => r.absent + r.late > 0);
}

function Periods({ d }: { d: PortalData }) {
  const per = d.settings?.periods_per_day ?? 0;
  const rows = React.useMemo(() => periodStats(d.days, per), [d.days, per]);
  const max = Math.max(1, ...rows.map((r) => r.absent + r.late));
  return (
    <Panel title="الغياب والتأخر حسب الحصة" subtitle="يساعد على معرفة الحصص التي يتكرر فيها الغياب" icon={BarChart3}>
      <ul className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={r.period} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-3 text-sm">
            <span className="font-semibold text-fg-muted">الحصة {formatNumber(r.period)}</span>
            <span className="flex h-3 overflow-hidden rounded-full bg-surface-sunken">
              <m.span className="h-full bg-[var(--chart-absent)]" initial={{ width: 0 }} animate={{ width: `${(r.absent / max) * 100}%` }} transition={{ duration: 0.8, ease: EASE_OUT, delay: i * 0.04 }} />
              <m.span className="h-full bg-[var(--chart-late)]" initial={{ width: 0 }} animate={{ width: `${(r.late / max) * 100}%` }} transition={{ duration: 0.8, ease: EASE_OUT, delay: i * 0.04 + 0.1 }} />
            </span>
            <span className="tabular text-end text-xs text-fg-muted">{formatNumber(r.absent)}{r.late > 0 && <> + {formatNumber(r.late)}</>}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-4 flex gap-4 text-xs text-fg-muted">
        <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--chart-absent)]" aria-hidden /> غياب</li>
        <li className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[var(--chart-late)]" aria-hidden /> تأخر</li>
      </ul>
    </Panel>
  );
}

type Filter = 'all' | 'absent' | 'late' | 'excused';
const FILTERS: [Filter, string][] = [['all', 'الكل'], ['absent', 'غياب'], ['late', 'تأخر'], ['excused', 'بعذر']];

function DayLog({ d }: { d: PortalData }) {
  const [filter, setFilter] = React.useState<Filter>('all');
  const [, setParams] = useSearchParams();
  const [limit, setLimit] = React.useState(12);
  const list = d.days.filter((x) => filter === 'all' || x.items.some((i) => i.status === filter));
  const shown = list.slice(0, limit);
  return (
    <Panel title="سجل الأيام" subtitle="أيام الغياب والتأخر بالتفصيل" icon={ListFilter}>
      <div role="radiogroup" aria-label="تصفية السجل" className="mb-3 inline-flex rounded-md border border-line bg-surface-sunken p-0.5">
        {FILTERS.map(([k, l]) => (
          <button key={k} role="radio" aria-checked={filter === k} onClick={() => { setFilter(k); setLimit(12); }} className={cn('h-8 rounded px-3 text-[0.8125rem] font-semibold text-fg-muted transition-colors', filter === k && 'bg-surface text-brand shadow-sm dark:text-link')}>
            {l}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <AllClear icon={CheckCircle2} title={filter === 'all' ? 'لا يوجد غياب أو تأخر مسجل' : 'لا توجد أيام بهذا التصنيف'} />
      ) : (
        <>
          <ul className="divide-y divide-line/70">
            {shown.map((x) => (
              <li key={x.day}>
                <button type="button" onClick={() => { setParams({ day: x.day }, { replace: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 py-3 text-start transition-colors hover:bg-surface-hover sm:px-1">
                  <span className="min-w-36">
                    <span className="block text-sm font-bold">{formatWeekday(x.day)}</span>
                    <span className="tabular block text-xs text-fg-muted">{formatDate(x.day)}</span>
                  </span>
                  <span className="flex flex-1 flex-wrap gap-1.5">
                    {summarizeDay(x, formatNumber).map((p) => (
                      <span key={p.status} className={cn('rounded-full border px-2.5 py-0.5 text-xs font-bold', KIND_STYLE[p.status === 'absent' ? 'absent' : p.status === 'late' ? 'late' : 'excused'].chip)}>
                        {p.status === 'absent' ? 'غياب' : p.status === 'late' ? 'تأخر' : 'بعذر'} · {p.periods}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {list.length > limit && (
            <Button variant="ghost" className="mt-2 w-full" onClick={() => setLimit((n) => n + 20)}>عرض المزيد ({formatNumber(list.length - limit)})</Button>
          )}
        </>
      )}
    </Panel>
  );
}

function Excuses({ d }: { d: PortalData }) {
  if (d.excuses.length === 0) return null;
  return (
    <Panel title="أعذار الغياب" subtitle="الأعذار المقدمة للمدرسة وقراراتها" icon={FileClock}>
      <ul className="space-y-2">
        {d.excuses.map((x, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-4 py-3">
            <span className="grid size-9 place-items-center rounded-lg bg-info-soft text-info"><FileClock className="size-[18px]" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{EXCUSE_REASON_LABELS[x.reason_type] ?? x.reason_type}</p>
              <p className="tabular text-xs text-fg-muted">{x.from === x.to ? formatDate(x.from) : `${formatDate(x.from)} – ${formatDate(x.to)}`}</p>
            </div>
            <Pill tone={x.status === 'approved' ? 'success' : x.status === 'rejected' ? 'danger' : 'warning'}>{EXCUSE_STATUS_TEXT[x.status]}</Pill>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function HowToRead({ d }: { d: PortalData }) {
  return (
    <Panel title="كيف تقرأ التقويم" icon={CalendarDays}>
      <ul className="space-y-3 text-sm">
        {(['present', 'partial', 'absent', 'late', 'excused'] as const).map((k) => (
          <li key={k} className="flex items-center gap-3">
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-md text-xs font-bold', KIND_STYLE[k].cell)} aria-hidden>{formatNumber(12)}</span>
            <span className="text-fg-muted">{DAY_KIND_LABELS[k]}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-fg-muted">
        {d.settings?.attendance_mode === 'period' ? `يُرصد الحضور في كل حصة (${formatNumber(d.settings.periods_per_day)} حصص يوميًا)، ويظهر هنا فور اعتماده.` : 'يُرصد الحضور يوميًا، ويظهر هنا فور اعتماده.'}
      </p>
    </Panel>
  );
}

export function PortalAttendance() {
  const d = usePortalData();
  return (
    <div>
      <PageTitle title="الحضور والغياب" subtitle={`العام الدراسي ${d.student.year_name ?? ''}`} />
      <div className="space-y-5">
        <Overview d={d} />
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="min-w-0 lg:col-span-3"><Calendar d={d} /></div>
          <div className="min-w-0 space-y-5 lg:col-span-2">
            {hasPeriodData(d) && <Periods d={d} />}
            <Excuses d={d} />
            {!hasPeriodData(d) && d.excuses.length === 0 && <HowToRead d={d} />}
          </div>
        </div>
        <DayLog d={d} />
      </div>
    </div>
  );
}
