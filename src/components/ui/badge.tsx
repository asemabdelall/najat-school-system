import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold leading-5 [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      tone: {
        success: 'border-success-line bg-success-soft text-success',
        danger: 'border-danger-line bg-danger-soft text-danger',
        warning: 'border-warning-line bg-warning-soft text-warning',
        info: 'border-info-line bg-info-soft text-info',
        neutral: 'border-neutral-line bg-neutral-soft text-neutral',
        brand: 'border-transparent bg-brand-soft text-brand dark:text-link',
        outline: 'border-line-strong bg-transparent text-fg-muted',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
