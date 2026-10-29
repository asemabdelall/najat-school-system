import * as React from 'react';
import { Dialog as D } from 'radix-ui';
import { AnimatePresence, m, useDragControls } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';
import { useMediaQuery } from '@/lib/hooks';

type DialogState = { open: boolean; setOpen: (open: boolean) => void };
const DialogCtx = React.createContext<DialogState>({ open: false, setOpen: () => {} });

/** Controlled dialog root; exposes open state so content can animate out. */
export function Dialog({ open = false, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ open, setOpen: (o: boolean) => onOpenChange?.(o) }), [open, onOpenChange]);
  return (
    <DialogCtx.Provider value={value}>
      <D.Root open={open} onOpenChange={onOpenChange}>
        {children}
      </D.Root>
    </DialogCtx.Provider>
  );
}
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/**
 * Centered dialog on tablet/desktop; draggable bottom sheet on phones
 * (the native-app pattern). Both animate in and out with springs.
 */
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
  const { open, setOpen } = React.useContext(DialogCtx);
  const sheet = useMediaQuery('(max-width: 639px)');
  const drag = useDragControls();
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size];

  return (
    <AnimatePresence>
      {open && (
        <D.Portal forceMount>
          <D.Overlay asChild forceMount>
            <m.div
              className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.18 } }}
            />
          </D.Overlay>
          <D.Content asChild forceMount onInteractOutside={onInteractOutside}>
            <m.div
              className={cn(
                'fixed z-50 flex flex-col overflow-hidden border border-line bg-surface-raised shadow-lg outline-none',
                sheet
                  ? 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-xl pb-[env(safe-area-inset-bottom)]'
                  : cn('inset-x-6 top-[6vh] mx-auto max-h-[88vh] rounded-xl', width),
                className,
              )}
              initial={sheet ? { y: '100%' } : { opacity: 0, y: 12, scale: 0.97 }}
              animate={sheet ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
              exit={sheet ? { y: '100%', transition: { duration: 0.22, ease: [0.65, 0, 0.35, 1] } } : { opacity: 0, y: 6, scale: 0.98, transition: { duration: 0.14 } }}
              transition={spring.sheet}
              drag={sheet ? 'y' : false}
              dragListener={false}
              dragControls={drag}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.7 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 110 || info.velocity.y > 650) setOpen(false);
              }}
            >
              {sheet && (
                <div
                  className="flex touch-none cursor-grab justify-center pb-1 pt-2.5 active:cursor-grabbing"
                  onPointerDown={(e) => drag.start(e)}
                  aria-hidden
                >
                  <span className="h-1.5 w-10 rounded-full bg-line-strong" />
                </div>
              )}
              <div className={cn('flex items-start justify-between gap-4 border-b border-line px-6', sheet ? 'pb-3 pt-1' : 'py-4')}>
                <div>
                  <D.Title className="text-base font-bold text-fg-strong">{title}</D.Title>
                  {description ? (
                    <D.Description className="mt-0.5 text-[0.8125rem] text-fg-muted">{description}</D.Description>
                  ) : (
                    <D.Description className="sr-only">{typeof title === 'string' ? title : ''}</D.Description>
                  )}
                </div>
                <D.Close className="-me-2 rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg" aria-label="إغلاق">
                  <X className="size-4" />
                </D.Close>
              </div>
              <div className="overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
            </m.div>
          </D.Content>
        </D.Portal>
      )}
    </AnimatePresence>
  );
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex flex-wrap-reverse items-center justify-end gap-2 border-t border-line pt-4', className)} {...props} />;
}
