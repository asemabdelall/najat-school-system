import * as React from 'react';
import { Tabs as T } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn('no-print inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface-sunken p-1', className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[0.8125rem] font-semibold text-fg-muted transition-colors hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-brand data-[state=active]:shadow-sm dark:data-[state=active]:text-link [&_svg]:size-4',
        className,
      )}
      {...props}
    />
  );
}
