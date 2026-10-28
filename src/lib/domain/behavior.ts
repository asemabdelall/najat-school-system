/**
 * Behaviour incident lifecycle. Mirrors public.incident_transition_allowed
 * and the checks in public.transition_incident.
 *
 *   submitted ──► under_review ──► approved ──► resolved
 *       │               │
 *       └──────►────────┴──► rejected
 */
export const INCIDENT_STATUSES = ['submitted', 'under_review', 'approved', 'rejected', 'resolved'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export type Severity = 'low' | 'medium' | 'high';

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  submitted: 'مرفوع – بانتظار المراجعة',
  under_review: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  resolved: 'مغلق',
};

export const SEVERITY_LABELS: Record<Severity, string> = { low: 'منخفضة', medium: 'متوسطة', high: 'مرتفعة' };

const TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  submitted: ['under_review', 'approved', 'rejected'],
  under_review: ['approved', 'rejected'],
  approved: ['resolved'],
  rejected: [],
  resolved: [],
};

export function allowedTransitions(from: IncidentStatus): readonly IncidentStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Decisions and closures must be documented. */
export function transitionRequiresNote(to: IncidentStatus): boolean {
  return to === 'approved' || to === 'rejected' || to === 'resolved';
}

export function isOpenIncident(status: IncidentStatus): boolean {
  return status === 'submitted' || status === 'under_review';
}

export const TRANSITION_ACTION_LABELS: Partial<Record<IncidentStatus, string>> = {
  under_review: 'بدء المراجعة',
  approved: 'اعتماد البلاغ',
  rejected: 'رفض البلاغ',
  resolved: 'إغلاق بعد المعالجة',
};

/**
 * Whether `userId` with the given manager flag may review this incident.
 * Reviewers must be admin/student affairs and cannot review their own report.
 */
export function canReviewIncident(opts: { isManager: boolean; userId: string; reportedBy: string | null; status: IncidentStatus }) {
  return opts.isManager && opts.reportedBy !== opts.userId && allowedTransitions(opts.status).length > 0;
}
