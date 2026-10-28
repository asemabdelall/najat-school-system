import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('safe error messages', () => {
  it('passes through Arabic messages raised by workflow functions', () => {
    expect(errorMessage({ message: 'لا تملك صلاحية رصد الحضور لهذا الفصل', code: '42501' })).toBe('لا تملك صلاحية رصد الحضور لهذا الفصل');
  });
  it('hides internal English database details', () => {
    const msg = errorMessage({ message: 'duplicate key value violates unique constraint "students_number_uk"', code: '23505' });
    expect(msg).not.toMatch(/students_number_uk|constraint/);
    expect(msg).toMatch(/مكررة/);
    expect(errorMessage({ message: 'relation "x" does not exist', code: '42P01' })).not.toContain('relation');
  });
  it('maps auth failures', () => {
    expect(errorMessage({ name: 'AuthApiError', message: 'Invalid login credentials' })).toMatch(/كلمة المرور/);
  });
});
