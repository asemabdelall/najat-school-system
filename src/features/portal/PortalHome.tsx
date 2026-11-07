import * as React from 'react';
import { Link } from 'react-router';
import { m } from 'motion/react';
import {
  AlertTriangle, CalendarClock, CalendarDays, CalendarX2, CheckCircle2, ChevronLeft, Clock, Compass, FileClock, FileSignature, Flag,
  GraduationCap, Lock, Sparkles, UserX,
} from 'lucide-react';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { Stagger, StaggerItem } from '@/components/motion/Stagger';
import { addDays, formatDate, formatDateTime, formatNumber, formatShortDate, formatWeekday, isSchoolDay, kuwaitToday, weekday } from '@/lib/format';
import { cn } from '@/lib/utils';
import { careerLabel } from '@/lib/domain/career';
import { DISCIPLINE_TYPE_LABELS } from '@/lib/domain/discipline';
import { SEVERITY_LABELS } from '@/lib/domain/behavior';
import {
  ATTENDANCE_TONE_TEXT, DAY_KIND_LABELS, activityFeed, attendanceTone, dayKind, greeting, portalAlerts, summarizeDay, type FeedItem, type PortalAlert, type PortalData,
} from '@/lib/domain/portal';
import { KIND_STYLE, Legend, Panel, RateRing, WEEKDAY_SHORT, usePortalData } from './ui';

