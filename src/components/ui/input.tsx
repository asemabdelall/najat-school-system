import * as React from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

export const controlClass =
  'w-full rounded-md border border-line-strong bg-surface px-3.5 text-base text-fg shadow-xs transition-[border-color,box-shadow] placeholder:text-fg-subtle hover:border-fg-subtle/60 focus-visible:border-ring focus-visible:shadow-[0_0_0_4px_color-mix(in_srgb,var(--ring)_18%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:opacity-70 aria-[invalid=true]:border-danger';

const PICKER_TYPES = new Set(['date', 'time', 'datetime-local', 'month']);

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => {
    if (!PICKER_TYPES.has(type)) return <input ref={ref} type={type} className={cn(controlClass, 'h-11', className)} {...props} />;
    // Native pickers render differently per platform (iOS Safari ignores
    // width and centres the value). Normalise them and draw our own icon;
    // the whole field opens the picker (see .picker-input in index.css).
    const Icon = type === 'time' ? Clock : CalendarDays;
    return (
      <div className="relative w-full min-w-0">
        <input ref={ref} type={type} className={cn(controlClass, 'picker-input h-11 pe-10 tabular', className)} {...props} />
        <Icon className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
      </div>
    );
  },
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 4, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(controlClass, 'min-h-24 py-2.5 leading-relaxed', className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

/** Native select: fully accessible, keyboard friendly and RTL-correct. */
export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        controlClass,
        'h-11 appearance-none bg-[length:1.1rem] bg-no-repeat pe-10 [background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2364748b%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] [background-position:left_0.75rem_center]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} type="checkbox" className={cn('size-[1.125rem] cursor-pointer rounded border-line-strong accent-[var(--brand-navy)]', className)} {...props} />
  ),
);
Checkbox.displayName = 'Checkbox';
