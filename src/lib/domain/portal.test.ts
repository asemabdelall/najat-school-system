import { describe, expect, it } from 'vitest';
import { activityFeed, attendanceTone, dayKind, digitsOnly, initials, monthGrid, monthsBetween, periodStats, portalAlerts, shortName, summarizeDay } from './portal';

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

describe('portal calendar and home rules', () => {
  const day = (items: [number, 'absent' | 'late' | 'excused'][]) => ({ day: '2026-11-02', items: items.map(([period, status]) => ({ period, status, minutes_late: null })) });

  it('reads a day: full absence, partial, late, excused, present, none', () => {
    expect(dayKind(day([[1, 'absent'], [2, 'absent'], [3, 'absent']]), true, 3)).toBe('absent');
    expect(dayKind(day([[0, 'absent']]), true, 7)).toBe('absent');
    expect(dayKind(day([[1, 'absent'], [4, 'late']]), true, 7)).toBe('partial');
    expect(dayKind(day([[2, 'excused']]), true, 7)).toBe('excused');
    expect(dayKind(day([[2, 'late']]), true, 7)).toBe('late');
    expect(dayKind(undefined, true, 7)).toBe('present');
    expect(dayKind(undefined, false, 7)).toBe('none');
  });

  it('builds a Sunday–Thursday month grid', () => {
    const g = monthGrid('2026-11-15'); // 1 Nov 2026 is a Sunday
    expect(g[0][0]).toEqual({ date: '2026-11-01', inMonth: true, schoolDay: true });
    expect(g.every((r) => r.length === 5)).toBe(true);
    expect(g.flat().filter((c) => c.inMonth).map((c) => c.date)).not.toContain('2026-11-06'); // Friday
    expect(g[g.length - 1].some((c) => c.date === '2026-11-30')).toBe(true);
    const oct = monthGrid('2026-10-01'); // Thursday
    expect(oct[0][0].date).toBe('2026-09-27');
    expect(oct[0][4]).toEqual({ date: '2026-10-01', inMonth: true, schoolDay: true });
  });

  it('lists months across a year boundary', () => {
    expect(monthsBetween('2026-11-20', '2027-02-03')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
  });

  it('counts absences and lateness per period', () => {
    const rows = periodStats([day([[1, 'absent'], [3, 'late']]), { ...day([[1, 'absent'], [0, 'absent']]), day: '2026-11-03' }], 4);
    expect(rows).toEqual([
      { period: 1, absent: 2, late: 0 },
      { period: 2, absent: 0, late: 0 },
      { period: 3, absent: 0, late: 1 },
      { period: 4, absent: 0, late: 0 },
    ]);
  });

  it('raises alerts for upcoming meetings, live suspensions and pending pledges, most urgent first', () => {
    const base = { school: null, student: {} as never, attendance: {} as never, days: [], behavior: [], career: null };
    const act = (o: object) => ({ status: 'scheduled', reason: 'r', date: '2026-11-01T08:00:00Z', meeting_at: null, meeting_with: null, suspension_from: null, suspension_to: null, decision_number: null, signed_on: null, ...o });
    const alerts = portalAlerts({
      ...base,
      excuses: [{ from: '2026-11-01', to: '2026-11-01', reason_type: 'medical', status: 'pending' }],
      discipline: [
        act({ type: 'guardian_summons', meeting_at: '2026-11-05T06:30:00Z' }),
        act({ type: 'guardian_summons', meeting_at: '2026-10-01T06:30:00Z' }),
        act({ type: 'suspension', status: 'issued', suspension_from: '2026-11-03', suspension_to: '2026-11-04' }),
        act({ type: 'suspension', status: 'issued', suspension_from: '2026-10-01', suspension_to: '2026-10-02' }),
        act({ type: 'pledge', status: 'pending_signature' }),
      ] as never,
    }, '2026-11-03', Date.parse('2026-11-03T08:00:00Z'));
    expect(alerts.map((a) => a.kind)).toEqual(['suspension', 'summons', 'pledge', 'excuses']);
    expect(alerts[0].returnOn).toBe('2026-11-05');
  });

  it('builds the activity feed newest first', () => {
    const feed = activityFeed({
      school: null, student: {} as never, attendance: {} as never, excuses: [],
      days: [{ day: '2026-10-20', items: [] }],
      behavior: [{ date: '2026-10-25', category: 'c', severity: 'low', status: 'resolved' }],
      discipline: [{ type: 'pledge', status: 'signed', reason: 'r', date: '2026-10-22T09:00:00Z', meeting_at: null, meeting_with: null, suspension_from: null, suspension_to: null, decision_number: null, signed_on: '2026-10-22' }],
      career: { top_1: 'a', top_2: 'b', top_3: 'c', submitted_at: '2026-11-01T09:00:00Z' },
    });
    expect(feed.map((f) => f.kind)).toEqual(['career', 'behavior', 'action', 'day']);
  });

  it('shortens names and makes initials', () => {
    expect(shortName('يوسف أحمد خالد المنصور')).toBe('يوسف المنصور');
    expect(initials('يوسف أحمد خالد المنصور')).toBe('يم');
  });
});