function Hero({ d }: { d: PortalData }) {
  const s = d.student;
  const tone = attendanceTone(d.attendance.rate);
  const [hello] = React.useState(() => greeting());
  return (
    <m.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl text-white shadow-lg [background:var(--brand-gradient-deep)]"
    >
      {/* Arch motif from the logo */}
      <span className="arch pointer-events-none absolute -bottom-24 end-[8%] h-64 w-44 border-2 border-white/10" aria-hidden />
      <span className="arch pointer-events-none absolute -bottom-24 end-[22%] h-48 w-28 bg-white/[0.05]" aria-hidden />
      <span className="pointer-events-none absolute -top-20 start-[-10%] size-72 rounded-full bg-teal/30 blur-3xl" aria-hidden />

      <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:p-7">
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15">
            <Sparkles className="size-3.5 text-leaf" aria-hidden /> {hello}
          </p>
          <h1 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-[1.75rem]">{s.full_name}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/12 px-2.5 py-1 ring-1 ring-white/15">
              <GraduationCap className="size-3.5" aria-hidden /> {s.class_name ? `الصف ${s.class_name}` : 'غير مسجل في فصل'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/12 px-2.5 py-1 ring-1 ring-white/15">
              <CalendarDays className="size-3.5" aria-hidden /> العام الدراسي <span className="tabular">{s.year_name}</span>
            </span>
          </div>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-white/85">
            {d.attendance.recorded_days > 0
              ? <>{ATTENDANCE_TONE_TEXT[tone]}، رُصد الحضور في <b className="tabular text-white">{formatNumber(d.attendance.recorded_days)}</b> يومًا دراسيًا حتى الآن.</>
              : 'مرحبًا بك في بوابة الطالب. ستظهر هنا متابعة الحضور والسلوك أولًا بأول.'}
          </p>
        </div>
        <div className="flex items-center justify-center sm:justify-end">
          <RateRing rate={d.attendance.rate} variant="onBrand" size={148} stroke={12} />
        </div>
      </div>
    </m.section>
  );
}

const ALERT_STYLE = {
  danger: { box: 'border-danger-line bg-danger-soft', icon: 'bg-[var(--chart-absent)] text-white', title: 'text-danger' },
  warning: { box: 'border-warning-line bg-warning-soft', icon: 'bg-[var(--chart-late)] text-white', title: 'text-warning' },
  info: { box: 'border-info-line bg-info-soft', icon: 'bg-[var(--chart-excused)] text-white', title: 'text-info' },
} as const;
const ALERT_ICON = { suspension: UserX, summons: CalendarClock, pledge: FileSignature, excuses: FileClock } as const;

function AlertCard({ a }: { a: PortalAlert }) {
  const st = ALERT_STYLE[a.tone];
  const Icon = ALERT_ICON[a.kind];
  return (
    <Link to={a.kind === 'excuses' ? '/portal/attendance' : '/portal/actions'} className={cn('group flex items-start gap-3 rounded-xl border p-4 transition-shadow hover:shadow-md', st.box)}>
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-lg shadow-sm', st.icon)}><Icon className="size-5" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className={cn('font-bold', st.title)}>{a.title}</p>
        {a.kind === 'summons' && a.at && (
          <p className="mt-0.5 text-sm text-fg">
            <span className="tabular font-semibold">{formatDateTime(a.at)}</span>
            {a.meetingWith && <> · مع {a.meetingWith}</>}
          </p>
        )}
        {a.kind === 'suspension' && a.at && a.until && a.returnOn && (
          <p className="mt-0.5 text-sm text-fg">
            من <span className="tabular">{formatDate(a.at)}</span> إلى <span className="tabular">{formatDate(a.until)}</span> · العودة يوم {formatWeekday(a.returnOn)}
          </p>
        )}
        {a.kind === 'excuses' && <p className="mt-0.5 text-sm text-fg">{a.count === 1 ? 'عذر واحد' : a.count === 2 ? 'عذران' : `${formatNumber(a.count ?? 0)} أعذار`} بانتظار قرار المدرسة</p>}
        {a.reason && <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">{a.reason}</p>}
      </div>
      <ChevronLeft className="mt-2 size-4 shrink-0 text-fg-subtle transition-transform group-hover:-translate-x-0.5" aria-hidden />
    </Link>
  );
}

function Stat({ to, icon: Icon, label, value, hint, tone }: { to: string; icon: React.ElementType; label: string; value: number | null; hint: string; tone: 'brand' | 'danger' | 'warning' | 'success' }) {
  const tones = {
    brand: 'bg-brand-soft text-brand dark:text-link',
    danger: 'bg-danger-soft text-danger',
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
  };
  return (
    <StaggerItem className="h-full">
      <m.div whileHover={{ y: -3 }} whileTap={{ scale: 0.985 }} className="h-full">
        <Link to={to} className="flex h-full flex-col rounded-xl border border-line bg-surface p-4 shadow-sm transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-md">
          <span className={cn('grid size-10 place-items-center rounded-lg', tones[tone])}><Icon className="size-5" aria-hidden /></span>
          <p className="mt-3 text-[1.75rem] font-extrabold leading-none text-fg-strong"><AnimatedNumber value={value} /></p>
          <p className="mt-1.5 text-sm font-bold">{label}</p>
          <p className="text-xs text-fg-muted">{hint}</p>
        </Link>
      </m.div>
    </StaggerItem>
  );
}

/** The last ten school days at a glance. */
function RecentDays({ d }: { d: PortalData }) {
  const today = kuwaitToday();
  const recorded = React.useMemo(() => new Set(d.recorded_dates ?? []), [d.recorded_dates]);
  const byDay = React.useMemo(() => new Map(d.days.map((x) => [x.day, x])), [d.days]);
  const per = d.settings?.periods_per_day ?? 7;
  const days = React.useMemo(() => {
    const out: string[] = [];
    let cur = today;
    while (out.length < 10) {
      if (isSchoolDay(cur)) out.unshift(cur);
      cur = addDays(cur, -1);
    }
    return out;
  }, [today]);
  return (
    <Panel title="آخر 10 أيام دراسية" subtitle="كل يوم بلونه، اضغط لعرض التفاصيل في صفحة الحضور" icon={CalendarDays} action={{ to: '/portal/attendance', label: 'التقويم الكامل' }}>
      <ol className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {days.map((date, i) => {
          const kind = dayKind(byDay.get(date), recorded.has(date), per);
          return (
            <m.li key={date} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * i }}>
              <Link
                to={`/portal/attendance?day=${date}`}
                className={cn('flex aspect-square flex-col items-center justify-center rounded-lg text-center transition-transform hover:scale-105', KIND_STYLE[kind].cell, kind === 'none' && 'border border-dashed border-line', date === today && 'outline outline-2 outline-offset-2 outline-teal')}
                title={`${formatWeekday(date)} ${formatDate(date)}: ${DAY_KIND_LABELS[kind]}`}
                aria-label={`${formatWeekday(date)} ${formatDate(date)}: ${DAY_KIND_LABELS[kind]}`}
              >
                <span className="text-2xs font-semibold opacity-80">{WEEKDAY_SHORT[weekday(date)]}</span>
                <span className="tabular text-base font-extrabold leading-tight">{formatShortDate(date).split(' ')[0]}</span>
              </Link>
            </m.li>
          );
        })}
      </ol>
      <Legend />
    </Panel>
  );
}

