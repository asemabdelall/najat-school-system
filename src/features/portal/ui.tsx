import * as React from 'react';
import { Link, useOutletContext } from 'react-router';
import { m } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { formatPercent } from '@/lib/format';
import { EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { DAY_KIND_LABELS, type DayKind, type PortalData } from '@/lib/domain/portal';

export type PortalContext = { data: PortalData };

/** The signed-in student's data, loaded once by the portal shell. */
export function usePortalData(): PortalData {
  return useOutletContext<PortalContext>().data;
}

export const SCHOOL = 'ثانوية النجاة بنين – حولي';

/** Card used across portal pages: soft surface, optional header with an action link. */
export function Panel({
  title, subtitle, icon: Icon, action, className, bodyClassName, children,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ElementType;
  action?: { to: string; label: string };
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('rounded-xl border border-line bg-surface shadow-sm print:break-inside-avoid print:shadow-none', className)}>
      {title && (
        <header className="flex items-center gap-3 px-5 pb-1 pt-5">
          {Icon && (
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand dark:text-link">
              <Icon className="size-[18px]" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-[0.9375rem] font-bold leading-snug">{title}</h2>
            {subtitle && <p className="text-xs text-fg-muted">{subtitle}</p>}
          </div>
          {action && (
            <Link to={action.to} className="no-print group inline-flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-xs font-bold text-link hover:bg-surface-hover">
              {action.label}
              <ChevronLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden />
            </Link>
          )}
        </header>
      )}
      <div className={cn('p-5', title && 'pt-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Large page heading with an optional line under it. */
export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Attendance ring. The stroke draws in on mount; the number counts up.
 * `variant="onBrand"` is for the gradient hero (white on colour).
 */
export function RateRing({ rate, size = 132, stroke = 11, variant = 'default', label = 'نسبة الحضور' }: {
  rate: number | null;
  size?: number;
  stroke?: number;
  variant?: 'default' | 'onBrand';
  label?: string;
}) {
  const id = React.useId();
  const r = (size - stroke) / 2;
  const value = rate == null ? 0 : Math.max(0, Math.min(100, rate)) / 100;
  const onBrand = variant === 'onBrand';
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${rate == null ? 'لا يوجد' : formatPercent(rate)}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={onBrand ? 'stroke-white/20' : 'stroke-surface-sunken'} />
        {rate != null && (
          <m.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            stroke={onBrand ? '#ffffff' : `url(#${id})`}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: value }}
            transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.15 }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center leading-none">
        <span className={cn('text-[1.6rem] font-extrabold', onBrand ? 'text-white' : 'text-fg-strong')} style={{ fontSize: size / 5 }}>
          {rate == null ? '—' : <AnimatedNumber value={rate} format={formatPercent} />}
        </span>
        <span className={cn('mt-1.5 text-2xs font-semibold', onBrand ? 'text-white/75' : 'text-fg-muted')}>{rate == null ? 'لا يوجد رصد' : 'حضور'}</span>
      </div>
    </div>
  );
}

/** Colours for each kind of school day (calendar, legends, lists). */
export const KIND_STYLE: Record<DayKind, { cell: string; dot: string; chip: string }> = {
  present: { cell: 'bg-success-soft text-success', dot: 'bg-success', chip: 'bg-success-soft text-success border-success-line' },
  absent: { cell: 'bg-[var(--chart-absent)] text-white shadow-sm', dot: 'bg-[var(--chart-absent)]', chip: 'bg-danger-soft text-danger border-danger-line' },
  partial: { cell: 'bg-danger-soft text-danger ring-1 ring-inset ring-danger-line', dot: 'bg-danger/60', chip: 'bg-danger-soft text-danger border-danger-line' },
  late: { cell: 'bg-warning-soft text-warning ring-1 ring-inset ring-warning-line', dot: 'bg-[var(--chart-late)]', chip: 'bg-warning-soft text-warning border-warning-line' },
  excused: { cell: 'bg-info-soft text-info ring-1 ring-inset ring-info-line', dot: 'bg-[var(--chart-excused)]', chip: 'bg-info-soft text-info border-info-line' },
  none: { cell: 'text-fg-subtle', dot: 'bg-line-strong', chip: 'bg-neutral-soft text-neutral border-neutral-line' },
};

/** Friendly, positive empty state. */
export function AllClear({ icon: Icon, title, body }: { icon: React.ElementType; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <m.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 24 }}
        className="grid size-16 place-items-center rounded-2xl text-white shadow-md [background:var(--brand-gradient)]"
      >
        <Icon className="size-8" aria-hidden />
      </m.span>
      <p className="mt-4 font-bold text-fg-strong">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-fg-muted">{body}</p>}
    </div>
  );
}

/** Small rounded label. */
export function Pill({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'brand'; children: React.ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-neutral-soft text-neutral',
    success: 'bg-success-soft text-success',
    danger: 'bg-danger-soft text-danger',
    warning: 'bg-warning-soft text-warning',
    info: 'bg-info-soft text-info',
    brand: 'bg-brand-soft text-brand dark:text-link',
  };
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', tones[tone], className)}>{children}</span>;
}

export const WEEKDAY_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

/** Colour key for calendar days. */
export function Legend({ kinds = ['present', 'partial', 'absent', 'late', 'excused'] as const }: { kinds?: readonly (keyof typeof KIND_STYLE)[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-muted">
      {kinds.map((k) => (
        <li key={k} className="inline-flex items-center gap-1.5">
          <span className={cn('size-2.5 rounded-full', KIND_STYLE[k].dot)} aria-hidden /> {DAY_KIND_LABELS[k]}
        </li>
      ))}
    </ul>
  );
}

