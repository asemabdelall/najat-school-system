import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import { toast } from 'sonner';
import { AlertTriangle, Archive, ArrowLeft, ArrowRight, CalendarPlus, CheckCircle2, ClipboardCheck, GraduationCap, Info, School } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Checkbox, Input, Select } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { supabase } from '@/lib/supabase';
import { errorMessage, unwrap } from '@/lib/errors';
import { formatDate, formatNumber } from '@/lib/format';
import { EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { suggestNextYear, type ClosePreview } from '@/lib/domain/academicYear';

const STEPS = ['مراجعة العام الحالي', 'العام الجديد', 'التأكيد'] as const;

function Stat({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: number; warn?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-3', warn && value > 0 ? 'border-warning-line bg-warning-soft' : 'border-line bg-surface')}>
      <span className={cn('grid size-9 shrink-0 place-items-center rounded-md [&_svg]:size-[18px]', warn && value > 0 ? 'bg-surface text-warning' : 'bg-brand-soft text-brand dark:text-link')}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-fg-muted">{label}</p>
        <p className="tabular text-lg font-bold text-fg-strong">{formatNumber(value)}</p>
      </div>
    </div>
  );
}

export function CloseYearWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState({ name: '', starts_on: '', ends_on: '', copyClasses: true, grade: '12', confirm: '' });

  const preview = useQuery({
    queryKey: ['academic-years', 'close-preview'],
    queryFn: async () => unwrap(await supabase.rpc('academic_year_close_preview')) as unknown as ClosePreview,
    enabled: open,
    staleTime: 0,
  });
  const p = preview.data;

  React.useEffect(() => {
    if (!open) return;
    setStep(0);
    setForm((f) => ({ ...f, confirm: '' }));
  }, [open]);
  React.useEffect(() => {
    if (p?.year_name) setForm((f) => (f.name ? f : { ...f, ...suggestNextYear(p.year_name, p.ends_on) }));
  }, [p?.year_name, p?.ends_on]);

  const close = useMutation({
    mutationFn: async () =>
      unwrap(
        await supabase.rpc('close_academic_year', {
          p_confirm_name: form.confirm.trim(),
          p_new_name: form.name.trim(),
          p_new_starts_on: form.starts_on,
          p_new_ends_on: form.ends_on,
          p_copy_classes: form.copyClasses,
          p_graduating_grade: Number(form.grade),
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries();
      toast.success(`انتهى العام ${p?.year_name}، وبدأ العام ${form.name.trim()}`);
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e), { duration: 8000 }),
  });

  const graduating = p ? Number(p.by_grade[form.grade] ?? 0) : 0;
  const others = p ? p.enrolled_students - graduating : 0;
  const datesError =
    !form.starts_on || !form.ends_on
      ? 'حدّد تاريخي البداية والنهاية'
      : form.ends_on <= form.starts_on
        ? 'تاريخ النهاية يجب أن يلي البداية'
        : p && form.starts_on <= p.ends_on
          ? `يجب أن يبدأ العام الجديد بعد ${formatDate(p.ends_on)}`
          : null;
  const step2Ok = form.name.trim().length >= 4 && !datesError;
  const confirmOk = Boolean(p) && form.confirm.trim() === p!.year_name;

  return (
    <Dialog open={open} onOpenChange={(o) => !close.isPending && onOpenChange(o)}>
      <DialogContent title="إنهاء العام الدراسي وبدء عام جديد" description="تُغلق سجلات العام الحالي للعرض فقط وتظهر في الأرشيف، ويبدأ عام جديد بسجلات منفصلة." size="lg">
        <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="خطوات الإنهاء">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col gap-1.5">
              <span className={cn('h-1.5 rounded-full transition-colors duration-300', i <= step ? '[background:var(--brand-gradient)]' : 'bg-surface-sunken')} aria-hidden />
              <span className={cn('text-xs font-semibold', i === step ? 'text-fg-strong' : 'text-fg-muted')} aria-current={i === step ? 'step' : undefined}>
                {formatNumber(i + 1)}. {s}
              </span>
            </li>
          ))}
        </ol>

        {preview.isPending ? <LoadingState rows={4} /> : preview.isError ? <ErrorState error={preview.error} onRetry={() => preview.refetch()} /> : !p?.year_id ? (
          <p className="rounded-lg border border-warning-line bg-warning-soft p-4 text-sm text-warning">لا يوجد عام دراسي حالي لإنهائه.</p>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <m.div key={step} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
              {step === 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-fg-muted">
                    العام <span className="ltr tabular font-bold text-fg">{p.year_name}</span> · من {formatDate(p.starts_on)} إلى {formatDate(p.ends_on)}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Stat icon={<GraduationCap />} label="الطلاب المسجلون" value={p.enrolled_students} />
                    <Stat icon={<School />} label="الفصول" value={p.classes} />
                    <Stat icon={<ClipboardCheck />} label="جلسات حضور غير معتمدة" value={p.draft_sessions} warn />
                    <Stat icon={<AlertTriangle />} label="ملاحظات سلوك قيد المراجعة" value={p.pending_incidents} warn />
                    <Stat icon={<Info />} label="متابعات مفتوحة" value={p.open_follow_ups} warn />
                    <Stat icon={<Info />} label="أعذار غياب معلقة" value={p.pending_excuses} warn />
                  </div>
                  {(p.draft_sessions > 0 || p.pending_incidents > 0 || p.open_follow_ups > 0 || p.pending_excuses > 0) && (
                    <p className="flex gap-2 rounded-lg border border-warning-line bg-warning-soft p-3 text-sm text-warning">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                      يُفضّل إنهاء العناصر المعلقة أولًا. بعد الإغلاق تبقى كما هي في الأرشيف ولا يمكن تعديلها.
                    </p>
                  )}
                </div>
              )}

              {step === 1 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="اسم العام الجديد" htmlFor="ny-name" required hint="مثال: 2027/2028" className="sm:col-span-2">
                    <Input dir="ltr" className="text-start" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </Field>
                  <Field label="تاريخ البداية" htmlFor="ny-start" required>
                    <Input type="date" value={form.starts_on} min={p.ends_on} onChange={(e) => setForm({ ...form, starts_on: e.target.value })} />
                  </Field>
                  <Field label="تاريخ النهاية" htmlFor="ny-end" required error={form.starts_on && form.ends_on ? (datesError ?? undefined) : undefined}>
                    <Input type="date" value={form.ends_on} min={form.starts_on || undefined} onChange={(e) => setForm({ ...form, ends_on: e.target.value })} />
                  </Field>
                  <Field label="صف التخرج" htmlFor="ny-grade" hint="طلاب هذا الصف يُسجَّلون «متخرجين».">
                    <Select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}>
                      {['10', '11', '12'].map((g) => <option key={g} value={g}>الصف {g}</option>)}
                    </Select>
                  </Field>
                  <label className="flex items-start gap-2 rounded-lg border border-line p-3 text-sm sm:mt-6">
                    <Checkbox checked={form.copyClasses} onChange={(e) => setForm({ ...form, copyClasses: e.target.checked })} className="mt-0.5" />
                    <span>
                      <span className="font-semibold">نسخ هيكل الفصول ({formatNumber(p.classes)} فصل)</span>
                      <span className="block text-xs text-fg-muted">الفصول نفسها (بدون طلاب أو معلمين) جاهزة لاستيراد قوائم العام الجديد.</span>
                    </span>
                  </label>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li className="flex gap-2"><Archive className="mt-0.5 size-4 shrink-0 text-brand dark:text-link" aria-hidden /> يُغلق العام <b className="ltr tabular">{p.year_name}</b> وتصبح كل سجلاته (حضور، سلوك، متابعة، جزاءات) للعرض فقط في الأرشيف.</li>
                    <li className="flex gap-2"><GraduationCap className="mt-0.5 size-4 shrink-0 text-brand dark:text-link" aria-hidden /> {formatNumber(graduating)} طالب في الصف {form.grade} يُسجَّلون متخرجين.</li>
                    <li className="flex gap-2"><Archive className="mt-0.5 size-4 shrink-0 text-brand dark:text-link" aria-hidden /> {formatNumber(others)} طالب آخر يُؤرشفون، ويعودون تلقائيًا عند استيرادهم في قوائم العام الجديد.</li>
                    <li className="flex gap-2"><CalendarPlus className="mt-0.5 size-4 shrink-0 text-brand dark:text-link" aria-hidden /> يبدأ العام <b className="ltr tabular">{form.name.trim()}</b> ({formatDate(form.starts_on)} – {formatDate(form.ends_on)}){form.copyClasses ? ` مع ${formatNumber(p.classes)} فصل` : ' بدون فصول'}.</li>
                  </ul>
                  <Field label={`للتأكيد اكتب اسم العام الحالي: ${p.year_name}`} htmlFor="ny-confirm" required>
                    <Input dir="ltr" className="text-start" autoComplete="off" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
                  </Field>
                </div>
              )}
            </m.div>
          </AnimatePresence>
        )}

        <DialogFooter>
          {step > 0 ? (
            <Button variant="secondary" onClick={() => setStep(step - 1)} disabled={close.isPending}><ArrowRight /> السابق</Button>
          ) : (
            <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
          )}
          {step < 2 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!p?.year_id || (step === 1 && !step2Ok)}>التالي <ArrowLeft /></Button>
          ) : (
            <Button variant="danger" disabled={!confirmOk} loading={close.isPending} onClick={() => close.mutate()}><CheckCircle2 /> إنهاء العام وبدء الجديد</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
