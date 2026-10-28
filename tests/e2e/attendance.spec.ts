import { expect, test } from '@playwright/test';
import { CLASS, isSchoolDay, kwToday, login, serviceClient } from './fixtures';

test('teacher records attendance for an assigned class and it persists after refresh', async ({ page }) => {
  const today = kwToday();
  test.skip(!isSchoolDay(today), 'Today is a weekend in Kuwait; teacher back-dating window may not cover the last school day.');
  const classId = CLASS(11, 3);
  // Test setup: start from an empty session for this class/day (local DB only).
  const svc = serviceClient();
  await svc.from('attendance_sessions').delete().eq('class_id', classId).eq('session_date', today);

  await login(page, 'teacher1@najat.test');
  await page.goto(`/attendance/take?class=${classId}&date=${today}`);
  await expect(page.getByText('لم يبدأ الرصد').first()).toBeVisible();

  const rows = page.getByRole('list', { name: 'قائمة طلاب الجلسة' }).getByRole('listitem');
  const first = rows.first();
  const firstName = (await first.locator('p.font-semibold').innerText()).trim();
  await first.getByRole('radio', { name: 'غائب' }).click();
  await rows.nth(1).getByRole('radio', { name: 'متأخر' }).click();

  // Submit is blocked until everyone is marked (unmarked ≠ absent).
  await expect(page.getByRole('button', { name: 'اعتماد الحضور' })).toBeDisabled();
  await page.getByRole('button', { name: 'تحديد غير المرصودين حاضرين' }).click();
  await expect(page.getByRole('button', { name: 'اعتماد الحضور' })).toBeEnabled();
  await page.getByRole('button', { name: 'اعتماد الحضور' }).click();
  await expect(page.getByText('تم اعتماد الحضور')).toBeVisible();

  await page.reload();
  await expect(page.getByText(/الجلسة معتمدة/)).toBeVisible();
  const row = page.getByRole('list', { name: 'قائمة طلاب الجلسة' }).getByRole('listitem').filter({ hasText: firstName });
  await expect(row.getByRole('radio', { name: 'غائب' })).toHaveAttribute('aria-checked', 'true');
  await expect(rows.nth(1).getByRole('radio', { name: 'متأخر' })).toHaveAttribute('aria-checked', 'true');

  // Verify persistence directly in the database as well.
  const { data: session } = await svc.from('attendance_sessions').select('id, status, attendance_records(status)').eq('class_id', classId).eq('session_date', today).single();
  expect(session!.status).toBe('submitted');
  const statuses = (session!.attendance_records as { status: string }[]).map((r) => r.status);
  expect(statuses.filter((s) => s === 'absent')).toHaveLength(1);
  expect(statuses.filter((s) => s === 'late')).toHaveLength(1);
});

test('unsaved changes are protected when navigating away', async ({ page }) => {
  const day = kwToday();
  test.skip(!isSchoolDay(day));
  await login(page, 'affairs@najat.test');
  await page.goto(`/attendance/take?class=${CLASS(12, 3)}&date=${day}`);
  await page.getByRole('list', { name: 'قائمة طلاب الجلسة' }).getByRole('listitem').first().getByRole('radio', { name: 'حاضر' }).click();
  await page.getByRole('link', { name: 'الطلاب' }).first().click();
  await expect(page.getByText('لديك تغييرات غير محفوظة')).toBeVisible();
  await page.getByRole('button', { name: 'تراجع' }).click();
  await expect(page).toHaveURL(/attendance\/take/);
});
