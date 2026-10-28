import { expect, test } from '@playwright/test';
import { login } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

test('mobile layout: no horizontal overflow, drawer navigation works', async ({ page }) => {
  await login(page, 'affairs@najat.test');
  for (const path of ['/', '/students', '/attendance', '/behavior', '/follow-ups', '/reports']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  await page.getByRole('button', { name: 'فتح القائمة' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('link', { name: 'الطلاب', exact: true }).click();
  await expect(page).toHaveURL(/\/students/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
