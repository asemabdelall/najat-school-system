import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthProvider';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StudentPicker, type PickedStudent } from '@/components/StudentPicker';
import { useStaff } from '@/lib/queries';
import { errorMessage } from '@/lib/errors';
import { kuwaitToday } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/domain/permissions';
import { FOLLOW_UP_CATEGORY_LABELS, PRIORITY_LABELS } from '@/lib/domain/followups';
import { useCreateFollowUp, useUpdateFollowUp } from './api';

const schema = z.object({
  title: z.string().trim().min(3, 'العنوان مطلوب (٣ أحرف على الأقل)').max(160),
  description: z.string().trim().max(3000),
  category: z.string(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  assigned_to: z.string().min(1, 'اختر المسؤول عن المهمة'),
  due_date: z.string(),
  student: z.array(z.custom<PickedStudent>()).max(1),
});
type Values = z.infer<typeof schema>;

export type FollowUpPrefill = { student?: PickedStudent; incidentId?: string; category?: string; title?: string };

export function FollowUpFormDialog({ open, onOpenChange, prefill, editing, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  prefill?: FollowUpPrefill;
  editing?: { id: string; title: string; description: string | null; category: string; priority: string; assigned_to: string; due_date: string | null; student: PickedStudent | null };
  onSaved?: (id: string) => void;
}) {
  const { profile, isManager } = useAuth();
  const staff = useStaff();
  const create = useCreateFollowUp();
  const update = useUpdateFollowUp(editing?.id ?? '');
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const { errors, isSubmitting } = form.formState;

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      title: editing?.title ?? prefill?.title ?? '',
      description: editing?.description ?? '',
      category: editing?.category ?? prefill?.category ?? 'other',
      priority: (editing?.priority as Values['priority']) ?? 'normal',
      assigned_to: editing?.assigned_to ?? (isManager ? '' : (profile?.id ?? '')),
      due_date: editing?.due_date ?? '',
      student: editing?.student ? [editing.student] : prefill?.student ? [prefill.student] : [],
    });
  }, [open, editing, prefill, isManager, profile, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    const payload = {
      title: v.title, description: v.description || null, category: v.category, priority: v.priority,
      assigned_to: v.assigned_to, due_date: v.due_date || null, student_id: v.student[0]?.id ?? null,
    };
    try {
      if (editing) {
        await update.mutateAsync(payload);
        toast.success('تم حفظ المهمة');
        onSaved?.(editing.id);
      } else {
        const id = await create.mutateAsync({ ...payload, incident_id: prefill?.incidentId ?? null });
        toast.success('تم إنشاء المهمة وإشعار المسؤول');
        onSaved?.(id);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  const assignable = (staff.data ?? []).filter((s) => s.is_active && s.roles.length > 0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? 'تعديل مهمة المتابعة' : 'مهمة متابعة جديدة'} size="lg">
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="العنوان" htmlFor="fu-title" required error={errors.title?.message} className="sm:col-span-2">
            <Input {...form.register('title')} />
          </Field>
          <Field label="الطالب (اختياري)" htmlFor="fu-student" noClone className="sm:col-span-2">
            <Controller control={form.control} name="student" render={({ field }) => <StudentPicker id="fu-student" value={field.value ?? []} onChange={field.onChange} />} />
          </Field>
          <Field label="المسؤول" htmlFor="fu-assignee" required error={errors.assigned_to?.message} hint={!isManager ? 'يمكن للمعلم إنشاء مهام لنفسه فقط.' : undefined}>
            <Select disabled={!isManager} {...form.register('assigned_to')}>
              <option value="">اختر</option>
              {(isManager ? assignable : assignable.filter((s) => s.id === profile?.id)).map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} — {s.roles.map((r) => ROLE_LABELS[r]).join('، ')}</option>
              ))}
            </Select>
          </Field>
          <Field label="تاريخ الاستحقاق" htmlFor="fu-due">
            <Input type="date" min={editing ? undefined : kuwaitToday()} {...form.register('due_date')} />
          </Field>
          <Field label="التصنيف" htmlFor="fu-category">
            <Select {...form.register('category')}>
              {Object.entries(FOLLOW_UP_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="الأولوية" htmlFor="fu-priority">
            <Select {...form.register('priority')}>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="الوصف" htmlFor="fu-description" className="sm:col-span-2">
            <Textarea rows={4} {...form.register('description')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" loading={isSubmitting}>{editing ? 'حفظ' : 'إنشاء المهمة'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
