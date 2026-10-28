/** Pure helpers shared by report screens and CSV exports (unit-tested). */
import { attendanceRate } from './attendance';
import type { IncidentStatus } from './behavior';

export type AttendanceCounts = { present: number; late: number; absent: number; excused: number };

/** Sum attendance counts and recompute the rate from the totals (never average rates). */
export function totalAttendance<T extends AttendanceCounts>(rows: readonly T[]): AttendanceCounts & { total_marked: number; rate: number | null } {
  const t = rows.reduce(
    (acc, r) => ({ present: acc.present + Number(r.present), late: acc.late + Number(r.late), absent: acc.absent + Number(r.absent), excused: acc.excused + Number(r.excused) }),
    { present: 0, late: 0, absent: 0, excused: 0 },
  );
  return { ...t, total_marked: t.present + t.late + t.absent + t.excused, rate: attendanceRate(t) };
}

export type IncidentSummaryRow = { category_id: string; category_name: string; status: IncidentStatus; incidents: number };

/** Pivot (category × status) incident counts into one row per category. */
export function pivotIncidents(rows: readonly IncidentSummaryRow[]) {
  const map = new Map<string, { category: string; total: number } & Record<IncidentStatus, number>>();
  for (const r of rows) {
    const cur = map.get(r.category_id) ?? { category: r.category_name, total: 0, submitted: 0, under_review: 0, approved: 0, rejected: 0, resolved: 0 };
    cur[r.status] += Number(r.incidents);
    cur.total += Number(r.incidents);
    map.set(r.category_id, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, 'ar'));
}

/** Validate a report date range; returns an Arabic error or null. */
export function validateRange(from: string, to: string, maxDays = 400): string | null {
  if (!from || !to) return 'حدد تاريخ البداية والنهاية';
  if (to < from) return 'تاريخ النهاية يسبق تاريخ البداية';
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (days > maxDays) return 'الفترة طويلة جدًا (الحد الأقصى ٤٠٠ يوم)';
  return null;
}

/** Filename-safe report name: النجاة-حضور-2026-10-01_2026-10-28.csv */
export function reportFilename(kind: string, from?: string, to?: string) {
  return ['najat', kind, from && to ? `${from}_${to}` : new Date().toISOString().slice(0, 10)].join('-') + '.csv';
}
