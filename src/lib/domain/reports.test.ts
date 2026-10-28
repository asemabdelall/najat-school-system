import { describe, expect, it } from 'vitest';
import { pivotIncidents, reportFilename, totalAttendance, validateRange } from './reports';

describe('report calculations', () => {
  it('sums counts and recomputes the rate from totals (not averaged)', () => {
    const t = totalAttendance([
      { present: 9, late: 0, absent: 1, excused: 0 }, // 90%
      { present: 1, late: 0, absent: 1, excused: 0 }, // 50%
    ]);
    expect(t).toMatchObject({ present: 10, absent: 2, total_marked: 12 });
    expect(t.rate).toBe(83.3); // not (90 + 50) / 2 = 70
  });
  it('handles empty results', () => {
    expect(totalAttendance([])).toEqual({ present: 0, late: 0, absent: 0, excused: 0, total_marked: 0, rate: null });
  });
  it('accepts numeric strings from the API', () => {
    expect(totalAttendance([{ present: '3' as unknown as number, late: 0, absent: 1, excused: 0 }]).present).toBe(3);
  });
  it('pivots incidents by category with totals', () => {
    const rows = pivotIncidents([
      { category_id: 'a', category_name: 'أ', status: 'submitted', incidents: 2 },
      { category_id: 'a', category_name: 'أ', status: 'approved', incidents: 1 },
      { category_id: 'b', category_name: 'ب', status: 'rejected', incidents: 5 },
    ]);
    expect(rows[0]).toMatchObject({ category: 'ب', total: 5, rejected: 5 });
    expect(rows[1]).toMatchObject({ category: 'أ', total: 3, submitted: 2, approved: 1, resolved: 0 });
  });
  it('validates date ranges', () => {
    expect(validateRange('2026-10-01', '2026-10-27')).toBeNull();
    expect(validateRange('2026-10-27', '2026-10-01')).toMatch(/يسبق/);
    expect(validateRange('2020-01-01', '2026-10-01')).toMatch(/طويلة/);
    expect(validateRange('', '2026-10-01')).toBeTruthy();
  });
  it('builds stable filenames', () => {
    expect(reportFilename('student-attendance', '2026-10-01', '2026-10-27')).toBe('najat-student-attendance-2026-10-01_2026-10-27.csv');
  });
});
