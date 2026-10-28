import type { Blocker } from 'react-router';
import { ConfirmDialog } from './confirm-dialog';

/** Shows when in-app navigation is blocked because of unsaved changes. */
export function UnsavedChangesDialog({ blocker }: { blocker: Blocker }) {
  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => !open && blocker.state === 'blocked' && blocker.reset()}
      title="لديك تغييرات غير محفوظة"
      description="إذا غادرت الصفحة الآن فستفقد التغييرات التي لم تُحفظ."
      confirmLabel="مغادرة دون حفظ"
      tone="danger"
      onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
    />
  );
}
