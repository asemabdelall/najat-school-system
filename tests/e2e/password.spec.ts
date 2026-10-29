import { expect, test } from '@playwright/test';
import { serviceClient } from './fixtures';

test('a temporary password must be replaced at first sign-in, then can be changed from the menu', async ({ page }) => {
  const svc = serviceClient();
  const email = `temp${Date.now()}@najat.test`;
  const { data, error } = await svc.auth.admin.createUser({
    email, password: 'Temporary123', email_confirm: true, user_metadata: { full_name: 'أ. معلم مؤقت (تجريبي)' }, app_metadata: { staff: true },
  });
  expect(error).toBeNull();
  const id = data.user!.id;
  await svc.from('user_roles').insert({ user_id: id, role: 'teacher' });
  await svc.from('profiles').update({ must_change_password: true }).eq('id', id);

  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.locator('#password').fill('Temporary123');
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

  // The gate blocks the app until a new password is set.
  await expect(page.getByRole('heading', { name: 'عيّن كلمة مرور خاصة بك' })).toBeVisible();
  await expect(page.locator('#main')).toHaveCount(0);
  await page.getByLabel(/^كلمة المرور الجديدة/).fill('short');
  await page.getByLabel('تأكيد كلمة المرور الجديدة').fill('short');
  await page.getByRole('button', { name: 'حفظ كلمة المرور الجديدة' }).click();
  await expect(page.getByText('١٠ أحرف على الأقل').first()).toBeVisible();
  await page.getByLabel(/^كلمة المرور الجديدة/).fill('MyOwnPass2026');
  await page.getByLabel('تأكيد كلمة المرور الجديدة').fill('MyOwnPass2026');
  await page.getByRole('button', { name: 'حفظ كلمة المرور الجديدة' }).click();
  await expect(page.locator('#main')).toBeVisible();

  // Self-service change asks for the current password.
  await page.getByRole('button', { name: 'قائمة الحساب' }).click();
  await page.getByRole('menuitem', { name: 'تغيير كلمة المرور' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('كلمة المرور الحالية').fill('wrong-one-1');
  await dialog.getByLabel(/^كلمة المرور الجديدة/).fill('AnotherPass2027');
  await dialog.getByLabel('تأكيد كلمة المرور الجديدة').fill('AnotherPass2027');
  await dialog.getByRole('button', { name: 'حفظ كلمة المرور الجديدة' }).click();
  await expect(dialog.getByText('كلمة المرور الحالية غير صحيحة.')).toBeVisible();
  await dialog.getByLabel('كلمة المرور الحالية').fill('MyOwnPass2026');
  await dialog.getByRole('button', { name: 'حفظ كلمة المرور الجديدة' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const check = await svc.auth.signInWithPassword({ email, password: 'AnotherPass2027' });
  expect(check.error).toBeNull();
  await svc.auth.admin.deleteUser(id);
});
