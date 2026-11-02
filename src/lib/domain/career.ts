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

/** One row of career_quiz_students(): a page of the student list. */
export type CareerListRow = Omit<CareerRow, 'scores'> & { total_count: number };

export type CategoryStat = {
  key: CareerCategory;
  label: string;
  first: number;
  inTop3: number;
  average: number | null;
  /** Share of tested students whose first choice is this category (0–100, one decimal). */
  share: number | null;
};

export type ClassCareerStat = {
  class_id: string;
  class_name: string;
  total: number;
  tested: number;
  completion: number | null;
  leading: CareerCategory | null;
  leadingCount: number;
};

export type CareerStats = {
  total: number;
  tested: number;
  notTested: number;
  completion: number | null;
  /** Ordered by the server: first choice, then top-3 appearances, then fixed order. */
  categories: CategoryStat[];
  classes: ClassCareerStat[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (part: number, whole: number) => (whole ? round1((100 * part) / whole) : null);
const toNum = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const isCategory = (v: unknown): v is CareerCategory => typeof v === 'string' && (CAREER_CATEGORIES as readonly string[]).includes(v);
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);

/** Parses career_quiz_stats() (jsonb) into display-ready numbers; tolerant of nulls/strings. */
export function parseCareerStats(raw: unknown): CareerStats {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const total = toNum(o.total) ?? 0;
  const tested = toNum(o.tested) ?? 0;
  const categories = arr(o.categories)
    .filter((c) => isCategory(c.key))
    .map((c) => {
      const key = c.key as CareerCategory;
      const first = toNum(c.first) ?? 0;
      return { key, label: CAREER_LABELS[key], first, inTop3: toNum(c.in_top3) ?? 0, average: toNum(c.average), share: pct(first, tested) };
    });
  const classes = arr(o.classes).map((c) => {
    const t = toNum(c.total) ?? 0;
    const done = toNum(c.tested) ?? 0;
    return {
      class_id: String(c.class_id ?? ''),
      class_name: String(c.class_name ?? ''),
      total: t,
      tested: done,
      completion: pct(done, t),
      leading: isCategory(c.leading) ? c.leading : null,
      leadingCount: toNum(c.leading_count) ?? 0,
    };
  });
  return { total, tested, notTested: total - tested, completion: pct(tested, total), categories, classes };
}
