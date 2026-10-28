import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { AlertOctagon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotFoundPage } from './ErrorPages';

/** Catches render errors so a failure in one page never blanks the app. */
export function RouteErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  if (import.meta.env.DEV) console.error(error);
  const chunkError = error instanceof Error && /dynamically imported module|Failed to fetch/i.test(error.message);
  return (
    <div role="alert" className="grid min-h-[50vh] place-items-center px-4 text-center">
      <div className="max-w-md">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
          <AlertOctagon className="size-6" aria-hidden />
        </span>
        <h1 className="text-xl font-bold">حدث خطأ أثناء عرض الصفحة</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {chunkError ? 'تم تحديث النظام. أعد تحميل الصفحة للحصول على أحدث نسخة.' : 'نعتذر عن ذلك. يمكنك إعادة تحميل الصفحة أو العودة للرئيسية.'}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>إعادة التحميل</Button>
          <Button asChild variant="secondary">
            <Link to="/">لوحة التحكم</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
