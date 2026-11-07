/**
 * Guardian & student portal: the shape returned by public.portal_my_data()
 * and the presentation rules the portal pages share.
 */
import { addDays, isSchoolDay, startOfMonth, weekday } from '@/lib/format';
import { returnDate, suspensionPhase } from './discipline';
import type { AttendanceStatus } from './attendance';

export type PortalDay = { day: string; items: { period: number; status: AttendanceStatus; minutes_late: number | null }[] };

export type PortalAction = {
  type: 'guardian_summons' | 'suspension' | 'pledge';
  status: string;
  reason: string;
  date: string;
  meeting_at: string | null;
  meeting_with: string | null;
  suspension_from: string | null;
  suspension_to: string | null;
  decision_number: string | null;
  signed_on: string | null;
};

export type PortalData = {
  school: string | null;
  student: {
    full_name: string;
    student_number: string;
    civil_id_last4: string;
    status: string;
    date_of_birth?: string | null;
    guardian_name: string | null;
    guardian_phone?: string | null;
    enrolled_on?: string | null;
    class_name: string | null;
    grade_level: number | null;
    year_name: string | null;
    year_closed: boolean;
    year_starts_on?: string | null;
    year_ends_on?: string | null;
  };
  settings?: { attendance_mode: 'daily' | 'period'; periods_per_day: number } | null;
  attendance: { present: number; late: number; absent: number; excused: number; absent_days: number; recorded_days: number; rate: number | null };
  recorded_dates?: string[];
  days: PortalDay[];
  excuses: { from: string; to: string; reason_type: string; status: 'pending' | 'approved' | 'rejected' }[];
  behavior: { date: string; category: string; severity: 'low' | 'medium' | 'high'; status: 'approved' | 'resolved' }[];
  discipline: PortalAction[];
  career: { top_1: string; top_2: string; top_3: string; submitted_at: string } | null;
};

/** Arabic-Indic / Persian digits → ASCII digits; everything else dropped. */
export function digitsOnly(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, '');
}

export type AttendanceTone = 'excellent' | 'good' | 'watch' | 'concern' | 'none';

/** Plain-language reading of the attendance rate for families. */
export function attendanceTone(rate: number | null): AttendanceTone {
  if (rate == null) return 'none';
  if (rate >= 95) return 'excellent';
  if (rate >= 90) return 'good';
  if (rate >= 80) return 'watch';
  return 'concern';
}

export const ATTENDANCE_TONE_TEXT: Record<AttendanceTone, string> = {
  excellent: 'انتظام ممتاز في الحضور',
  good: 'انتظام جيد في الحضور',
  watch: 'يحتاج الحضور إلى متابعة',
  concern: 'نسبة الغياب مرتفعة وتحتاج إلى تواصل مع المدرسة',
  none: 'لم يُرصد حضور بعد هذا العام',
};

/** Short summary of one day's non-present marks, e.g. "غياب: الحصة 1، 2 · تأخر: الحصة 3". */
export function summarizeDay(day: PortalDay, fmt: (n: number) => string = String): { status: AttendanceStatus; periods: string }[] {
  const order: AttendanceStatus[] = ['absent', 'late', 'excused'];
  return order
    .map((status) => {
      const ps = day.items.filter((i) => i.status === status).map((i) => i.period);
      if (!ps.length) return null;
      const periods = ps.includes(0) ? 'اليوم كاملًا' : `الحصة ${ps.map(fmt).join('، ')}`;
      return { status, periods };
    })
    .filter((x): x is { status: AttendanceStatus; periods: string } => x !== null);
}

export const EXCUSE_STATUS_TEXT: Record<'pending' | 'approved' | 'rejected', string> = {
  pending: 'قيد المراجعة',
  approved: 'مقبول',
  rejected: 'غير مقبول',
};

// ---------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------

/** How a school day reads on the calendar. */
export type DayKind = 'present' | 'absent' | 'partial' | 'late' | 'excused' | 'none';

export const DAY_KIND_LABELS: Record<DayKind, string> = {
  present: 'حاضر',
  absent: 'غائب اليوم كاملًا',
  partial: 'غياب عن بعض الحصص',
  late: 'تأخر',
  excused: 'غياب بعذر',
  none: 'لا يوجد رصد',
};

/**
 * One day's reading. `periodsPerDay` decides when a set of absent periods
 * counts as a whole day (daily mode records period 0 for the whole day).
 */
export function dayKind(day: PortalDay | undefined, recorded: boolean, periodsPerDay: number): DayKind {
  if (!day || day.items.length === 0) return recorded ? 'present' : 'none';
  const absent = day.items.filter((i) => i.status === 'absent');
  if (absent.some((i) => i.period === 0) || (periodsPerDay > 0 && absent.length >= periodsPerDay)) return 'absent';
  if (absent.length > 0) return 'partial';
  if (day.items.some((i) => i.status === 'excused')) return 'excused';
  return 'late';
}

export type CalendarCell = { date: string; inMonth: boolean; schoolDay: boolean };

/**
 * School-week grid (Sunday–Thursday) for the month containing `anyDate`.
 * Rows start on Sunday; leading/trailing cells from neighbouring months are
 * marked inMonth=false so the grid stays rectangular.
 */
