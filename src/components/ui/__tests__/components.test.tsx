import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AttendanceBadge, DueBadge, IncidentStatusBadge } from '../status-badges';
import { ConfirmDialog } from '../confirm-dialog';
import { can, type Role } from '@/lib/domain/permissions';

let mockRoles: Role[] = ['teacher'];
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ can: (p: Parameters<typeof can>[1]) => can(mockRoles, p) }),
}));
const { RequirePermission } = await import('@/auth/guards');

describe('status badges', () => {
  it('labels unmarked attendance explicitly, never as absent', () => {
    render(<AttendanceBadge status={null} />);
    expect(screen.getByText('لم يُرصد')).toBeInTheDocument();
    expect(screen.queryByText('غائب')).not.toBeInTheDocument();
  });
  it('pairs every status with a text label', () => {
    render(<><AttendanceBadge status="late" /><IncidentStatusBadge status="under_review" /></>);
    expect(screen.getByText('متأخر')).toBeInTheDocument();
    expect(screen.getByText('قيد المراجعة')).toBeInTheDocument();
  });
  it('shows overdue with words', () => {
    render(<DueBadge state="overdue" dueDate="2026-10-20" today="2026-10-27" />);
    expect(screen.getByText(/متأخرة/)).toBeInTheDocument();
  });
});

describe('RequirePermission', () => {
  it('shows the unauthorized page to teachers on admin screens', () => {
    mockRoles = ['teacher'];
    render(<MemoryRouter><RequirePermission permission="users.manage"><p>secret admin</p></RequirePermission></MemoryRouter>);
    expect(screen.queryByText('secret admin')).not.toBeInTheDocument();
    expect(screen.getByText('لا تملك صلاحية الوصول')).toBeInTheDocument();
  });
  it('renders content for admins', () => {
    mockRoles = ['admin'];
    render(<MemoryRouter><RequirePermission permission="users.manage"><p>secret admin</p></RequirePermission></MemoryRouter>);
    expect(screen.getByText('secret admin')).toBeInTheDocument();
  });
});

describe('ConfirmDialog with reason', () => {
  it('keeps confirm disabled until a reason is entered', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog open onOpenChange={() => {}} title="تصحيح" confirmLabel="حفظ" reasonLabel="السبب" onConfirm={onConfirm} />);
    const button = screen.getByRole('button', { name: 'حفظ' });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/السبب/), 'خطأ في الرصد');
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith('خطأ في الرصد');
  });
});
