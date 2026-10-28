import { expect, type Page } from '@playwright/test';
export { CLASS, STUDENT, serviceClient, kwToday, isSchoolDay, PASSWORD } from '../integration/helpers';
import { PASSWORD } from '../integration/helpers';

export async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator('#main')).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'تسجيل الخروج' }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

/** Pick a student via the StudentPicker combobox. */
export async function pickStudent(page: Page, comboboxId: string, query: string) {
  await page.locator(`#${comboboxId}`).fill(query);
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible();
  await option.click();
}
