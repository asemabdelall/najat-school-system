import { expect, test } from '@playwright/test';

test('signed-out visitors land on the public page and can try the live register', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('دفتر الحضور');

  // Real rule: the sheet cannot be submitted until every student is marked.
  const submit = page.getByRole('button', { name: 'اعتماد الكشف' });
  await expect(submit).toBeDisabled();
  await page.getByRole('radiogroup', { name: 'حالة إبراهيم باسم البيان' }).getByRole('radio', { name: 'غائب' }).click();
  await page.getByRole('button', { name: 'تحديد الباقين حاضرين' }).click();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByText('اعتُمد الكشف')).toBeVisible();

  await page.getByRole('link', { name: 'تسجيل الدخول' }).first().click();
  await expect(page).toHaveURL(/\/login/);
});
