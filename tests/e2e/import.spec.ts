import { expect, test } from '@playwright/test';
import { login, serviceClient } from './fixtures';

test('student affairs imports students from a CSV, with per-row validation', async ({ page }) => {
  const svc = serviceClient();
  const tag = String(Date.now()).slice(-6);
  const ok1 = `IMP-${tag}-1`;
  const ok2 = `IMP-${tag}-2`;
  const { data: existing } = await svc.from('students').select('student_number').limit(1).single();
  const csv = [
    'الرقم الطلابي,اسم الطالب,الفصل,تاريخ الميلاد,هاتف ولي الأمر',
    `${ok1},طالب مستورد أول (تجريبي),١٠/١,15/03/2010,+965 5000 1111`,
    `${ok2},طالب مستورد ثان (تجريبي),,2011-01-20,`,
    `IMP-${tag}-3,طالب بفصل غير موجود,10/9,,`,
    `${existing!.student_number},طالب برقم مكرر,10/1,,`,
  ].join('\r\n');

  await login(page, 'affairs@najat.test');
  await page.goto('/students');
  await page.getByRole('link', { name: 'استيراد من ملف' }).click();
  await expect(page).toHaveURL(/\/students\/import/);
  await page.locator('input[type=file]').setInputFiles({ name: 'students.csv', mimeType: 'text/csv', buffer: Buffer.from(`﻿${csv}`, 'utf-8') });

  await expect(page.getByText('٤ صف: ٢ جاهز للاستيراد، ٢ به مشكلات لن يُستورد.')).toBeVisible();
  await expect(page.getByText('الفصل «10/9» غير موجود في العام الدراسي الحالي')).toBeVisible();
  await expect(page.getByText('الرقم الطلابي مسجل مسبقًا في النظام')).toBeVisible();
  await page.getByRole('button', { name: /استيراد ٢ طالب/ }).click();
  await expect(page.getByRole('heading', { name: 'تمت إضافة ٢ طالب' })).toBeVisible();

  const { data: rows } = await svc.from('students').select('id, student_number, date_of_birth, enrollments(class_id, status)').in('student_number', [ok1, ok2]);
  expect(rows).toHaveLength(2);
  const first = rows!.find((r) => r.student_number === ok1)!;
  expect(first.date_of_birth).toBe('2010-03-15');
  expect(first.enrollments).toEqual([{ class_id: 'c0000000-0000-4000-8026-000000000101', status: 'active' }]);

  const ids = rows!.map((r) => r.id);
  await svc.from('enrollments').delete().in('student_id', ids);
  await svc.from('students').delete().in('id', ids);
});
