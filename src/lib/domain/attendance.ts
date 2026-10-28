/**
 * Attendance domain rules. The database (save_attendance, reporting
 * functions) is the source of truth; these mirror the same rules for the UI.
 */
export const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'excused'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
/** A mark in the UI may be unset — unmarked is NOT absent. */
export type AttendanceMark = AttendanceStatus | null;

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  excused: 'غياب بعذر',
};

export type AttendanceMode = 'daily' | 'period';

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === 'string' && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

/** Period value stored on a session: 0 for daily mode, 1..N otherwise. */
export function sessionPeriod(mode: AttendanceMode, period: number | null | undefined): number {
  return mode === 'daily' ? 0 : Math.max(1, Math.trunc(period ?? 1));
}

export function periodLabel(period: number): string {
  return period === 0 ? 'الحضور اليومي' : `الحصة ${period}`;
}

/** Identity of a session; the database enforces uniqueness on the same key. */
export function sessionKey(classId: string, date: string, period: number): string {
  return `${classId}|${date}|${period}`;
}

export type StatusCounts = Record<AttendanceStatus, number>;

export function emptyCounts(): StatusCounts {
  return { present: 0, absent: 0, late: 0, excused: 0 };
}

/** Count marks. Unmarked entries are reported separately, never as absent. */
export function countMarks(marks: Iterable<AttendanceMark>): StatusCounts & { unmarked: number; marked: number } {
  const counts = { ...emptyCounts(), unmarked: 0, marked: 0 };
  for (const m of marks) {
    if (m == null) counts.unmarked += 1;
    else {
      counts[m] += 1;
      counts.marked += 1;
    }
  }
  return counts;
}

/**
 * Attendance rate in percent (1 decimal) — same rule as
 * public.attendance_rate(): (present + late) / all marked records.
 * Returns null when nothing has been marked.
 */
export function attendanceRate(c: Pick<StatusCounts, AttendanceStatus>): number | null {
  const total = c.present + c.late + c.absent + c.excused;
  if (total === 0) return null;
  return Math.round((1000 * (c.present + c.late)) / total) / 10;
}

export type SessionCompletion = 'not_started' | 'in_progress' | 'complete' | 'submitted';

export function sessionCompletion(rosterSize: number, markedCount: number, status: 'draft' | 'submitted' | null): SessionCompletion {
  if (status === 'submitted') return 'submitted';
  if (markedCount === 0) return 'not_started';
  return markedCount >= rosterSize ? 'complete' : 'in_progress';
}

export const COMPLETION_LABELS: Record<SessionCompletion, string> = {
  not_started: 'لم يبدأ الرصد',
  in_progress: 'رصد جزئي',
  complete: 'مكتمل – بانتظار الاعتماد',
  submitted: 'معتمد',
};

/** Records changed relative to what was saved (for batch saves). */
export function changedMarks(
  saved: ReadonlyMap<string, AttendanceMark>,
  current: ReadonlyMap<string, AttendanceMark>,
): { student_id: string; status: AttendanceMark }[] {
  const out: { student_id: string; status: AttendanceMark }[] = [];
  for (const [studentId, mark] of current) {
    if ((saved.get(studentId) ?? null) !== mark) out.push({ student_id: studentId, status: mark });
  }
  return out;
}

export type ExcuseStatus = 'pending' | 'approved' | 'rejected';
export const EXCUSE_STATUS_LABELS: Record<ExcuseStatus, string> = {
  pending: 'بانتظار المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
};
export const EXCUSE_REASON_LABELS: Record<string, string> = {
  medical: 'مرضي',
  family: 'ظرف عائلي',
  official: 'مهمة رسمية',
  other: 'أخرى',
};
