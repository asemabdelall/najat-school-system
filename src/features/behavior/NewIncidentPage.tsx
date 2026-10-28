import * as React from 'react';
import { useNavigate } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Send, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import { StudentPicker } from '@/components/StudentPicker';
import { useBehaviorCategories } from '@/lib/queries';
import { useUnsavedChanges } from '@/lib/hooks';
import { addDays, kuwaitToday } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { SEVERITY_LABELS, type Severity } from '@/lib/domain/behavior';
import { useSubmitIncident } from './api';

const schema = z.object({
  students: z.array(z.object({ id: z.string(), full_name: z.string(), student_number: z.string(), class_name: z.string().nullable() })).min(1, 'اختر طالبًا واحدًا على الأقل').max(20),
  category_id: z.string().min(1, 'اختر التصنيف'),
  incident_date: z.string().min(1, 'التاريخ مطلوب'),
  location: z.string().trim().max(120),
  severity: z.enum(['low', 'medium', 'high']),
  description: z.string().trim().min(10, 'صف الواقعة في ١٠ أحرف على الأقل').max(3000, 'الوصف طويل جدًا'),
});
type Values = z.infer<typeof schema>;

export function NewIncidentPage() {
  const navigate = useNavigate();
  const today = kuwaitToday();
  const categories = useBehaviorCategories();
  const submit = useSubmitIncident();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { students: [], category_id: '', incident_date: today, location: '', severity: 'low', description: '' },
  });
  const { errors, isDirty, isSubmitting, isSubmitSuccessful } = form.formState;
  const { blocker, release } = useUnsavedChanges(isDirty && !isSubmitSuccessful);
  const categoryId = form.watch('category_id');

  React.useEffect(() => {
    const cat = categories.data?.find((c) => c.id === categoryId);
    if (cat) form.setValue('severity', cat.default_severity as Severity);
  }, [categoryId, categories.data, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      const id = await submit.mutateAsync({
        category_id: v.category_id, incident_date: v.incident_date, location: v.location, description: v.description,
        severity: v.severity, student_ids: v.students.map((s) => s.id),
      });
      toast.success('تم رفع البلاغ وإحالته لشؤون الطلبة للمراجعة');
      release();
      navigate(`/behavior/${id}`, { replace: true });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  return (
    <>
      <PageHeader title="رفع بلاغ سلوكي" breadcrumbs={[{ label: 'السلوك الطلابي', to: '/behavior' }, { label: 'بلاغ جديد' }]} />
      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardContent>
            <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
              <Field label="الطالب / الطلاب المعنيون" htmlFor="inc-students" required noClone error={errors.students?.message} className="sm:col-span-2">
                <Controller control={form.control} name="students" render={({ field }) => (
                  <StudentPicker id="inc-students" multiple value={field.value} onChange={field.onChange} invalid={Boolean(errors.students)} describedBy={errors.students ? 'inc-students-error' : undefined} />
                )} />
              </Field>
              <Field label="التصنيف" htmlFor="inc-category" required error={errors.category_id?.message}>
                <Select {...form.register('category_id')}>
                  <option value="">اختر التصنيف</option>
                  {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="درجة الخطورة" htmlFor="inc-severity" required hint="تُقترح تلقائيًا حسب التصنيف ويمكن تعديلها.">
                <Select {...form.register('severity')}>
                  {Object.entries(SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="تاريخ الواقعة" htmlFor="inc-date" required error={errors.incident_date?.message}>
                <Input type="date" max={today} min={addDays(today, -60)} {...form.register('incident_date')} />
              </Field>
              <Field label="المكان" htmlFor="inc-location">
                <Input placeholder="مثال: الفصل، الساحة، المختبر" {...form.register('location')} />
              </Field>
              <Field label="وصف الواقعة" htmlFor="inc-description" required error={errors.description?.message} hint="صف ما حدث بموضوعية ودون أحكام أو استنتاجات." className="sm:col-span-2">
                <Textarea rows={6} {...form.register('description')} />
              </Field>
              <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
                <Button variant="secondary" onClick={() => navigate('/behavior')}>إلغاء</Button>
                <Button type="submit" loading={isSubmitting}><Send className="rtl:-scale-x-100" /> رفع البلاغ</Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <aside className="self-start rounded-lg border border-info-line bg-info-soft p-4 text-sm text-info">
          <p className="mb-2 flex items-center gap-2 font-bold"><ShieldCheck className="size-4" aria-hidden /> عن الخصوصية والمراجعة</p>
          <ul className="list-disc space-y-1.5 ps-5">
            <li>يُراجع البلاغ من شؤون الطلبة أو الإدارة، ولا يمكن لمقدمه اعتماده.</li>
            <li>يظهر البلاغ فقط لك وللمراجعين المخولين.</li>
            <li>لا يتخذ النظام أي قرار أو عقوبة تلقائية.</li>
          </ul>
        </aside>
      </div>
      <UnsavedChangesDialog blocker={blocker} />
    </>
  );
}