function FeedRow({ f }: { f: FeedItem }) {
  let icon: React.ElementType = CalendarX2;
  let color = 'bg-danger-soft text-danger';
  let title: React.ReactNode = '';
  let body: React.ReactNode = null;
  let to = '/portal/attendance';
  if (f.kind === 'day') {
    const parts = summarizeDay(f.day, formatNumber);
    const main = parts[0]?.status ?? 'absent';
    icon = main === 'late' ? Clock : main === 'excused' ? FileClock : CalendarX2;
    color = main === 'late' ? 'bg-warning-soft text-warning' : main === 'excused' ? 'bg-info-soft text-info' : 'bg-danger-soft text-danger';
    title = main === 'late' ? 'تأخر عن الحضور' : main === 'excused' ? 'غياب بعذر' : 'غياب';
    body = parts.map((p) => p.periods).join(' · ');
    to = `/portal/attendance?day=${f.day.day}`;
  } else if (f.kind === 'behavior') {
    icon = Flag;
    color = 'bg-warning-soft text-warning';
    title = `ملاحظة سلوكية: ${f.item.category}`;
    body = `الدرجة ${SEVERITY_LABELS[f.item.severity]}${f.item.status === 'resolved' ? ' · تمت معالجتها' : ''}`;
    to = '/portal/behavior';
  } else if (f.kind === 'action') {
    icon = f.item.type === 'suspension' ? UserX : f.item.type === 'pledge' ? FileSignature : CalendarClock;
    color = f.item.type === 'suspension' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand dark:text-link';
    title = DISCIPLINE_TYPE_LABELS[f.item.type];
    body = f.item.reason;
    to = '/portal/actions';
  } else {
    icon = Compass;
    color = 'bg-success-soft text-success';
    title = 'أدّى اختبار الميول المهنية';
    to = '/portal/profile';
  }
  const Icon = icon;
  return (
    <li>
      <Link to={to} className="group flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-hover">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', color)}><Icon className="size-[18px]" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{title}</p>
          {body && <p className="truncate text-xs text-fg-muted">{body}</p>}
        </div>
        <span className="tabular shrink-0 pt-0.5 text-xs text-fg-subtle">{formatShortDate(f.date)}</span>
      </Link>
    </li>
  );
}

function Activity({ d }: { d: PortalData }) {
  const feed = React.useMemo(() => activityFeed(d).slice(0, 6), [d]);
  return (
    <Panel title="آخر المستجدات" subtitle="الغياب والسلوك والإجراءات بترتيب زمني" icon={Clock}>
      {feed.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg bg-success-soft px-4 py-3 text-sm font-semibold text-success">
          <CheckCircle2 className="size-4" aria-hidden /> لا توجد مستجدات، سجل الطالب نظيف حتى الآن
        </p>
      ) : (
        <ul className="-mx-2 divide-y divide-line/60">{feed.map((f, i) => <FeedRow key={`${f.kind}-${f.date}-${i}`} f={f} />)}</ul>
      )}
    </Panel>
  );
}

