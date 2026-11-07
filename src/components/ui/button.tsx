import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-bold transition-[background-color,box-shadow,color,transform,filter] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 active:scale-[0.98] [&_svg]:size-[1.125rem] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-on-brand shadow-[0_6px_16px_-6px_rgb(0_77_114/0.55)] hover:bg-brand-strong hover:shadow-[0_8px_20px_-6px_rgb(0_77_114/0.6)]',
        accent: 'text-white shadow-[0_6px_16px_-6px_rgb(16_185_129/0.6)] [background:var(--brand-gradient)] hover:brightness-95',
        secondary: 'border border-line-strong bg-surface text-fg shadow-xs hover:border-fg-subtle/50 hover:bg-surface-hover',
        ghost: 'text-fg hover:bg-surface-hover',
        subtle: 'bg-brand-soft text-brand hover:brightness-95 dark:text-link',
        danger: 'bg-danger text-white shadow-sm hover:brightness-95 dark:text-slate-950',
        'danger-ghost': 'text-danger hover:bg-danger-soft',
        link: 'h-auto px-0 text-link underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3.5 text-sm [&_svg]:size-4',
        md: 'h-11 px-5 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10',
        'icon-sm': 'size-9 [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, type, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot.Root ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot.Root>
      );
    }
    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
