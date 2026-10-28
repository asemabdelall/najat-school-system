import * as React from 'react';
import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  size = 'md',
  onInteractOutside,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  onInteractOutside?: (e: Event) => void;
}) {
  const width = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size];
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <D.Content
        onInteractOutside={onInteractOutside}
        className={cn(
          'fixed inset-x-3 top-[6vh] z-50 mx-auto flex max-h-[88vh] flex-col overflow-hidden rounded-xl border border-line bg-surface-raised shadow-lg data-[state=open]:animate-scale-in sm:inset-x-6',
          width,
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <D.Title className="text-base font-bold text-fg-strong">{title}</D.Title>
            {description ? (
              <D.Description className="mt-0.5 text-[0.8125rem] text-fg-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === 'string' ? title : ''}</D.Description>
            )}
          </div>
          <D.Close className="-me-2 rounded-md p-1.5 text-fg-muted hover:bg-surface-hover hover:text-fg" aria-label="إغلاق">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex flex-wrap-reverse items-center justify-end gap-2 border-t border-line pt-4', className)} {...props} />;
}