function CareerTeaser({ d }: { d: PortalData }) {
  const c = d.career;
  return (
    <Link to="/portal/profile" className="group relative block overflow-hidden rounded-xl p-5 text-white shadow-md [background:var(--brand-gradient)]">
      <span className="arch pointer-events-none absolute -bottom-10 -start-4 h-28 w-20 border-2 border-white/20" aria-hidden />
      <div className="relative">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold text-white/85"><Compass className="size-4" aria-hidden /> الميول المهنية</p>
        {c ? (
          <>
            <p className="mt-2 text-sm text-white/85">أعلى ميل لدى الطالب</p>
            <p className="text-2xl font-extrabold">{careerLabel(c.top_1)}</p>
            <p className="mt-1 text-xs text-white/80">يليه {careerLabel(c.top_2)} ثم {careerLabel(c.top_3)}</p>
          </>
        ) : (
          <p className="mt-2 text-sm font-semibold">لم يؤدِّ الطالب اختبار الميول المهنية بعد</p>
        )}
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold">التفاصيل <ChevronLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden /></span>
      </div>
    </Link>
  );
}

export function PortalHome() {
  const d = usePortalData();
  const today = kuwaitToday();
  const [now] = React.useState(() => Date.now());
  const alerts = React.useMemo(() => portalAlerts(d, today, now), [d, today, now]);
  const a = d.attendance;
  return (
    <div className="space-y-5">
      <Hero d={d} />

      {d.student.year_closed && (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-neutral-line bg-neutral-soft px-4 py-3 text-sm text-neutral">
          <Lock className="size-4 shrink-0" aria-hidden /> انتهى العام الدراسي {d.student.year_name}، والبيانات المعروضة نهائية.
        </p>
      )}

      {alerts.length > 0 && (
        <section aria-labelledby="alerts-h">
          <h2 id="alerts-h" className="mb-2.5 flex items-center gap-2 text-sm font-bold text-fg-muted">
            <AlertTriangle className="size-4 text-warning" aria-hidden /> تحتاج انتباهك
          </h2>
          <Stagger className={cn('grid gap-3 md:grid-cols-2', alerts.length >= 3 && 'xl:grid-cols-3')}>
            {alerts.map((x) => <StaggerItem key={x.key}><AlertCard a={x} /></StaggerItem>)}
          </Stagger>
        </section>
      )}

      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat to="/portal/attendance" icon={CalendarX2} tone="danger" label="أيام الغياب" value={a.absent_days} hint={`${formatNumber(a.absent)} حصة غياب`} />
        <Stat to="/portal/attendance" icon={Clock} tone="warning" label="مرات التأخر" value={a.late} hint="خلال العام الحالي" />
        <Stat to="/portal/behavior" icon={Flag} tone={d.behavior.length ? 'warning' : 'success'} label="ملاحظات سلوكية" value={d.behavior.length} hint={d.behavior.length ? 'بعد مراجعة الإدارة' : 'سجل نظيف'} />
        <Stat to="/portal/actions" icon={FileSignature} tone={d.discipline.length ? 'brand' : 'success'} label="إجراءات وجزاءات" value={d.discipline.length} hint={d.discipline.length ? 'استدعاء وتعهد وفصل' : 'لا توجد إجراءات'} />
      </Stagger>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-w-0 space-y-5 lg:col-span-2">
          <RecentDays d={d} />
          <Activity d={d} />
        </div>
        <div className="min-w-0 space-y-5">
          <CareerTeaser d={d} />
          <Panel title="للتواصل مع المدرسة" icon={GraduationCap}>
            <p className="text-sm leading-relaxed text-fg-muted">
              لأي استفسار عن الحضور أو السلوك أو الإجراءات، تواصل مع شؤون الطلبة أو الأخصائي الاجتماعي في {d.school ?? 'المدرسة'}.
            </p>
            <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-fg-muted">تُحدَّث البيانات تلقائيًا كلما سجّلت المدرسة جديدًا.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
