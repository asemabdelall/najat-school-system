import { describe, expect, it } from 'vitest';
import { attendanceRate, changedMarks, countMarks, isAttendanceStatus, sessionCompletion, sessionKey, sessionPeriod, type AttendanceMark } from './attendance';

describe('attendance status handling', () => {
  it('recognises only the four valid statuses', () => {
    for (const s of ['present', 'absent', 'late', 'excused']) expect(isAttendanceStatus(s)).toBe(true);
    for (const s of ['', 'unmarked', 'PRESENT', null, undefined, 1]) expect(isAttendanceStatus(s)).toBe(false);
  });

  it('never counts unmarked students as absent', () => {
    const c = countMarks(['present', null, null, 'late', 'absent']);
    expect(c.absent).toBe(1);
    expect(c.unmarked).toBe(2);
    expect(c.marked).toBe(3);
  });

  it('computes rate from marked records only', () => {
    expect(attendanceRate({ present: 13, late: 1, absent: 1, excused: 0 })).toBe(93.3);
    // Adding unmarked students changes nothing because they are not inputs.
    const marks: AttendanceMark[] = ['present', 'present', 'absent', null, null, null];
    const c = countMarks(marks);
    expect(attendanceRate(c)).toBe(66.7);
  });

  it('returns null rate when nothing is marked', () => {
    expect(attendanceRate({ present: 0, late: 0, absent: 0, excused: 0 })).toBeNull();
    expect(attendanceRate(countMarks([null, null]))).toBeNull();
  });

  it('counts excused as marked but not present', () => {
    expect(attendanceRate({ present: 1, late: 0, absent: 0, excused: 1 })).toBe(50);
  });
});

describe('session identity', () => {
  it('uses period 0 for daily mode regardless of input', () => {
    expect(sessionPeriod('daily', 4)).toBe(0);
    expect(sessionPeriod('daily', null)).toBe(0);
  });
  it('clamps period mode to at least period 1', () => {
    expect(sessionPeriod('period', 3)).toBe(3);
    expect(sessionPeriod('period', 0)).toBe(1);
    expect(sessionPeriod('period', undefined)).toBe(1);
  });
  it('builds identical keys for the same class/date/period (uniqueness rule)', () => {
    expect(sessionKey('c1', '2026-10-27', 0)).toBe(sessionKey('c1', '2026-10-27', 0));
    expect(sessionKey('c1', '2026-10-27', 1)).not.toBe(sessionKey('c1', '2026-10-27', 2));
  });
});

describe('session completion', () => {
  it('reports progress states', () => {
    expect(sessionCompletion(20, 0, null)).toBe('not_started');
    expect(sessionCompletion(20, 5, 'draft')).toBe('in_progress');
    expect(sessionCompletion(20, 20, 'draft')).toBe('complete');
    expect(sessionCompletion(20, 3, 'submitted')).toBe('submitted');
  });
});

describe('batch save diff', () => {
  it('sends only changed marks, including cleared ones', () => {
    const saved = new Map<string, AttendanceMark>([['a', 'present'], ['b', 'absent']]);
    const current = new Map<string, AttendanceMark>([['a', 'present'], ['b', null], ['c', 'late']]);
    expect(changedMarks(saved, current)).toEqual([{ student_id: 'b', status: null }, { student_id: 'c', status: 'late' }]);
  });
});
