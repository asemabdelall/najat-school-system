import { describe, expect, it } from 'vitest';
import { attendanceTone, digitsOnly, summarizeDay } from './portal';

describe('portal helpers', () => {
  it('normalises Arabic and Persian digits and drops separators', () => {
    expect(digitsOnly('٣٠٩ ١٠١-٢٠١٠٨٥')).toBe('309101201085');
    expect(digitsOnly('۱۲۳۴۵۶')).toBe('123456');
  });
  it('reads the attendance rate in plain terms', () => {
    expect(attendanceTone(null)).toBe('none');
    expect(attendanceTone(97)).toBe('excellent');
    expect(attendanceTone(92.5)).toBe('good');
    expect(attendanceTone(85)).toBe('watch');
    expect(attendanceTone(60)).toBe('concern');
  });
  it('summarises a day by status, periods in order', () => {
    const day = { day: '2026-10-26', items: [
      { period: 1, status: 'absent' as const, minutes_late: null },
      { period: 2, status: 'absent' as const, minutes_late: null },
      { period: 3, status: 'late' as const, minutes_late: 7 },
    ] };
    expect(summarizeDay(day)).toEqual([{ status: 'absent', periods: 'الحصة 1، 2' }, { status: 'late', periods: 'الحصة 3' }]);
  });
  it('describes a daily-mode mark as the whole day', () => {
    expect(summarizeDay({ day: '2026-11-02', items: [{ period: 0, status: 'absent', minutes_late: null }] })).toEqual([{ status: 'absent', periods: 'اليوم كاملًا' }]);
  });
});
