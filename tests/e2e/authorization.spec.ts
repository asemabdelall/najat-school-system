import { expect, test } from '@playwright/test';
import { CLASS, login } from './fixtures';

test('teacher cannot open unassigned classes or admin screens', async ({ page }) => {
  await login(page, 'teacher1@najat.test');
  const nav = page.getByRole('navigation', { name: 'القائمة الرئيسية' }).first();
  for (const item of ['المستخدمون والصلاحيات', 'الإعدادات', 'سجل التدقيق']) await expect(nav.getByText(item)).toHaveCount(0);

  await page.goto(`/classes/${CLASS(12, 1)}`);
  await expect(page.getByText('الفصل غير موجود أو غير مسند إليك')).toBeVisible();

  for (const path of ['/users', '/settings', '/audit']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'لا تملك صلاحية الوصول' })).toBeVisible();
  }

  await page.goto(`/attendance/take?class=${CLASS(12, 1)}`);
  // The class is not offered, and no roster is shown for it.
  await expect(page.locator('#att-class option', { hasText: '12/1' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'قائمة طلاب الجلسة' })).toHaveCount(0);
});

test('unauthenticated users are redirected to sign-in', async ({ page }) => {
  await page.goto('/students');
  await expect(page).toHaveURL(/\/login/);
});
