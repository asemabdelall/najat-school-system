import * as React from 'react';
import { AlertDialog as A } from 'radix-ui';
import { AlertTriangle } from 'lucide-react';
import { Button } from './button';
import { Field } from './field';
import { Textarea } from './input';

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  /** When set, a reason textarea is shown and required (min 3 chars). */
  reasonLabel?: string;
  onConfirm: (reason: string) => void;
};

/** Confirmation for consequential actions, optionally capturing a reason. */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, tone = 'primary', loading, reasonLabel, onConfirm }: ConfirmDialogProps) {
  const [reason, setReason] = React.useState('');
  const reasonOk = !reasonLabel || reason.trim().length >= 3;
  React.useEffect(() => {
    if (!open) setReason('');
  }, [open]);
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-fade-in" />
        <A.Content className="fixed inset-x-3 top-[18vh] z-50 mx-auto max-w-md rounded-xl border border-line bg-surface-raised p-6 shadow-lg data-[state=open]:animate-scale-in">
          <div className="flex gap-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full ${tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand dark:text-link'}`}>
              <AlertTriangle className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <A.Title className="text-base font-bold text-fg-strong">{title}</A.Title>
              <A.Description asChild>
                <div className="mt-1 text-sm text-fg-muted">{description}</div>
              </A.Description>
            </div>
          </div>
          {reasonLabel && (
            <Field label={reasonLabel} htmlFor="confirm-reason" required className="mt-4" hint="مطلوب لتوثيق العملية في سجل التدقيق.">
              <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          <div className="mt-6 flex flex-wrap-reverse justify-end gap-2">
            <A.Cancel asChild>
              <Button variant="secondary" disabled={loading}>
                تراجع
              </Button>
            </A.Cancel>
            <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} disabled={!reasonOk} onClick={() => onConfirm(reason.trim())}>
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
