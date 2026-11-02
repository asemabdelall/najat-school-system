import { describe, expect, it } from 'vitest';
import { careerLabel, parseCareerStats, scoreOf, type CareerRow } from './career';

describe('parseCareerStats', () => {
  const raw = {
    total: 5,
    tested: 3,
    categories: [
      { key: 'technology', first: 2, in_top3: 3, average: '4.17' },
      { key: 'sports', first: 1, in_top3: 2, average: 4 },
      { key: 'outdoor', first: 0, in_top3: 0, average: null },
      { key: 'not-a-category', first: 9, in_top3: 9, average: 1 },
    ],
    classes: [
      { class_id: 'c1', class_name: '12/1', total: 3, tested: 2, leading: 'technology', leading_count: 2 },
      { class_id: 'c2', class_name: '12/2', total: 2, tested: 0, leading: null, leading_count: 0 },
    ],
  };

  it('derives completion and per-category share of tested students', () => {
    const s = parseCareerStats(raw);
    expect(s).toMatchObject({ total: 5, tested: 3, notTested: 2, completion: 60 });
    expect(s.categories[0]).toEqual({ key: 'technology', label: 'التكنولوجي', first: 2, inTop3: 3, average: 4.17, share: 66.7 });
    expect(s.categories.find((c) => c.key === 'outdoor')).toMatchObject({ average: null, share: 0 });
  });
  it('drops unknown categories and keeps the server order', () => {
    expect(parseCareerStats(raw).categories.map((c) => c.key)).toEqual(['technology', 'sports', 'outdoor']);
  });
  it('computes class completion and tolerates a class nobody tested yet', () => {
    const [a, b] = parseCareerStats(raw).classes;
    expect(a).toMatchObject({ class_name: '12/1', completion: 66.7, leading: 'technology', leadingCount: 2 });
    expect(b).toMatchObject({ class_name: '12/2', completion: 0, leading: null });
  });
  it('handles an empty or malformed response', () => {
    expect(parseCareerStats(null)).toMatchObject({ total: 0, tested: 0, completion: null, categories: [], classes: [] });
    expect(parseCareerStats({ total: 0, tested: 0 }).completion).toBeNull();
  });
});

describe('helpers', () => {
  it('labels categories in Arabic and shows a dash for unknown keys', () => {
    expect(careerLabel('social_service')).toBe('الخدمة الاجتماعية');
    expect(careerLabel(null)).toBe('—');
    expect(careerLabel('nope')).toBe('—');
  });
  it('reads a numeric score and ignores anything else', () => {
    const row = { scores: { technology: 4.5, sports: '3' } } as unknown as CareerRow;
    expect(scoreOf(row, 'technology')).toBe(4.5);
    expect(scoreOf(row, 'sports')).toBeNull();
    expect(scoreOf(row, 'outdoor')).toBeNull();
  });
});
