import * as React from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, m, useAnimationControls } from 'motion/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, ArrowRight, CalendarCheck2, Eye, EyeOff, Flag, ListChecks, LogIn } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { errorMessage } from '@/lib/errors';
import { supabaseConfigured } from '@/lib/supabase';
import { useDocumentTitle } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Logo } from '@/components/layout/Logo';
import { EASE_OUT, spring } from '@/lib/motion';

const rise = (delay: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: EASE_OUT, delay },
});

/** Message that slides open and, when it is an error, gives a short shake. */
function Notice({ id, shake, children }: { id: string; shake?: boolean; children: React.ReactNode }) {
  const controls = useAnimationControls();
  React.useEffect(() => {
    if (shake) void controls.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.45 } });
  }, [id, shake, controls]);
  return (
    <m.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.28, ease: EASE_OUT }}
      className="overflow-hidden"
    >
      <m.div animate={controls} className="pb-4">
        {children}
      </m.div>
    </m.div>
  );
}

const FEATURES = [
  { Icon: CalendarCheck2, text: 'رصد الحضور والغياب واعتماده' },
  { Icon: Flag, text: 'بلاغات سلوكية بمسار مراجعة موثق' },
  { Icon: ListChecks, text: 'مهام متابعة واضحة المسؤولية والموعد' },
];

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
  const [attempt, setAttempt] = React.useState(0);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  if (auth.status === 'signed_in' && !auth.inactive) return <Navigate to={from} replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await auth.signIn(values.email, values.password);
      navigate(from, { replace: true });
    } catch (e) {
      setServerError(errorMessage(e));
      setAttempt((n) => n + 1);
    }
  });

  const notice = !supabaseConfigured ? 'config' : serverError ? 'error' : auth.sessionExpired || auth.inactive ? 'info' : null;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,34rem)]">
      {/* Form side (start = right in RTL) */}
      <main className="order-1 flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center text-center">
            <m.div initial={{ opacity: 0, scale: 0.82, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ ...spring.pop, delay: 0.05 }}>
              <Logo className="h-28" />
            </m.div>
            <m.p
              className="mt-5 rounded-md px-4 py-1.5 text-sm font-semibold text-white shadow-sm [background:var(--brand-gradient)]"
              initial={{ opacity: 0, clipPath: 'inset(0 0 0 100%)' }}
              animate={{ opacity: 1, clipPath: 'inset(0 0 0 0%)' }}
              transition={{ duration: 0.8, ease: EASE_OUT, delay: 0.25 }}
            >
              ثانوية النجاة بنين – حولي
            </m.p>
            <m.h1 className="mt-4 text-2xl font-bold" {...rise(0.35)}>
              نظام الإدارة المدرسية
            </m.h1>
            <m.p className="mt-1 text-sm text-fg-muted" {...rise(0.42)}>
              سجّل الدخول بحسابك الوظيفي للمتابعة
            </m.p>
          </div>

          <m.div
            className="glass rounded-xl border p-6 shadow-lg sm:p-8"
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...spring.sheet, delay: 0.45 }}
          >
            <AnimatePresence initial={false}>
              {notice === 'config' && (
                <Notice key="config" id="config">
                  <p role="alert" className="rounded-md border border-warning-line bg-warning-soft p-3 text-sm text-warning">
                    لم يتم ضبط اتصال قاعدة البيانات (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
                  </p>
                </Notice>
              )}
              {notice === 'info' && (
                <Notice key="info" id="info">
                  <p role="status" className="flex items-start gap-2 rounded-md border border-info-line bg-info-soft p-3 text-sm text-info">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {auth.inactive ? 'هذا الحساب غير مفعّل أو بلا صلاحيات. تواصل مع إدارة النظام.' : 'انتهت جلستك، يرجى تسجيل الدخول مجددًا.'}
                  </p>
                </Notice>
              )}
              {notice === 'error' && (
                <Notice key="error" id={`error-${attempt}`} shake>
                  <p role="alert" className="flex items-start gap-2 rounded-md border border-danger-line bg-danger-soft p-3 text-sm font-semibold text-danger">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {serverError}
                  </p>
                </Notice>
              )}
            </AnimatePresence>
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <m.div {...rise(0.6)}>
                <Field label="البريد الإلكتروني" htmlFor="email" error={form.formState.errors.email?.message}>
                  <Input type="email" autoComplete="username" dir="ltr" className="text-start" placeholder="name@najat.edu.kw" {...form.register('email')} />
                </Field>
              </m.div>
              <m.div {...rise(0.68)}>
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
                      <AnimatePresence mode="popLayout" initial={false}>
                        <m.span
                          key={showPassword ? 'hide' : 'show'}
                          initial={{ opacity: 0, rotate: -60, scale: 0.6 }}
                          animate={{ opacity: 1, rotate: 0, scale: 1 }}
                          exit={{ opacity: 0, rotate: 60, scale: 0.6 }}
                          transition={{ duration: 0.2 }}
                          className="grid place-items-center"
                        >
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </m.span>
                      </AnimatePresence>
                    </button>
                  </div>
                </Field>
              </m.div>
              <m.div {...rise(0.76)} whileTap={{ scale: 0.985 }}>
                <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
                  <LogIn className="rtl:-scale-x-100" /> تسجيل الدخول
                </Button>
              </m.div>
            </form>
            <m.p className="mt-5 text-center text-xs text-fg-muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
              لا يوجد تسجيل ذاتي. تُنشأ الحسابات من قبل إدارة النظام فقط.
            </m.p>
          </m.div>
          <m.div className="web-only mt-6 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
            <Link to="/welcome" className="group inline-flex items-center gap-1.5 text-sm font-semibold text-link hover:underline">
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden /> التعرّف على النظام
            </Link>
          </m.div>
        </div>
      </main>

      {/* Brand panel — arch motif from the logo, built up on load */}
      <aside className="relative order-2 hidden overflow-hidden p-10 lg:flex lg:items-end" aria-hidden>
        <m.div
          className="arch absolute inset-x-10 bottom-0 top-16 rounded-b-none [background:var(--brand-gradient-deep)]"
          style={{ transformOrigin: '50% 100%' }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.1, ease: EASE_OUT }}
        />
        <m.div
          className="arch absolute inset-x-24 bottom-0 top-40 border-2 border-white/15"
          style={{ transformOrigin: '50% 100%' }}
          initial={{ opacity: 0, scaleY: 0.6 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: 1.2, ease: EASE_OUT, delay: 0.35 }}
        />
        {/* Slow light inside the arch: the panel breathes, it never stops reading */}
        <m.div
          className="arch absolute inset-x-36 bottom-0 top-64 bg-white/[0.06]"
          style={{ transformOrigin: '50% 100%' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.55, 1], scaleY: [0.9, 1, 0.97, 1] }}
          transition={{ duration: 9, delay: 0.8, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' }}
        />
        <div className="relative z-10 mb-10 me-6 ms-16 text-white">
          <p className="text-3xl font-black leading-snug">
            {['إدارة يومية أوضح', 'لمدرسة أكثر انضباطًا'].map((line, i) => (
              <span key={line} className="block overflow-hidden pb-1">
                <m.span className="block" initial={{ y: '110%' }} animate={{ y: '0%' }} transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.55 + i * 0.1 }}>
                  {line}
                </m.span>
              </span>
            ))}
          </p>
          <ul className="mt-6 space-y-3 text-[0.9375rem] text-white/90">
            {FEATURES.map(({ Icon, text }, i) => (
              <m.li key={text} className="flex items-center gap-3" {...rise(0.85 + i * 0.1)}>
                <m.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring.pop, delay: 0.95 + i * 0.1 }}>
                  <Icon className="size-5 text-leaf" />
                </m.span>
                {text}
              </m.li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
