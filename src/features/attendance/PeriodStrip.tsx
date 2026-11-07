import { m } from 'motion/react';
import { Check, CircleDashed, Hourglass, Loader } from 'lucide-react';
import { spring } from '@/lib/motion';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { COMPLETION_LABELS, type SessionCompletion } from '@/lib/domain/attendance';

export const COMPLETION_STYLE: Record<SessionCompletion, { dot: string; cell: string; icon: React.ElementType }> = {
  not_started: { dot: 'bg-line-strong', cell: 'border-dashed border-line-strong bg-surface text-fg-subtle', icon: CircleDashed },
  in_progress: { dot: 'bg-warning', cell: 'border-warning-line bg-warning-soft text-warning', icon: Loader },
  complete: { dot: 'bg-info', cell: 'border-info-line bg-info-soft text-info', icon: Hourglass },
  submitted: { dot: 'bg-success', cell: 'border-success-line bg-success-soft text-success', icon: Check },
};

/** Period picker: one pill per period, each showing that period's recording state. */
export function PeriodStrip({ periods, value, stateFor, onChange, idPrefix = 'period' }: {
  periods: number[];
  value: number;
  stateFor: (period: number) => SessionCompletion;
  onChange: (period: number) => void;
  idPrefix?: string;
}) {
  return (
    <div role="radiogroup" aria-label="الحصة" className="flex flex-wrap gap-2">
      {periods.map((p) => {
        const state = stateFor(p);
        const st = COMPLETION_STYLE[state];
        const Icon = st.icon;
        const on = p === value;
        return (
          <m.button
            key={p}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`الحصة ${p}: ${COMPLETION_LABELS[state]}`}
            title={COMPLETION_LABELS[state]}
            onClick={() => onChange(p)}
            whileTap={{ scale: 0.95 }}
            className={cn(
              'relative flex h-16 w-16 flex-col items-center justify-center rounded-xl border text-sm font-bold transition-colors sm:w-[4.5rem]',
              on ? 'border-transparent text-white' : st.cell,
            )}
          >
            {on && <m.span layoutId={`${idPrefix}-pill`} transition={spring.indicator} className="absolute inset-0 rounded-xl shadow-md [background:var(--brand-gradient)]" aria-hidden />}
            <span className="relative text-xs font-bold opacity-80">الحصة</span>
            <span className="relative mt-0.5 flex items-center gap-1 tabular text-lg leading-none">
              {formatNumber(p)}
              <Icon className={cn('size-4', on && 'text-white')} aria-hidden />
            </span>
          </m.button>
        );
      })}
    </div>
  );
}

export function CompletionLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted" aria-label="مفتاح الحالات">
      {(Object.keys(COMPLETION_STYLE) as SessionCompletion[]).map((s) => {
        const Icon = COMPLETION_STYLE[s].icon;
        return (
          <li key={s} className="flex items-center gap-1.5">
            <span className={cn('grid size-5 place-items-center rounded-md border', COMPLETION_STYLE[s].cell)}><Icon className="size-3" aria-hidden /></span>
            {COMPLETION_LABELS[s]}
          </li>
        );
      })}
    </ul>
  );
}
