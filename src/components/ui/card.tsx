import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-line bg-surface shadow-sm', className)} {...props} />;
}

export function CardHeader({ className, title, description, actions, icon }: {
  className?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-soft text-brand dark:text-link [&_svg]:size-5">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-base font-extrabold">{title}</h2>
          {description && <p className="text-sm text-fg-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 sm:p-6', className)} {...props} />;
}
