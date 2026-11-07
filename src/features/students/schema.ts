import { z } from 'zod';
import { isValidCivilId, normalizeCivilId } from '@/lib/domain/civilId';

const phone = /^\+?[0-9 ]{7,20}$/;

export const studentSchema = z.object({
  student_number: z
    .string()
    .trim()
    .min(3, 'الرقم الطلابي يجب ألا يقل عن 3 خانات')
    .max(20, 'الرقم الطلابي طويل جدًا')
    .regex(/^[A-Za-z0-9-]+$/, 'يُسمح بالأحرف اللاتينية والأرقام والشرطة فقط'),
  civil_id: z
    .string()
    .trim()
    .refine((v) => v === '' || isValidCivilId(normalizeCivilId(v)), 'الرقم المدني غير صحيح (12 رقمًا)'),
  full_name: z.string().trim().min(3, 'اسم الطالب مطلوب (3 أحرف على الأقل)').max(120, 'الاسم طويل جدًا'),
  date_of_birth: z
    .string()
    .trim()
    .refine((v) => v === '' || (v >= '1990-01-01' && v <= '2020-12-31'), 'تاريخ الميلاد غير منطقي'),
  guardian_name: z.string().trim().max(120, 'الاسم طويل جدًا'),
  guardian_phone: z.string().trim().refine((v) => v === '' || phone.test(v), 'رقم الهاتف غير صالح'),
  notes: z.string().trim().max(2000, 'الملاحظات طويلة جدًا'),
  class_id: z.string(),
});

export type StudentFormValues = z.infer<typeof studentSchema>;
