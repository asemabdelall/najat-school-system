import * as React from 'react';
import { Link } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { useDocumentTitle } from '@/lib/hooks';

export type Crumb = { label: string; to?: string };

export function PageHeader({ title, description, actions, breadcrumbs }: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
}) {
  useDocumentTitle(title);
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="مسار التنقل" className="no-print mb-1">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
              {breadcrumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-1">
                  {c.to ? (
                    <Link to={c.to} className="hover:text-link hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page">{c.label}</span>
                  )}
                  {i < breadcrumbs.length - 1 && <ChevronLeft className="size-3" aria-hidden />}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <h1 className="text-xl font-bold sm:text-[1.375rem]">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
