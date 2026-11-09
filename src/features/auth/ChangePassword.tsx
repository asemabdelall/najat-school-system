import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { toast } from 'sonner';
import { AlertCircle, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { errorMessage } from '@/lib/errors';
import { EASE_OUT, spring } from '@/lib/motion';
import { useDocumentTitle } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Logo } from '@/components/layout/Logo';

/** Same rule the admin Edge Function applies to temporary passwords. */
const newPassword = z
  .string()
  .min(10, 'كلمة المرور يجب أن تكون 10 أحرف على الأقل')
  .max(72, 'كلمة المرور طويلة جدًا')
  .regex(/[A-Za-z]/, 'يجب أن تحتوي على حرف إنجليزي واحد على الأقل')
  .regex(/[0-9]/, 'يجب أن تحتوي على رقم واحد على الأقل');

function schema(requireCurrent: boolean) {
  return z
    .object({
      current: requireCurrent ? z.string().min(1, 'أدخل كلمة المرور الحالية') : z.string(),
      password: newPassword,
      confirm: z.string(),
    })
    .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'كلمتا المرور غير متطابقتين' })
    .refine((v) => !requireCurrent || v.password !== v.current, { path: ['password'], message: 'اختر كلمة مرور مختلفة عن الحالية' });
}
type Values = { current: string; password: string; confirm: string };

function isSamePassword(e: unknown): boolean {
  return (e as { code?: string })?.code === 'same_password' || /different from the old/i.test((e as { message?: string })?.message ?? '');
}

function updateError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  const msg = (e as { message?: string })?.message ?? '';
  if (isSamePassword(e)) return 'اختر كلمة مرور مختلفة عن الحالية.';
  if (code === 'weak_password' || /weak|pwned|leaked/i.test(msg)) return 'كلمة المرور ضعيفة أو ظهرت في تسريبات معروفة. اختر كلمة أخرى.';
  if (code === 'reauthentication_needed') return 'يرجى تسجيل الخروج ثم الدخول مجددًا قبل تغيير كلمة المرور.';
  return errorMessage(e, 'تعذر تغيير كلمة المرور، يرجى المحاولة مرة أخرى.');
}

/**
 * New-password form. With `requireCurrent` the current password is checked
 * first (self-service change); after an admin-set temporary password the
 * user has just proven it by signing in, so it is not asked again.
 */
