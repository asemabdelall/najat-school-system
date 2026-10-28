import * as React from 'react';
import { AlertCircle, Inbox, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/errors';
import { Button } from './button';

export function Spinner({ className, label = 'جارٍ التحميل' }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-fg-muted', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-hover', className)} />;
}

export function LoadingState({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5 p-5', className)} role="status" aria-label="جارٍ التحميل">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9" />
      ))}
      <span className="sr-only">جارٍ التحميل…</span>
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-surface-sunken text-fg-subtle [&_svg]:size-6">
        {icon ?? <Inbox />}
      </span>
      <p className="font-bold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className, title = 'تعذر تحميل البيانات' }: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <span className="mb-3 grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertCircle className="size-6" aria-hidden />
      </span>
      <p className="font-bold text-fg">{title}</p>
      <p className="mt-1 max-w-md text-sm text-fg-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          <RotateCcw /> إعادة المحاولة
        </Button>
      )}
    </div>
  );
}

/** Render loading / error / empty / content for a query in one place. */
export function QueryState<T>({ query, isEmpty, empty, loading, children }: {
  query: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  loading?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (query.isPending) return <>{loading ?? <LoadingState />}</>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data as T;
  if (isEmpty?.(data)) return <>{empty ?? <EmptyState title="لا توجد بيانات" />}</>;
  return <>{children(data)}</>;
}
