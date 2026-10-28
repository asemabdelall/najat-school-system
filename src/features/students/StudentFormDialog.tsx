import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/errors';
import { blankToNull } from '@/lib/utils';
import { useClasses, useCurrentYear } from '@/lib/queries';
import type { Tables } from '@/lib/database.types';
import { studentSchema, type StudentFormValues } from './schema';
import { useCreateStudent, useUpdateStudent } from './api';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: Tables<'students'>;
  onCreated?: (id: string) => void;
};

export function StudentFormDialog({ open, onOpenChange, student, onCreated }: Props) {
  const editing = Boolean(student);
  const year = useCurrentYear();
  const classes = useClasses(year.data?.id ?? undefined);
  const create = useCreateStudent();
  const update = useUpdateStudent(student?.id ?? '');
  const defaults = React.useMemo<StudentFormValues>(
    () => ({
      student_number: student?.student_number ?? '',
      full_name: student?.full_name ?? '',
      date_of_birth: student?.date_of_birth ?? '',
      guardian_name: student?.guardian_name ?? '',
      guardian_phone: student?.guardian_phone ?? '',
      notes: student?.notes ?? '',
      class_id: '',
    }),
    [student],
  );
  const form = useForm<StudentFormValues>({ resolver: zodResolver(studentSchema), defaultValues: defaults });
  const { errors, isDirty, isSubmitting } = form.formState;

  React.useEffect(() => {
    if (open) form.reset(defaults);
  }, [open, defaults, form]);

  const requestClose = (next: boolean) => {
    if (!next && isDirty && !isSubmitting && !window.confirm('توجد تغييرات غير محفوظة. هل تريد الإغلاق دون حفظ؟')) return;
    onOpenChange(next);
  };

  const onSubmit = form.handleSubmit(async (v) => {
    const payload = {
      student_number: v.student_number.trim(),
      full_name: v.full_name.trim().replace(/\s+/g, ' '),
      date_of_birth: blankToNull(v.date_of_birth),
      guardian_name: blankToNull(v.guardian_name),
      guardian_phone: blankToNull(v.guardian_phone),
      notes: blankToNull(v.notes),
    };
    try {
      if (editing) {
        await update.mutateAsync(payload);
        toast.success('تم حفظ بيانات الطالب');
      } else {
        const id = await create.mutateAsync({ ...payload, class_id: blankToNull(v.class_id) });
        toast.success('تمت إضافة الطالب');
        onCreated?.(id);
      }
      form.reset(v);
      onOpenChange(false);
    } catch (e) {
      const msg = errorMessage(e);
      if (/الرقم الطلابي|مكررة/.test(msg)) form.setError('student_number', { message: 'الرقم الطلابي مستخدم لطالب آخر' });
      else toast.error(msg);
    }
  });

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent title={editing ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'} description="الحقول المعلّمة بـ * مطلوبة. اجمع فقط البيانات اللازمة للعمل المدرسي." size="lg">
        <form onSubmit={onSubmit} noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الاسم الكامل" htmlFor="full_name" required error={errors.full_name?.message} className="sm:col-span-2">
              <Input autoComplete="off" {...form.register('full_name')} />
            </Field>
            <Field label="الرقم الطلابي" htmlFor="student_number" required error={errors.student_number?.message} hint="مثال: NJ-2027-0101">
              <Input dir="ltr" className="text-start" autoComplete="off" {...form.register('student_number')} />
            </Field>
            <Field label="تاريخ الميلاد" htmlFor="date_of_birth" error={errors.date_of_birth?.message}>
              <Input type="date" {...form.register('date_of_birth')} />
            </Field>
            <Field label="اسم ولي الأمر" htmlFor="guardian_name" error={errors.guardian_name?.message}>
              <Input {...form.register('guardian_name')} />
            </Field>
            <Field label="هاتف ولي الأمر" htmlFor="guardian_phone" error={errors.guardian_phone?.message}>
              <Input type="tel" dir="ltr" className="text-start" placeholder="+965 ..." {...form.register('guardian_phone')} />
            </Field>
            {!editing && (
              <Field label={`الفصل (${year.data?.name ?? 'العام الحالي'})`} htmlFor="class_id" hint="يمكن التسجيل في فصل لاحقًا من ملف الطالب." className="sm:col-span-2">
                <Select {...form.register('class_id')}>
                  <option value="">— بدون تسجيل الآن —</option>
                  {classes.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      الصف {c.grade_level} – فصل {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="ملاحظات إدارية" htmlFor="notes" error={errors.notes?.message} className="sm:col-span-2">
              <Textarea rows={3} {...form.register('notes')} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => requestClose(false)} disabled={isSubmitting}>
              إلغاء
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? 'حفظ التغييرات' : 'إضافة الطالب'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
