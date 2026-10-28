import { cn } from '@/lib/utils';

/**
 * Official Al-Najat Schools logo (public/brand/alnajat-logo.png, 202×226).
 * Always rendered with its intrinsic aspect ratio and on a light plate so
 * the navy artwork keeps its contrast in dark mode.
 */
export function Logo({ className, variant = 'full' }: { className?: string; variant?: 'full' | 'mark' }) {
  const src = variant === 'full' ? '/brand/alnajat-logo.png' : '/brand/alnajat-mark.png';
  const ratio = variant === 'full' ? '202 / 226' : '75 / 226';
  return (
    <img
      src={src}
      alt={variant === 'full' ? 'شعار مدارس النجاة' : ''}
      aria-hidden={variant === 'mark' || undefined}
      style={{ aspectRatio: ratio }}
      className={cn('h-14 w-auto object-contain dark:rounded-md dark:bg-white dark:p-1', className)}
      draggable={false}
    />
  );
}
