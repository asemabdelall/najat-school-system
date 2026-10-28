import { describe, expect, it } from 'vitest';
import { addDays, diffDays, formatDate, isSchoolDay, kuwaitToday, previousSchoolDay, weekday } from './format';

describe('Kuwait date handling', () => {
  it('uses the Kuwait calendar day even when UTC is still the previous day', () => {
    // 22:30 UTC on 27 Oct is 01:30 on 28 Oct in Kuwait (UTC+3).
    expect(kuwaitToday(new Date('2026-10-27T22:30:00Z'))).toBe('2026-10-28');
    expect(kuwaitToday(new Date('2026-10-27T20:59:00Z'))).toBe('2026-10-27');
  });
  it('never shifts calendar dates when formatting', () => {
    expect(formatDate('2026-10-01')).toContain('١');
    expect(formatDate('2026-10-01')).toContain('أكتوبر');
    expect(formatDate('2026-12-31')).toContain('٣١');
  });
  it('does date arithmetic in UTC without DST drift', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
    expect(diffDays('2026-10-27', '2026-10-20')).toBe(7);
  });
  it('treats Friday and Saturday as the weekend', () => {
    expect(weekday('2026-10-30')).toBe(5);
    expect(isSchoolDay('2026-10-30')).toBe(false);
    expect(isSchoolDay('2026-10-31')).toBe(false);
    expect(isSchoolDay('2026-11-01')).toBe(true); // Sunday
    expect(previousSchoolDay('2026-10-31')).toBe('2026-10-29');
  });
});
