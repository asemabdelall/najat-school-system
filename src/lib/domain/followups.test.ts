import { describe, expect, it } from 'vitest';
import { arabicDays, dueLabel, dueState, nextStatuses } from './followups';

const today = '2026-10-27';

describe('due-date state', () => {
  it('classifies relative to Kuwait today', () => {
    expect(dueState('open', '2026-10-26', today)).toBe('overdue');
    expect(dueState('in_progress', '2026-10-27', today)).toBe('due_today');
    expect(dueState('open', '2026-10-29', today, 2)).toBe('due_soon');
    expect(dueState('open', '2026-11-05', today, 2)).toBe('upcoming');
    expect(dueState('open', null, today)).toBe('none');
  });
  it('never marks closed tasks overdue', () => {
    expect(dueState('completed', '2026-01-01', today)).toBe('closed');
    expect(dueState('cancelled', '2026-01-01', today)).toBe('closed');
  });
  it('labels overdue with words (not colour only)', () => {
    expect(dueLabel('overdue', '2026-10-26', today)).toBe('متأخرة يومًا واحدًا');
    expect(dueLabel('overdue', '2026-10-25', today)).toBe('متأخرة يومين');
    expect(dueLabel('due_soon', '2026-10-28', today)).toBe('تستحق غدًا');
  });
  it('uses Arabic number agreement', () => {
    expect(arabicDays(5)).toBe('٥ أيام');
    expect(arabicDays(11)).toBe('١١ يومًا');
  });
});

describe('status changes', () => {
  it('lets only creators/managers cancel', () => {
    expect(nextStatuses('open', false)).not.toContain('cancelled');
    expect(nextStatuses('open', true)).toContain('cancelled');
    expect(nextStatuses('completed', true)).toEqual(['in_progress']);
  });
});
