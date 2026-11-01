/**
 * Career-interest quiz (اختبار الميول المهنية): category labels and the
 * statistics shown on the career page. Keys match public.career_categories().
 */
export const CAREER_CATEGORIES = [
  'outdoor', 'mechanical', 'computational', 'scientific', 'persuasive',
  'artistic', 'literary', 'technology', 'social_service', 'sports',
] as const;
export type CareerCategory = (typeof CAREER_CATEGORIES)[number];

export const CAREER_LABELS: Record<CareerCategory, string> = {
  outdoor: 'الخلوي',
  mechanical: 'الميكانيكي',
  computational: 'الحسابي',
  scientific: 'العلمي',
  persuasive: 'الإقناعي',
  artistic: 'الفني',
  literary: 'الأدبي',
  technology: 'التكنولوجي',
  social_service: 'الخدمة الاجتماعية',
  sports: 'الرياضي',
};

export function careerLabel(key: string | null | undefined): string {
  return key && key in CAREER_LABELS ? CAREER_LABELS[key as CareerCategory] : '—';
}

/** One row of career_quiz_overview(): a student, with their latest result (or none). */
export type CareerRow = {
  student_id: string;
  student_number: string;
  full_name: string;
  class_id: string;
  class_name: string;
  top_1: string | null;
  top_2: string | null;
  top_3: string | null;
  scores: unknown;
  submitted_at: string | null;
  attempts: number;
};

export function scoreOf(row: CareerRow, key: CareerCategory): number | null {
  const s = row.scores as Record<string, unknown> | null;
  const v = s && typeof s === 'object' ? s[key] : null;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export type CategoryStat = { key: CareerCategory; label: string; first: number; inTop3: number; average: number | null };

export type CareerStats = {
  total: number;
  tested: number;
  notTested: number;
  /** Percentage 0–100 with one decimal, null when there are no students. */
  completion: number | null;
  /** Sorted by first-choice count, then top-3 count, then fixed order. */
  categories: CategoryStat[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function careerStats(rows: readonly CareerRow[]): CareerStats {
  const tested = rows.filter((r) => r.top_1);
  const categories = CAREER_CATEGORIES.map((key, order) => {
    const scores = tested.map((r) => scoreOf(r, key)).filter((v): v is number => v !== null);
    return {
      key,
      label: CAREER_LABELS[key],
      first: tested.filter((r) => r.top_1 === key).length,
      inTop3: tested.filter((r) => r.top_1 === key || r.top_2 === key || r.top_3 === key).length,
      average: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : null,
      order,
    };
  })
    .sort((a, b) => b.first - a.first || b.inTop3 - a.inTop3 || a.order - b.order)
    .map(({ order: _order, ...rest }) => rest);
  return {
    total: rows.length,
    tested: tested.length,
    notTested: rows.length - tested.length,
    completion: rows.length ? round1((100 * tested.length) / rows.length) : null,
    categories,
  };
}

export type ClassCareerStat = {
  class_id: string;
  class_name: string;
  total: number;
  tested: number;
  completion: number | null;
  /** Most common first choice in the class; ties → fixed category order. */
  leading: CareerCategory | null;
  leadingCount: number;
};

export function classBreakdown(rows: readonly CareerRow[]): ClassCareerStat[] {
  const byClass = new Map<string, CareerRow[]>();
  for (const r of rows) byClass.set(r.class_id, [...(byClass.get(r.class_id) ?? []), r]);
  return [...byClass.values()].map((list) => {
    const tested = list.filter((r) => r.top_1);
    let leading: CareerCategory | null = null;
    let leadingCount = 0;
    for (const key of CAREER_CATEGORIES) {
      const n = tested.filter((r) => r.top_1 === key).length;
      if (n > leadingCount) {
        leading = key;
        leadingCount = n;
      }
    }
    return {
      class_id: list[0].class_id,
      class_name: list[0].class_name,
      total: list.length,
      tested: tested.length,
      completion: list.length ? round1((100 * tested.length) / list.length) : null,
      leading,
      leadingCount,
    };
  });
}
