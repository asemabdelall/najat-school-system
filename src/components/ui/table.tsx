import * as React from 'react';
import { m, type HTMLMotionProps } from 'motion/react';
import { cn } from '@/lib/utils';
import { rowItem, staggerContainer } from '@/lib/motion';

const rowsReveal = staggerContainer(0.018, 0);

/** Solid (non-glass) data table with sticky header and horizontal scroll. */
export function Table({ className, caption, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { caption?: string }) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-sm', className)} {...props}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {props.children}
      </table>
    </div>
  );
}
export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} className={cn('bg-surface-sunken', props.className)} />;
}
/** Body rows reveal in a quick stagger on mount (and when new rows arrive). */
export function TBody(props: HTMLMotionProps<'tbody'>) {
  return <m.tbody variants={rowsReveal} initial="hidden" animate="show" {...props} className={cn('[&_tr:last-child]:border-0', props.className)} />;
}
export function Tr({ className, ...props }: HTMLMotionProps<'tr'>) {
  return <m.tr variants={rowItem} className={cn('border-b border-line transition-colors', className)} {...props} />;
}
export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn('h-10 whitespace-nowrap px-4 text-start align-middle text-xs font-bold text-fg-muted', className)}
      {...props}
    />
  );
}
export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-2.5 align-middle', className)} {...props} />;
}