export function monthGrid(anyDate: string): CalendarCell[][] {
  const first = startOfMonth(anyDate);
  const month = first.slice(0, 7);
  let cursor = addDays(first, -weekday(first)); // back to Sunday
  const rows: CalendarCell[][] = [];
  while (rows.length < 6) {
    const row: CalendarCell[] = [];
    for (let i = 0; i < 5; i++) {
      const date = addDays(cursor, i);
      row.push({ date, inMonth: date.slice(0, 7) === month, schoolDay: isSchoolDay(date) });
    }
    if (row.some((c) => c.inMonth)) rows.push(row);
    cursor = addDays(cursor, 7);
    if (cursor.slice(0, 7) > month) break;
  }
  return rows;
}

/** Months (YYYY-MM-01) from the year start to `until`, inclusive. */
export function monthsBetween(from: string, until: string): string[] {
  const out: string[] = [];
  let m = startOfMonth(from);
  const end = startOfMonth(until);
  while (m <= end && out.length < 24) {
    out.push(m);
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, '0')}-01`;
  }
  return out;
}

/** Absences and lateness per period, 1…n (daily-mode whole-day marks are skipped). */
export function periodStats(days: PortalDay[], periodsPerDay: number): { period: number; absent: number; late: number }[] {
  const n = Math.max(periodsPerDay, ...days.flatMap((d) => d.items.map((i) => i.period)), 0);
  const rows = Array.from({ length: n }, (_, i) => ({ period: i + 1, absent: 0, late: 0 }));
  for (const d of days) {
    for (const i of d.items) {
      if (i.period < 1 || i.period > n) continue;
      if (i.status === 'absent') rows[i.period - 1].absent++;
      else if (i.status === 'late') rows[i.period - 1].late++;
    }
  }
  return rows;
}

// ---------------------------------------------------------------------
// Home: what needs the family's attention, and the recent activity feed
// ---------------------------------------------------------------------

export type PortalAlert = {
  key: string;
  kind: 'suspension' | 'summons' | 'pledge' | 'excuses';
  tone: 'danger' | 'warning' | 'info';
  title: string;
  reason?: string;
  /** Meeting time (ISO timestamp) or suspension start date. */
  at?: string;
  until?: string;
  returnOn?: string;
  meetingWith?: string | null;
  count?: number;
};

const ALERT_ORDER = { danger: 0, warning: 1, info: 2 } as const;

export function portalAlerts(d: PortalData, today: string, nowMs: number): PortalAlert[] {
  const out: PortalAlert[] = [];
  d.discipline.forEach((a, i) => {
    if (a.type === 'suspension' && a.suspension_from && a.suspension_to) {
      const phase = suspensionPhase(a.suspension_from, a.suspension_to, today);
      if (phase !== 'ended') {
        out.push({
          key: `s${i}`, kind: 'suspension', tone: 'danger',
          title: phase === 'active' ? 'قرار فصل مؤقت جارٍ' : 'قرار فصل مؤقت قادم',
          reason: a.reason, at: a.suspension_from, until: a.suspension_to, returnOn: returnDate(a.suspension_to),
        });
      }
    }
    if (a.type === 'guardian_summons' && a.status === 'scheduled' && a.meeting_at && Date.parse(a.meeting_at) > nowMs) {
      out.push({ key: `m${i}`, kind: 'summons', tone: 'warning', title: 'مطلوب حضور ولي الأمر', reason: a.reason, at: a.meeting_at, meetingWith: a.meeting_with });
    }
    if (a.type === 'pledge' && !a.signed_on && a.status === 'pending_signature') {
      out.push({ key: `p${i}`, kind: 'pledge', tone: 'info', title: 'تعهد بانتظار التوقيع في المدرسة', reason: a.reason });
    }
  });
  const pending = d.excuses.filter((x) => x.status === 'pending').length;
  if (pending > 0) out.push({ key: 'x', kind: 'excuses', tone: 'info', title: 'أعذار غياب قيد المراجعة', count: pending });
  return out.sort((x, y) => ALERT_ORDER[x.tone] - ALERT_ORDER[y.tone]);
}

export type FeedItem =
  | { kind: 'day'; date: string; day: PortalDay }
  | { kind: 'behavior'; date: string; item: PortalData['behavior'][number] }
  | { kind: 'action'; date: string; item: PortalAction }
  | { kind: 'career'; date: string };

/** Everything that happened, newest first. */
export function activityFeed(d: PortalData): FeedItem[] {
  const items: FeedItem[] = [
    ...d.days.map((day) => ({ kind: 'day' as const, date: day.day, day })),
    ...d.behavior.map((item) => ({ kind: 'behavior' as const, date: item.date, item })),
    ...d.discipline.map((item) => ({ kind: 'action' as const, date: item.date.slice(0, 10), item })),
    ...(d.career ? [{ kind: 'career' as const, date: d.career.submitted_at.slice(0, 10) }] : []),
  ];
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Greeting by Kuwait hour. */
export function greeting(now: Date = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuwait', hour: '2-digit', hour12: false }).format(now));
  return h >= 4 && h < 12 ? 'صباح الخير' : 'مساء الخير';
}

/** First name + family name, for compact places. */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length <= 2 ? full.trim() : `${parts[0]} ${parts[parts.length - 1]}`;
}

export function initials(full: string): string {
  const parts = full.trim().split(/\s+/);
  // Skip the definite article: «المنصور» → «م».
  const first = (w: string | undefined) => (w ? w.replace(/^ال(?=..)/, '')[0] : '');
  return first(parts[0]) + (parts.length > 1 ? first(parts[parts.length - 1]) : '');
}
