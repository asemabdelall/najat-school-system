import { diffDays, formatNumber } from '../format';

/** Arabic day count with dual/plural agreement: يومًا واحدًا، يومين، ٣ أيام، ١١ يومًا */
export function arabicDays(n: number): string {
  if (n === 1) return 'يومًا واحدًا';
  if (n === 2) return 'يومين';
  if (n >= 3 && n <= 10) return `${formatNumber(n)} أيام`;
  return `${formatNumber(n)} يومًا`;
}

export const FOLLOW_UP_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];
export type FollowUpPriority = 'low' | 'normal' | 'high' | 'urgent';

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  open: 'مفتوحة',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
};
export const PRIORITY_LABELS: Record<FollowUpPriority, string> = { low: 'منخفضة', normal: 'عادية', high: 'مرتفعة', urgent: 'عاجلة' };
export const FOLLOW_UP_CATEGORY_LABELS: Record<string, string> = {
  attendance: 'الحضور والانضباط',
  behavior: 'السلوك',
  academic: 'التحصيل الدراسي',
  wellbeing: 'الرعاية والإرشاد',
  guardian_contact: 'التواصل مع ولي الأمر',
  other: 'أخرى',
};

export function isActiveFollowUp(status: FollowUpStatus): boolean {
  return status === 'open' || status === 'in_progress';
}

export type DueState = 'none' | 'overdue' | 'due_today' | 'due_soon' | 'upcoming' | 'closed';

/** Due-date state relative to Kuwait "today". Closed tasks are never overdue. */
export function dueState(status: FollowUpStatus, dueDate: string | null, today: string, soonDays = 2): DueState {
  if (!isActiveFollowUp(status)) return 'closed';
  if (!dueDate) return 'none';
  const d = diffDays(dueDate, today);
  if (d < 0) return 'overdue';
  if (d === 0) return 'due_today';
  if (d <= soonDays) return 'due_soon';
  return 'upcoming';
}

export function dueLabel(state: DueState, dueDate: string | null, today: string): string {
  if (!dueDate) return 'بدون موعد';
  const d = diffDays(dueDate, today);
  switch (state) {
    case 'overdue':
      return `متأخرة ${arabicDays(Math.abs(d))}`;
    case 'due_today':
      return 'تستحق اليوم';
    case 'due_soon':
      return d === 1 ? 'تستحق غدًا' : `تستحق خلال ${arabicDays(d)}`;
    default:
      return '';
  }
}

/** Status changes an assignee can make (managers/creators can also cancel). */
export function nextStatuses(status: FollowUpStatus, canCancel: boolean): FollowUpStatus[] {
  const base: Record<FollowUpStatus, FollowUpStatus[]> = {
    open: ['in_progress', 'completed'],
    in_progress: ['open', 'completed'],
    completed: ['in_progress'],
    cancelled: ['open'],
  };
  const list = base[status];
  return canCancel && isActiveFollowUp(status) ? [...list, 'cancelled'] : list;
}
