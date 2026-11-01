import { describe, expect, it } from 'vitest';
import { careerLabel, careerStats, classBreakdown, type CareerRow } from './career';

const row = (id: string, cls: string, top?: [string, string, string], scores?: Record<string, number>): CareerRow => ({
  student_id: id,
  student_number: id,
  full_name: `طالب ${id}`,
  class_id: cls,
  class_name: `12/${cls}`,
  top_1: top?.[0] ?? null,
  top_2: top?.[1] ?? null,
  top_3: top?.[2] ?? null,
  scores: scores ?? null,
  submitted_at: top ? '2026-11-01T08:00:00Z' : null,
  attempts: top ? 1 : 0,
});

const rows = [
  row('a', '1', ['technology', 'scientific', 'computational'], { technology: 5, scientific: 4, sports: 2 }),
  row('b', '1', ['technology', 'sports', 'artistic'], { technology: 4, sports: 3 }),
  row('c', '1'),
  row('d', '2', ['sports', 'technology', 'literary'], { technology: 3.5, sports: 5 }),
  row('e', '2'),
];

describe('careerStats', () => {
  it('counts tested students and completion over everyone in scope', () => {
    const s = careerStats(rows);
    expect(s).toMatchObject({ total: 5, tested: 3, notTested: 2, completion: 60 });
  });
  it('ranks categories by first choice, then by top-3 appearances', () => {
    const s = careerStats(rows);
    expect(s.categories[0]).toMatchObject({ key: 'technology', first: 2, inTop3: 3 });
    expect(s.categories[1]).toMatchObject({ key: 'sports', first: 1, inTop3: 2 });
    expect(s.categories).toHaveLength(10);
  });
  it('averages only scores that exist; untested students never count', () => {
    const s = careerStats(rows);
    expect(s.categories.find((c) => c.key === 'technology')!.average).toBe(4.17);
    expect(s.categories.find((c) => c.key === 'outdoor')!.average).toBeNull();
  });
  it('handles an empty scope', () => {
    expect(careerStats([])).toMatchObject({ total: 0, tested: 0, completion: null });
  });
});

describe('classBreakdown', () => {
  it('reports completion and the leading first choice per class', () => {
    const b = classBreakdown(rows);
    expect(b).toEqual([
      expect.objectContaining({ class_id: '1', total: 3, tested: 2, leading: 'technology', leadingCount: 2 }),
      expect.objectContaining({ class_id: '2', total: 2, tested: 1, completion: 50, leading: 'sports' }),
    ]);
  });
});

describe('careerLabel', () => {
  it('returns Arabic labels and a dash for unknown keys', () => {
    expect(careerLabel('social_service')).toBe('الخدمة الاجتماعية');
    expect(careerLabel(null)).toBe('—');
    expect(careerLabel('nope')).toBe('—');
  });
});
