import { expect, test } from '@playwright/test';
import { login, logout, pickStudent } from './fixtures';

test('teacher reports an incident and student affairs reviews it', async ({ page }) => {
  const marker = `واقعة اختبار ${Date.now()}`;
  await login(page, 'teacher1@najat.test');
  await page.goto('/behavior/new');
  await page.getByRole('button', { name: 'رفع البلاغ' }).click();
  await expect(page.getByText('اختر طالبًا واحدًا على الأقل')).toBeVisible();
  await pickStudent(page, 'inc-students', 'جاسم');
  await page.getByLabel('التصنيف').selectOption({ label: 'استخدام الهاتف دون إذن' });
  await page.getByLabel('وصف الواقعة').fill(`${marker}: استخدام الهاتف أثناء شرح الدرس.`);
  await page.getByRole('button', { name: 'رفع البلاغ' }).click();
  await expect(page.getByText('مرفوع – بانتظار المراجعة').first()).toBeVisible();
  const url = page.url();
  // Reporter cannot review
  await expect(page.getByRole('button', { name: 'اعتماد البلاغ' })).toHaveCount(0);
  await logout(page);

  await login(page, 'affairs@najat.test');
  await page.goto(url);
  await expect(page.getByText(marker)).toBeVisible();
  await page.getByRole('button', { name: 'بدء المراجعة' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click();
  await expect(page.getByText('قيد المراجعة').first()).toBeVisible();
  await page.getByRole('button', { name: 'اعتماد البلاغ' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByRole('button', { name: 'تأكيد' })).toBeDisabled();
  await dialog.getByLabel(/مبررات القرار/).fill('تم التحقق مع المعلم والتواصل مع ولي الأمر.');
  await dialog.getByRole('button', { name: 'تأكيد' }).click();
  await expect(page.getByText('تم تحديث حالة البلاغ').last()).toBeVisible();

  await page.reload();
  await expect(page.locator('header').getByText('معتمد')).toBeVisible();
  const timeline = page.locator('ol').filter({ hasText: 'رفع البلاغ' });
  await expect(timeline.getByText('← قيد المراجعة')).toBeVisible();
  await expect(timeline.getByText('← معتمد')).toBeVisible();
  await expect(timeline.getByText('تم التحقق مع المعلم والتواصل مع ولي الأمر.')).toBeVisible();
});