export function ChangePasswordForm({ requireCurrent, onDone }: { requireCurrent: boolean; onDone: () => void }) {
  const { profile, session, isStudent, refreshProfile } = useAuth();
  const queryClient = useQueryClient();
  // Student portal accounts have no staff profile: use the signed-in email.
  const email = profile?.email ?? session?.user.email ?? '';
  const [error, setError] = React.useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema(requireCurrent)), defaultValues: { current: '', password: '', confirm: '' } });
  const errs = form.formState.errors;

  const submit = form.handleSubmit(async (v) => {
    setError(null);
    if (requireCurrent) {
      const check = await supabase.auth.signInWithPassword({ email, password: v.current });
      if (check.error) {
        setError('كلمة المرور الحالية غير صحيحة.');
        return;
      }
    }
    const { error: upd } = await supabase.auth.updateUser({ password: v.password });
    // A student whose earlier attempt changed the password but did not reach
    // portal_password_changed() may re-enter the same new password: let the
    // server decide (it only clears the flag if the school password is gone).
    if (upd && !(isStudent && !requireCurrent && isSamePassword(upd))) {
      setError(updateError(upd));
      return;
    }
    // Staff clear profiles.must_change_password; student portal accounts
    // clear student_accounts.must_change_password, which gates portal_my_data().
    const { error: rpc } = await supabase.rpc(isStudent ? 'portal_password_changed' : 'password_changed');
    if (rpc) {
      setError(errorMessage(rpc));
      return;
    }
    if (isStudent) await queryClient.invalidateQueries({ queryKey: ['portal'] });
    else await refreshProfile();
    toast.success('تم تغيير كلمة المرور');
    form.reset();
    onDone();
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <AnimatePresence initial={false}>
        {error && (
          <m.p
            key={error}
            role="alert"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto', x: [0, -8, 7, -4, 0] }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            className="flex items-start gap-2 overflow-hidden rounded-md border border-danger-line bg-danger-soft p-3 text-sm font-semibold text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </m.p>
        )}
      </AnimatePresence>
      {/* Hidden username keeps password managers pointed at the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      {requireCurrent && (
        <Field label="كلمة المرور الحالية" htmlFor="pw-current" required error={errs.current?.message}>
          <Input type="password" autoComplete="current-password" dir="ltr" className="text-start" {...form.register('current')} />
        </Field>
      )}
      <Field label="كلمة المرور الجديدة" htmlFor="pw-new" required error={errs.password?.message} hint="10 أحرف على الأقل، تجمع حروفًا إنجليزية وأرقامًا.">
        <Input type="password" autoComplete="new-password" dir="ltr" className="text-start" {...form.register('password')} />
      </Field>
      <Field label="تأكيد كلمة المرور الجديدة" htmlFor="pw-confirm" required error={errs.confirm?.message}>
        <Input type="password" autoComplete="new-password" dir="ltr" className="text-start" {...form.register('confirm')} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
        <KeyRound /> حفظ كلمة المرور الجديدة
      </Button>
    </form>
  );
}

/** Self-service change from the account menu. */
export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="تغيير كلمة المرور" description="ستبقى مسجلًا على هذا الجهاز بعد التغيير." size="sm">
        <ChangePasswordForm requireCurrent onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PasswordGate({ title, children }: { title: string; children: React.ReactNode }) {
  const { signOut } = useAuth();
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <m.div className="mb-6 flex justify-center" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={spring.pop}>
          <Logo className="h-20" />
        </m.div>
        <m.div
          className="glass rounded-xl border p-6 shadow-lg sm:p-8"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring.sheet, delay: 0.1 }}
        >
          <h1 className="text-xl font-bold">{title}</h1>
          {children}
          <div className="mt-6">
            <ChangePasswordForm requireCurrent={false} onDone={() => {}} />
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mx-auto mt-5 flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg"
          >
            <LogOut className="size-4" aria-hidden /> تسجيل الخروج
          </button>
        </m.div>
      </div>
    </main>
  );
}

/** Full-screen gate shown after signing in with an admin-set temporary password. */
export function ForcePasswordChangePage() {
  useDocumentTitle('تعيين كلمة مرور جديدة');
  const { profile } = useAuth();
  return (
    <PasswordGate title="عيّن كلمة مرور خاصة بك">
      <p className="mt-1.5 text-sm text-fg-muted">
        مرحبًا {profile?.full_name}. كلمة المرور الحالية مؤقتة وضعتها إدارة النظام؛ اختر كلمة مرور جديدة لا يعرفها غيرك قبل المتابعة.
      </p>
    </PasswordGate>
  );
}

/**
 * Student portal: shown while the account still uses the password the school
 * issued. The server returns no student data until it is replaced.
 */
export function StudentPasswordChangePage() {
  useDocumentTitle('تعيين كلمة مرور جديدة');
  return (
    <PasswordGate title="عيّن كلمة مرور خاصة بك">
      <p className="mt-1.5 text-sm text-fg-muted">
        مرحبًا بك في بوابة ولي الأمر والطالب. قبل عرض بيانات الطالب، اختر كلمة مرور جديدة خاصة بك.
      </p>
      <div className="mt-4 flex items-start gap-2.5 rounded-md border border-info-line bg-info-soft p-3 text-sm text-info">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p className="leading-relaxed">
          هذا يحمي بيانات الطالب: كلمة المرور الحالية مشتركة وزّعتها المدرسة، ولن يمكن استخدامها للدخول إلى هذا الحساب بعد الآن. احتفظ بكلمة المرور الجديدة ولا تشاركها إلا مع ولي الأمر.
        </p>
      </div>
    </PasswordGate>
  );
}
