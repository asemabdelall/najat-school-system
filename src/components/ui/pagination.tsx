import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { Button } from './button';

export function Pagination({ page, pageSize, total, onPageChange }: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="التنقل بين الصفحات" className="no-print flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[0.8125rem] text-fg-muted">
      <p className="tabular">
        عرض {formatNumber(from)}–{formatNumber(to)} من {formatNumber(total)}
      </p>
      <div className="flex items-center gap-1">
        {/* In RTL "previous" points right. */}
        <Button variant="secondary" size="icon-sm" aria-label="الصفحة السابقة" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronRight />
        </Button>
        <span className="tabular min-w-16 text-center">
          {formatNumber(page)} / {formatNumber(pages)}
        </span>
        <Button variant="secondary" size="icon-sm" aria-label="الصفحة التالية" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          <ChevronLeft />
        </Button>
      </div>
    </nav>
  );
}
