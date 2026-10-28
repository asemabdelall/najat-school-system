import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { CLASS, kwToday, login, serviceClient } from './fixtures';

test('filtered report totals match the CSV export and the database', async ({ page }) => {
  const to = kwToday();
  const from = `${to.slice(0, 7)}-01`;
  const classId = CLASS(10, 1);
  await login(page, 'affairs@najat.test');
  await page.goto(`/reports?tab=students&from=${from}&to=${to}&class=${classId}`);
  const totals = page.getByTestId('report-totals');
  await expect(totals).toBeVisible();
  const cells = await totals.locator('td').allInnerTexts();
  const toInt = (s: string) => Number(s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^\d]/g, ''));
  const [present, late, absent, excused, marked] = cells.slice(1, 6).map(toInt);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'تصدير CSV' }).click();
  const file = await (await download).path();
  const csv = await readFile(file!, 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const lines = csv.slice(1).trim().split('\r\n');
  expect(lines[0]).toContain('اسم الطالب');
  const rows = lines.slice(1).map((l) => l.split(','));
  const sum = (i: number) => rows.reduce((n, r) => n + Number(r[i]), 0);
  expect([sum(3), sum(4), sum(5), sum(6), sum(7)]).toEqual([present, late, absent, excused, marked]);
  expect(rows.every((r) => r[2] === '10/1')).toBe(true);

  // Cross-check against the database (service role, same filters).
  const { data } = await serviceClient().from('attendance_records')
    .select('status, attendance_sessions!inner(class_id, session_date)')
    .eq('attendance_sessions.class_id', classId).gte('attendance_sessions.session_date', from).lte('attendance_sessions.session_date', to);
  expect(data!.length).toBe(marked);
  expect(data!.filter((r) => r.status === 'absent').length).toBe(absent);
});

test('teacher reports exclude other classes', async ({ page }) => {
  await login(page, 'teacher1@najat.test');
  await page.goto('/reports?tab=classes');
  await expect(page.getByRole('table', { name: 'ملخص الفصول' })).toBeVisible();
  const names = await page.getByRole('table', { name: 'ملخص الفصول' }).locator('tbody tr td:first-child').allInnerTexts();
  expect(names.filter((n) => n !== 'الإجمالي').sort()).toEqual(['10/1', '10/2', '11/2', '11/3']);
  await expect(page.getByRole('tab', { name: 'السلوك' })).toHaveCount(0);
});
