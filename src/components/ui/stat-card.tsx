import * as React from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { Skeleton } from './states';

export function StatCard({ label, value, hint, icon, tone = 'brand', to, loading }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info';
  to?: string;
  loading?: boolean;
}) {
  const tones = {
    brand: 'bg-brand-soft text-brand dark:text-link',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info',
  };
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.8125rem] font-semibold text-fg-muted">{label}</p>
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-md [&_svg]:size-[18px]', tones[tone])}>{icon}</span>
      </div>
      {loading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="tabular mt-1 text-2xl font-bold text-fg-strong">{value}</p>}
      {hint && <p className="mt-1 text-xs text-fg-muted">{hint}</p>}
    </>
  );
  const cls = 'block rounded-lg border border-line bg-surface p-4 shadow-sm';
  return to ? (
    <Link to={to} className={cn(cls, 'transition-shadow hover:border-line-strong hover:shadow-md')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
