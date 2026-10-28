import { expect, test } from '@playwright/test';
import { login } from './fixtures';

test('create, find and edit a fictional student', async ({ page }) => {
  const number = `E2E-${Date.now().toString().slice(-7)}`;
  await login(page, 'affairs@najat.test');
  await page.goto('/students');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  const dialog = page.getByRole('dialog');
  // Validation first
  await dialog.getByRole('button', { name: 'إضافة الطالب' }).click();
  await expect(dialog.getByText('اسم الطالب مطلوب (٣ أحرف على الأقل)')).toBeVisible();
  await dialog.getByLabel('الاسم الكامل').fill('طالب اختبار آلي');
  await dialog.getByLabel('الرقم الطلابي').fill(number);
  await dialog.getByLabel(/الفصل/).selectOption({ label: 'الصف 10 – فصل 10/1' });
  await dialog.getByRole('button', { name: 'إضافة الطالب' }).click();
  await expect(page.getByRole('heading', { name: 'طالب اختبار آلي' })).toBeVisible();
  await expect(page.getByText('فصل 10/1')).toBeVisible();

  // Duplicate number is rejected with a field error
  await page.goto('/students');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await page.getByRole('dialog').getByLabel('الاسم الكامل').fill('طالب مكرر');
  await page.getByRole('dialog').getByLabel('الرقم الطلابي').fill(number.toLowerCase());
  await page.getByRole('dialog').getByRole('button', { name: 'إضافة الطالب' }).click();
  await expect(page.getByText('الرقم الطلابي مستخدم لطالب آخر')).toBeVisible();
  await page.keyboard.press('Escape');
  page.once('dialog', (d) => d.accept());

  // Search (Arabic-normalised: "اختبار الي" without hamza variants)
  await page.goto('/students');
  await page.getByLabel('بحث بالاسم أو الرقم الطلابي').fill(number);
  await expect(page.getByRole('link', { name: 'طالب اختبار آلي' })).toBeVisible();
  await page.getByRole('link', { name: 'طالب اختبار آلي' }).click();

  // Edit
  await page.getByRole('button', { name: 'تعديل' }).click();
  await page.getByRole('dialog').getByLabel('اسم ولي الأمر').fill('ولي أمر تجريبي');
  await page.getByRole('dialog').getByLabel('هاتف ولي الأمر').fill('+965 5550 9999');
  await page.getByRole('dialog').getByRole('button', { name: 'حفظ التغييرات' }).click();
  await expect(page.getByText('تم حفظ بيانات الطالب')).toBeVisible();
  await page.reload();
  await expect(page.getByText('ولي أمر تجريبي')).toBeVisible();
  await expect(page.getByText('+965 5550 9999')).toBeVisible();
});
