import { Link } from 'react-router';
import { Compass, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/lib/hooks';

function ErrorLayout({ icon, code, title, description }: { icon: React.ReactNode; code: string; title: string; description: string }) {
  useDocumentTitle(title);
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-16">
      <div className="max-w-md text-center">
        <div className="arch mx-auto mb-6 grid h-28 w-24 place-items-center rounded-b-xl text-white shadow-lg [background:var(--brand-gradient-deep)] [&_svg]:size-10">
          {icon}
        </div>
        <p className="tabular text-sm font-bold text-teal">{code}</p>
        <h1 className="mt-1 text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-fg-muted">{description}</p>
        <Button asChild className="mt-6">
          <Link to="/">العودة إلى لوحة التحكم</Link>
        </Button>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  return <ErrorLayout icon={<Compass aria-hidden />} code="404" title="الصفحة غير موجودة" description="ربما تم نقل الصفحة أو أن الرابط غير صحيح." />;
}

export function UnauthorizedPage() {
  return (
    <ErrorLayout
      icon={<ShieldAlert aria-hidden />}
      code="403"
      title="لا تملك صلاحية الوصول"
      description="هذه الصفحة غير متاحة لصلاحياتك الحالية. إذا كنت تعتقد أن هذا خطأ فتواصل مع إدارة النظام."
    />
  );
}
