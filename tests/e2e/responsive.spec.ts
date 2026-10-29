import { expect, test } from '@playwright/test';
import { login } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

test('mobile layout: no horizontal overflow, bottom tabs and drawer navigation work', async ({ page }) => {
  await login(page, 'affairs@najat.test');
  for (const path of ['/', '/students', '/attendance', '/behavior', '/follow-ups', '/reports']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
  // Bottom tab bar: primary sections are one tap away.
  const tabs = page.getByRole('navigation', { name: 'التنقل السريع' });
  await tabs.getByRole('link', { name: /الحضور/ }).click();
  await expect(page).toHaveURL(/\/attendance/);

  // "More" opens the full navigation drawer.
  await tabs.getByRole('button', { name: 'المزيد من الأقسام' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('link', { name: 'الطلاب', exact: true }).click();
  await expect(page).toHaveURL(/\/students/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
