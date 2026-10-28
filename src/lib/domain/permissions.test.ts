import { describe, expect, it } from 'vitest';
import { can, isManagerRole, permissionsFor, primaryRole } from './permissions';

describe('role-based action availability', () => {
  it('teachers cannot manage students, users, settings or review', () => {
    for (const p of ['students.manage', 'users.manage', 'settings.manage', 'behavior.review', 'excuses.review', 'audit.view', 'classes.manage'] as const) {
      expect(can(['teacher'], p), p).toBe(false);
    }
  });
  it('teachers can take attendance and report behaviour', () => {
    expect(can(['teacher'], 'attendance.take')).toBe(true);
    expect(can(['teacher'], 'behavior.report')).toBe(true);
  });
  it('student affairs can review but not administer users/settings/audit', () => {
    expect(can(['student_affairs'], 'behavior.review')).toBe(true);
    expect(can(['student_affairs'], 'users.manage')).toBe(false);
    expect(can(['student_affairs'], 'settings.manage')).toBe(false);
    expect(can(['student_affairs'], 'audit.view')).toBe(false);
  });
  it('admins hold every permission', () => {
    expect(permissionsFor(['admin']).size).toBe(20);
  });
  it('combines multiple roles', () => {
    expect(can(['teacher', 'student_affairs'], 'behavior.review')).toBe(true);
    expect(isManagerRole(['teacher'])).toBe(false);
    expect(isManagerRole(['teacher', 'student_affairs'])).toBe(true);
    expect(primaryRole(['teacher', 'admin'])).toBe('admin');
  });
  it('no roles means no access', () => {
    expect(can([], 'dashboard.view')).toBe(false);
  });
});
