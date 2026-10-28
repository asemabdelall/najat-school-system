/**
 * Permission matrix used by the UI to show/hide navigation and actions.
 * This is NOT a security boundary: every permission below is enforced again
 * by Row Level Security and workflow functions in the database.
 * Keep in sync with docs/security.md.
 */
export const ROLES = ['admin', 'student_affairs', 'teacher'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'مدير النظام',
  student_affairs: 'شؤون الطلبة',
  teacher: 'معلم',
};

export type Permission =
  | 'dashboard.view'
  | 'students.view'
  | 'students.manage'
  | 'classes.view'
  | 'classes.manage'
  | 'academic_years.manage'
  | 'attendance.take'
  | 'attendance.oversee'
  | 'excuses.submit'
  | 'excuses.review'
  | 'behavior.report'
  | 'behavior.review'
  | 'behavior.view_all'
  | 'followups.view'
  | 'followups.manage'
  | 'reports.view'
  | 'notifications.view'
  | 'users.manage'
  | 'settings.manage'
  | 'audit.view';

const MATRIX: Record<Role, readonly Permission[]> = {
  admin: [
    'dashboard.view', 'students.view', 'students.manage', 'classes.view', 'classes.manage', 'academic_years.manage',
    'attendance.take', 'attendance.oversee', 'excuses.submit', 'excuses.review', 'behavior.report', 'behavior.review',
    'behavior.view_all', 'followups.view', 'followups.manage', 'reports.view', 'notifications.view', 'users.manage',
    'settings.manage', 'audit.view',
  ],
  student_affairs: [
    'dashboard.view', 'students.view', 'students.manage', 'classes.view', 'classes.manage', 'attendance.take',
    'attendance.oversee', 'excuses.submit', 'excuses.review', 'behavior.report', 'behavior.review', 'behavior.view_all',
    'followups.view', 'followups.manage', 'reports.view', 'notifications.view',
  ],
  teacher: [
    'dashboard.view', 'students.view', 'classes.view', 'attendance.take', 'excuses.submit', 'behavior.report',
    'followups.view', 'reports.view', 'notifications.view',
  ],
};

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of MATRIX[r] ?? []) set.add(p);
  return set;
}

export function can(roles: readonly Role[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

export function isManagerRole(roles: readonly Role[]): boolean {
  return roles.includes('admin') || roles.includes('student_affairs');
}

export function primaryRole(roles: readonly Role[]): Role | null {
  return ROLES.find((r) => roles.includes(r)) ?? null;
}

export function permissionMatrix(): Record<Role, readonly Permission[]> {
  return MATRIX;
}
