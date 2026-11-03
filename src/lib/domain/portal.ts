/**
 * Guardian & student portal: the shape returned by public.portal_data()
 * and the small presentation rules the portal uses.
 */
import type { AttendanceStatus } from './attendance';

export type PortalDay = { day: string; items: { period: number; status: AttendanceStatus; minutes_late: number | null }[] };

export type PortalData = {
  school: string | null;
  student: {
    full_name: string;
    student_number: string;
    civil_id_last4: string;
    status: string;
    guardian_name: string | null;
    class_name: string | null;
    grade_level: number | null;
    year_name: string | null;
    year_closed: boolean;
  };
  attendance: { present: number; late: number; absent: number; excused: number; absent_days: number; recorded_days: number; rate: number | null };
  days: PortalDay[];
  excuses: { from: string; to: string; reason_type: string; status: 'pending' | 'approved' | 'rejected' }[];
  behavior: { date: string; category: string; severity: 'low' | 'medium' | 'high'; status: 'approved' | 'resolved' }[];
  discipline: {
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
  }[];
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

/** Short summary of one day's non-present marks, e.g. "غياب: الحصة ١، ٢ · تأخر: الحصة ٣". */
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
