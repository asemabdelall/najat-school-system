import { Spinner } from '@/components/ui/states';
import { Logo } from './Logo';

export function FullPageLoader() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-5">
        <Logo className="h-20" />
        <Spinner label="جارٍ تحميل النظام…" />
      </div>
    </div>
  );
}
