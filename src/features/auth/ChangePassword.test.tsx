import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

const auth = {
  isStudent: false,
  profile: null as null | { email: string; full_name: string },
  session: { user: { id: 'u1', email: 's309000000000@alnajat.edu.kw' } },
  refreshProfile: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
};
vi.mock('@/auth/AuthProvider', () => ({ useAuth: () => auth }));

const updateUser = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { updateUser: (...a: unknown[]) => updateUser(...a), signInWithPassword: vi.fn() },
    rpc: (...a: unknown[]) => rpc(...a),
  },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { ChangePasswordForm } = await import('./ChangePassword');
const { PortalShell } = await import('@/features/portal/PortalShell');

function setup(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
  return { invalidate };
}

async function fill(password: string) {
  const user = userEvent.setup();
  const pw = screen.getByLabelText(/^كلمة المرور الجديدة/);
  const confirm = screen.getByLabelText(/^تأكيد كلمة المرور الجديدة/);
  await user.clear(pw);
  await user.type(pw, password);
  await user.clear(confirm);
  await user.type(confirm, password);
  await user.click(screen.getByRole('button', { name: /حفظ كلمة المرور الجديدة/ }));
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  updateUser.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('ChangePasswordForm', () => {
  it('students clear the portal flag and refetch the portal', async () => {
    auth.isStudent = true;
    const onDone = vi.fn();
    const { invalidate } = setup(<ChangePasswordForm requireCurrent={false} onDone={onDone} />);
    await fill('MyOwnPass2026');
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(updateUser).toHaveBeenCalledWith({ password: 'MyOwnPass2026' });
    expect(rpc).toHaveBeenCalledWith('portal_password_changed');
    expect(rpc).not.toHaveBeenCalledWith('password_changed');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['portal'] });
    expect(auth.refreshProfile).not.toHaveBeenCalled();
  });

  it('staff keep using password_changed', async () => {
    auth.isStudent = false;
    const onDone = vi.fn();
    setup(<ChangePasswordForm requireCurrent={false} onDone={onDone} />);
    await fill('StaffPass2026');
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('password_changed');
    expect(auth.refreshProfile).toHaveBeenCalled();
  });

  it('enforces the password rules before calling the server', async () => {
    auth.isStudent = true;
    setup(<ChangePasswordForm requireCurrent={false} onDone={vi.fn()} />);
    await fill('short1');
    expect(await screen.findByText(/10 أحرف على الأقل/, { selector: '[role="alert"]' })).toBeInTheDocument();
    await fill('onlyletterslong');
    expect(await screen.findByText(/رقم واحد على الأقل/)).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('a student re-entering an already-set new password still reaches the server check', async () => {
    auth.isStudent = true;
    updateUser.mockResolvedValue({ error: { code: 'same_password', message: 'New password should be different from the old password.' } });
    const onDone = vi.fn();
    setup(<ChangePasswordForm requireCurrent={false} onDone={onDone} />);
    await fill('MyOwnPass2026');
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('portal_password_changed'));
  });

  it('shows the server refusal when the school password is unchanged', async () => {
    auth.isStudent = true;
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'لم تتغير كلمة المرور بعد، اختر كلمة مرور جديدة أولًا' } });
    const onDone = vi.fn();
    setup(<ChangePasswordForm requireCurrent={false} onDone={onDone} />);
    await fill('MyOwnPass2026');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('PortalShell password gate', () => {
  it('shows only the set-password page when the server returns just the flag', async () => {
    auth.isStudent = true;
    rpc.mockResolvedValue({ data: { must_change_password: true }, error: null });
    setup(<PortalShell />);
    expect(await screen.findByRole('heading', { name: 'عيّن كلمة مرور خاصة بك' })).toBeInTheDocument();
    expect(screen.getByText(/لن يمكن استخدامها للدخول/)).toBeInTheDocument();
    expect(screen.queryByText('الحضور والغياب')).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('portal_my_data');
  });

  it('shows the unavailable page for an unexpected payload instead of crashing', async () => {
    auth.isStudent = true;
    rpc.mockResolvedValue({ data: { must_change_password: false }, error: null });
    setup(<PortalShell />);
    expect(await screen.findByText('لا تتوفر بيانات لهذا الحساب حاليًا')).toBeInTheDocument();
  });
});
