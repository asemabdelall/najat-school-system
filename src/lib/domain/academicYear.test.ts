import { describe, expect, it } from 'vitest';
import { suggestNextYear } from './academicYear';

describe('suggestNextYear', () => {
  it('rolls the name forward and starts on the second Sunday of September', () => {
    // 1 Sep 2027 is a Wednesday → first Sunday 5 Sep → second Sunday 12 Sep.
    expect(suggestNextYear('2026/2027', '2027-06-10')).toEqual({ name: '2027/2028', starts_on: '2027-09-12', ends_on: '2028-06-10' });
  });
  it('never starts before the current year ends', () => {
    expect(suggestNextYear('2026/2027', '2027-09-20').starts_on).toBe('2027-09-21');
  });
  it('falls back to the end date when the name has no years in it', () => {
    expect(suggestNextYear('العام الحالي', '2027-06-10').name).toBe('2027/2028');
  });
});
