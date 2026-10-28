import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/errors';
import type { AcademicYear, SchoolClass } from '@/lib/queries';
import { TRACK_LABELS, useSaveClass } from './api';

const schema = z.object({
  academic_year_id: z.string().min(1, 'العام الدراسي مطلوب'),
  grade_level: z.enum(['10', '11', '12']),
  section: z.string().trim().min(1, 'رقم/رمز الشعبة مطلوب').max(10),
  name: z.string().trim().min(1, 'اسم الفصل مطلوب').max(40),
  track: z.enum(['general', 'science', 'literary']),
  capacity: z.string().refine((v) => v === '' || (Number(v) >= 1 && Number(v) <= 60), 'السعة بين ١ و٦٠'),
  room: z.string().trim().max(40),
});
type Values = z.infer<typeof schema>;

export function ClassFormDialog({ open, onOpenChange, years, defaultYearId, editing }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  years: AcademicYear[];
  defaultYearId?: string;
  editing?: SchoolClass;
}) {
  const save = useSaveClass();
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const { errors, isSubmitting } = form.formState;
  React.useEffect(() => {
    if (!open) return;
    form.reset({
      academic_year_id: editing?.academic_year_id ?? defaultYearId ?? '',
      grade_level: String(editing?.grade_level ?? 10) as Values['grade_level'],
      section: editing?.section ?? '',
      name: editing?.name ?? '',
      track: (editing?.track as Values['track']) ?? 'general',
      capacity: editing?.capacity ? String(editing.capacity) : '30',
      room: editing?.room ?? '',
    });
  }, [open, editing, defaultYearId, form]);

  // Suggest "grade/section" as the class name.
  const grade = form.watch('grade_level');
  const section = form.watch('section');
  React.useEffect(() => {
    if (!editing && section) form.setValue('name', `${grade}/${section}`);
  }, [grade, section, editing, form]);

  const onSubmit = form.handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        id: editing?.id,
        academic_year_id: v.academic_year_id,
        grade_level: Number(v.grade_level),
        section: v.section,
        name: v.name,
        track: v.track,
        capacity: v.capacity ? Number(v.capacity) : null,
        room: v.room || null,
      });
      toast.success(editing ? 'تم حفظ الفصل' : 'تمت إضافة الفصل');
      onOpenChange(false);
    } catch (e) {
      const msg = errorMessage(e);
      if (/مكررة/.test(msg)) form.setError('section', { message: 'توجد شعبة بنفس الرقم لهذا الصف في العام المحدد' });
      else toast.error(msg);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? 'تعديل الفصل' : 'إضافة فصل'} size="md">
        <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
          <Field label="العام الدراسي" htmlFor="cls-year" required error={errors.academic_year_id?.message} className="sm:col-span-2">
            <Select disabled={Boolean(editing)} {...form.register('academic_year_id')}>
              {years.filter((y) => y.status !== 'closed').map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="الصف" htmlFor="cls-grade" required>
            <Select {...form.register('grade_level')}>
              {[10, 11, 12].map((g) => <option key={g} value={g}>الصف {g}</option>)}
            </Select>
          </Field>
          <Field label="الشعبة" htmlFor="cls-section" required error={errors.section?.message}>
            <Input {...form.register('section')} placeholder="1" />
          </Field>
          <Field label="اسم الفصل" htmlFor="cls-name" required error={errors.name?.message}>
            <Input {...form.register('name')} />
          </Field>
          <Field label="المسار" htmlFor="cls-track">
            <Select {...form.register('track')}>
              {Object.entries(TRACK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="السعة القصوى" htmlFor="cls-capacity" error={errors.capacity?.message}>
            <Input type="number" min={1} max={60} {...form.register('capacity')} />
          </Field>
          <Field label="القاعة" htmlFor="cls-room">
            <Input {...form.register('room')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" loading={isSubmitting}>{editing ? 'حفظ' : 'إضافة'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
