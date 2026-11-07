import { describe, expect, it } from 'vitest';
import { canTransition, defaultPledgeText, nextStatuses, returnDate, schoolDaysBetween, suspensionPhase, validateDiscipline } from './discipline';

describe('discipline transitions (mirror of discipline_transition_allowed)', () => {
  it('offers only the allowed next statuses', () => {
    expect(nextStatuses('guardian_summons', 'scheduled')).toEqual(['attended', 'no_show', 'cancelled']);
    expect(nextStatuses('guardian_summons', 'no_show')).toEqual(['scheduled']);
    expect(nextStatuses('suspension', 'issued')).toEqual(['cancelled']);
    expect(nextStatuses('pledge', 'signed')).toEqual([]);
  });
  it('rejects jumps the database rejects', () => {
    expect(canTransition('guardian_summons', 'attended', 'scheduled')).toBe(false);
    expect(canTransition('pledge', 'cancelled', 'signed')).toBe(false);
    expect(canTransition('pledge', 'pending_signature', 'signed')).toBe(true);
  });
});

describe('suspension dates', () => {
  // 2026-11-05 is a Thursday; Friday/Saturday are the weekend.
  it('counts school days only', () => {
    expect(schoolDaysBetween('2026-11-04', '2026-11-08')).toBe(3); // Wed, Thu, Sun
    expect(schoolDaysBetween('2026-11-06', '2026-11-07')).toBe(0);
    expect(schoolDaysBetween('2026-11-08', '2026-11-04')).toBe(0);
  });
  it('returns on the next school day after the last suspended day', () => {
    expect(returnDate('2026-11-05')).toBe('2026-11-08');
    expect(returnDate('2026-11-08')).toBe('2026-11-09');
  });
  it('knows whether a suspension is upcoming, active or over', () => {
    expect(suspensionPhase('2026-11-03', '2026-11-05', '2026-11-02')).toBe('upcoming');
    expect(suspensionPhase('2026-11-03', '2026-11-05', '2026-11-05')).toBe('active');
    expect(suspensionPhase('2026-11-03', '2026-11-05', '2026-11-06')).toBe('ended');
  });
});

describe('validateDiscipline', () => {
  it('requires the fields of each type, with the database messages', () => {
    expect(validateDiscipline({ type: 'guardian_summons', reason: 'غياب متكرر' })).toEqual({ meetingAt: 'حدّد موعد الاستدعاء' });
    expect(validateDiscipline({ type: 'suspension', reason: 'شجار', suspensionFrom: '2026-11-10', suspensionTo: '2026-11-09' })).toEqual({ suspensionTo: 'تاريخ النهاية قبل البداية' });
    expect(validateDiscipline({ type: 'suspension', reason: 'شجار', suspensionFrom: '2026-11-01', suspensionTo: '2026-12-15' })).toEqual({ suspensionTo: 'المدة لا تتجاوز 30 يومًا' });
    expect(validateDiscipline({ type: 'pledge', reason: 'هاتف', pledgeText: 'قصير' })).toEqual({ pledgeText: 'نص التعهد مطلوب (10 أحرف على الأقل)' });
    expect(validateDiscipline({ type: 'pledge', reason: 'x', pledgeText: 'نص تعهد كامل ومناسب' }).reason).toBeDefined();
  });
});

describe('defaultPledgeText', () => {
  it('fills the student, class and reason', () => {
    const t = defaultPledgeText('محمد أحمد', '12/2', 'استخدام الهاتف داخل الفصل');
    expect(t).toContain('محمد أحمد');
    expect(t).toContain('12/2');
    expect(t).toContain('استخدام الهاتف داخل الفصل');
  });
});
