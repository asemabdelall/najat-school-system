import { expect, test } from '@playwright/test';
import { login, logout } from './fixtures';

test('assign a follow-up, update its status, and see it in list and dashboard', async ({ page }) => {
  const title = `متابعة اختبار ${Date.now()}`;
  await login(page, 'affairs@najat.test');
  await page.goto('/follow-ups');
  await page.getByRole('button', { name: 'مهمة جديدة' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('العنوان').fill(title);
  await dialog.getByLabel('المسؤول').selectOption({ label: 'أ. حمود الكندري (تجريبي) — معلم' });
  await dialog.getByLabel('الأولوية').selectOption({ label: 'مرتفعة' });
  await dialog.getByRole('button', { name: 'إنشاء المهمة' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await logout(page);

  await login(page, 'teacher1@najat.test');
  // Teacher dashboard lists the new task
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
  // Notification was delivered
  await page.goto('/notifications');
  await expect(page.getByText(title)).toBeVisible();

  await page.goto('/follow-ups');
  await page.getByRole('link', { name: title }).click();
  await page.getByRole('button', { name: 'بدء التنفيذ' }).click();
  await expect(page.locator('header').getByText('قيد التنفيذ')).toBeVisible();
  await page.getByLabel('النتيجة / ما تم إنجازه').fill('تم التواصل مع الطالب ووضع خطة.');
  await page.getByRole('button', { name: 'إكمال المهمة' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'إكمال' }).click();
  await expect(page.locator('header').getByText('مكتملة')).toBeVisible();

  // Default list shows active tasks only — completed one disappears; "all" shows it as completed
  await page.goto('/follow-ups');
  await expect(page.getByRole('link', { name: title })).toHaveCount(0);
  await page.getByLabel('الحالة').selectOption({ label: 'مكتملة' });
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row.getByText('مكتملة')).toBeVisible();
  await page.goto('/');
  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
});
