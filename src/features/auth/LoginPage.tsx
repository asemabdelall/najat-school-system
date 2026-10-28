import * as React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CalendarCheck2, Eye, EyeOff, Flag, ListChecks, LogIn } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { supabaseConfigured } from '@/lib/supabase';
import { useDocumentTitle } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/layout/Logo';

const schema = z.object({
  email: z.string().trim().min(1, 'البريد الإلكتروني مطلوب').email('صيغة البريد الإلكتروني غير صحيحة'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  useDocumentTitle('تسجيل الدخول');
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (auth.status === 'signed_in' && !auth.inactive) return <Navigate to={from} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await auth.signIn(values.email, values.password);
      navigate(from, { replace: true });
    } catch (e) {
      setServerError(errorMessage(e));
    }
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,34rem)]">
      {/* Form side (start = right in RTL) */}
      <main className="order-1 flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <Logo className="h-28" />
            <p className="mt-5 rounded-md px-4 py-1.5 text-sm font-semibold text-white shadow-sm [background:var(--brand-gradient)]">
              ثانوية النجاة بنين – حولي
            </p>
            <h1 className="mt-4 text-2xl font-bold">نظام الإدارة المدرسية</h1>
            <p className="mt-1 text-sm text-fg-muted">سجّل الدخول بحسابك الوظيفي للمتابعة</p>
          </div>

          <div className="glass rounded-xl border p-6 shadow-lg sm:p-8">
            {!supabaseConfigured && (
              <p role="alert" className="mb-4 rounded-md border border-warning-line bg-warning-soft p-3 text-sm text-warning">
                لم يتم ضبط اتصال قاعدة البيانات (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
              </p>
            )}
            {(auth.sessionExpired || auth.inactive) && !serverError && (
              <p role="status" className="mb-4 flex items-start gap-2 rounded-md border border-info-line bg-info-soft p-3 text-sm text-info">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {auth.inactive ? 'هذا الحساب غير مفعّل أو بلا صلاحيات. تواصل مع إدارة النظام.' : 'انتهت جلستك، يرجى تسجيل الدخول مجددًا.'}
              </p>
            )}
            {serverError && (
              <p role="alert" className="mb-4 flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft p-3 text-sm font-semibold text-danger">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {serverError}
              </p>
            )}
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <Field label="البريد الإلكتروني" htmlFor="email" error={form.formState.errors.email?.message}>
                <Input type="email" autoComplete="username" dir="ltr" className="text-start" placeholder="name@najat.edu.kw" {...form.register('email')} />
              </Field>
              <Field label="كلمة المرور" htmlFor="password" noClone error={form.formState.errors.password?.message}>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    dir="ltr"
                    className="!pl-10 text-start"
                    aria-invalid={form.formState.errors.password ? true : undefined}
                    aria-describedby={form.formState.errors.password ? 'password-error' : undefined}
                    {...form.register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute inset-y-0 end-0 grid w-10 place-items-center text-fg-muted hover:text-fg"
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
                <LogIn className="rtl:-scale-x-100" /> تسجيل الدخول
              </Button>
            </form>
            <p className="mt-5 text-center text-xs text-fg-muted">
              لا يوجد تسجيل ذاتي. تُنشأ الحسابات من قبل إدارة النظام فقط.
            </p>
          </div>
        </div>
      </main>

      {/* Brand panel — arch motif from the logo */}
      <aside className="relative order-2 hidden overflow-hidden p-10 lg:flex lg:items-end" aria-hidden>
        <div className="arch absolute inset-x-10 bottom-0 top-16 rounded-b-none [background:var(--brand-gradient-deep)]" />
        <div className="arch absolute inset-x-24 bottom-0 top-40 border-2 border-white/15" />
        <div className="relative z-10 mb-10 me-6 ms-16 text-white">
          <p className="text-3xl font-black leading-snug">
            إدارة يومية أوضح
            <br />
            لمدرسة أكثر انضباطًا
          </p>
          <ul className="mt-6 space-y-3 text-[0.9375rem] text-white/90">
            <li className="flex items-center gap-3"><CalendarCheck2 className="size-5 text-leaf" /> رصد الحضور والغياب واعتماده</li>
            <li className="flex items-center gap-3"><Flag className="size-5 text-leaf" /> بلاغات سلوكية بمسار مراجعة موثق</li>
            <li className="flex items-center gap-3"><ListChecks className="size-5 text-leaf" /> مهام متابعة واضحة المسؤولية والموعد</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
