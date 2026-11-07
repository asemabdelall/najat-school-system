import * as React from 'react';
import { Link } from 'react-router';
import { m } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { riseItem } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { Skeleton } from './states';

const TONES = {
  brand: { icon: 'bg-brand text-white', glow: 'from-brand/10' },
  success: { icon: 'bg-success text-white dark:text-slate-950', glow: 'from-success/10' },
  warning: { icon: 'bg-[var(--chart-late)] text-white', glow: 'from-warning/10' },
  danger: { icon: 'bg-[var(--chart-absent)] text-white', glow: 'from-danger/10' },
  info: { icon: 'bg-[var(--chart-excused)] text-white', glow: 'from-info/10' },
} as const;

/** Big, glanceable figure: coloured icon tile, large number, label and hint. */
export function StatCard({ label, value, hint, icon, tone = 'brand', to, loading }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ReactNode;
  tone?: keyof typeof TONES;
  to?: string;
  loading?: boolean;
}) {
  const t = TONES[tone];
  const body = (
    <>
      <span className={cn('pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b to-transparent', t.glow)} aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl shadow-sm [&_svg]:size-[1.35rem]', t.icon)}>{icon}</span>
        {to && <ChevronLeft className="mt-1 size-4 text-fg-subtle transition-transform group-hover:-translate-x-0.5" aria-hidden />}
      </div>
      {loading ? (
        <Skeleton className="relative mt-4 h-9 w-24" />
      ) : (
        <p className="tabular relative mt-4 text-[2rem] font-extrabold leading-none tracking-tight text-fg-strong">{value}</p>
      )}
      <p className="relative mt-2 text-sm font-bold text-fg">{label}</p>
      {hint && <p className="relative mt-0.5 text-xs text-fg-muted">{hint}</p>}
    </>
  );
  const cls = 'group relative block h-full overflow-hidden rounded-lg border border-line bg-surface p-5 shadow-sm';
  // riseItem: animates when placed inside a <Stagger> parent.
  return (
    <m.div variants={riseItem} whileHover={to ? { y: -3 } : undefined} whileTap={to ? { scale: 0.985 } : undefined} className="h-full">
      {to ? (
        <Link to={to} className={cn(cls, 'transition-[box-shadow,border-color] duration-200 hover:border-line-strong hover:shadow-md')}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </m.div>
  );
}
