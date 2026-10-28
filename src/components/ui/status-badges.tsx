import { AlertTriangle, Ban, CalendarClock, Check, CheckCheck, CircleDashed, Clock, Eye, FileCheck2, Hourglass, Loader, Lock, Send, X } from 'lucide-react';
import { Badge, type BadgeTone } from './badge';
import { ATTENDANCE_LABELS, COMPLETION_LABELS, EXCUSE_STATUS_LABELS, type AttendanceMark, type ExcuseStatus, type SessionCompletion } from '@/lib/domain/attendance';
import { INCIDENT_STATUS_LABELS, SEVERITY_LABELS, type IncidentStatus, type Severity } from '@/lib/domain/behavior';
import { dueLabel, FOLLOW_UP_STATUS_LABELS, PRIORITY_LABELS, type DueState, type FollowUpPriority, type FollowUpStatus } from '@/lib/domain/followups';
import { ROLE_LABELS, type Role } from '@/lib/domain/permissions';

export function AttendanceBadge({ status }: { status: AttendanceMark }) {
  if (!status)
    return (
      <Badge tone="outline" className="border-dashed">
        <CircleDashed aria-hidden /> لم يُرصد
      </Badge>
    );
  const map = {
    present: { tone: 'success', icon: <Check aria-hidden /> },
    absent: { tone: 'danger', icon: <X aria-hidden /> },
    late: { tone: 'warning', icon: <Clock aria-hidden /> },
    excused: { tone: 'info', icon: <FileCheck2 aria-hidden /> },
  } as const;
  return (
    <Badge tone={map[status].tone}>
      {map[status].icon} {ATTENDANCE_LABELS[status]}
    </Badge>
  );
}

export function CompletionBadge({ state }: { state: SessionCompletion }) {
  const map: Record<SessionCompletion, { tone: BadgeTone; icon: React.ReactNode }> = {
    not_started: { tone: 'outline', icon: <CircleDashed aria-hidden /> },
    in_progress: { tone: 'warning', icon: <Loader aria-hidden /> },
    complete: { tone: 'info', icon: <Hourglass aria-hidden /> },
    submitted: { tone: 'success', icon: <Lock aria-hidden /> },
  };
  return (
    <Badge tone={map[state].tone}>
      {map[state].icon} {COMPLETION_LABELS[state]}
    </Badge>
  );
}

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const map: Record<IncidentStatus, { tone: BadgeTone; icon: React.ReactNode }> = {
    submitted: { tone: 'warning', icon: <Send aria-hidden /> },
    under_review: { tone: 'info', icon: <Eye aria-hidden /> },
    approved: { tone: 'brand', icon: <Check aria-hidden /> },
    rejected: { tone: 'neutral', icon: <Ban aria-hidden /> },
    resolved: { tone: 'success', icon: <CheckCheck aria-hidden /> },
  };
  return (
    <Badge tone={map[status].tone}>
      {map[status].icon} {INCIDENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const tone: Record<Severity, BadgeTone> = { low: 'neutral', medium: 'warning', high: 'danger' };
  return (
    <Badge tone={tone[severity]}>
      <span aria-hidden className="inline-flex gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`h-2.5 w-1 rounded-full ${i <= { low: 1, medium: 2, high: 3 }[severity] ? 'bg-current' : 'bg-current/25'}`} />
        ))}
      </span>
      خطورة {SEVERITY_LABELS[severity]}
    </Badge>
  );
}

export function FollowUpStatusBadge({ status }: { status: FollowUpStatus }) {
  const map: Record<FollowUpStatus, { tone: BadgeTone; icon: React.ReactNode }> = {
    open: { tone: 'info', icon: <CircleDashed aria-hidden /> },
    in_progress: { tone: 'warning', icon: <Loader aria-hidden /> },
    completed: { tone: 'success', icon: <Check aria-hidden /> },
    cancelled: { tone: 'neutral', icon: <Ban aria-hidden /> },
  };
  return (
    <Badge tone={map[status].tone}>
      {map[status].icon} {FOLLOW_UP_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: FollowUpPriority }) {
  if (priority === 'normal') return <span className="text-xs text-fg-muted">{PRIORITY_LABELS.normal}</span>;
  const tone: Record<FollowUpPriority, BadgeTone> = { low: 'outline', normal: 'neutral', high: 'warning', urgent: 'danger' };
  return (
    <Badge tone={tone[priority]}>
      {priority === 'urgent' && <AlertTriangle aria-hidden />}
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}

/** Overdue is shown with icon + words, not colour alone. */
export function DueBadge({ state, dueDate, today }: { state: DueState; dueDate: string | null; today: string }) {
  if (state === 'overdue')
    return (
      <Badge tone="danger">
        <AlertTriangle aria-hidden /> {dueLabel(state, dueDate, today)}
      </Badge>
    );
  if (state === 'due_today' || state === 'due_soon')
    return (
      <Badge tone="warning">
        <CalendarClock aria-hidden /> {dueLabel(state, dueDate, today)}
      </Badge>
    );
  return null;
}

export function ExcuseStatusBadge({ status }: { status: ExcuseStatus }) {
  const tone: Record<ExcuseStatus, BadgeTone> = { pending: 'warning', approved: 'success', rejected: 'neutral' };
  const icon = { pending: <Hourglass aria-hidden />, approved: <Check aria-hidden />, rejected: <Ban aria-hidden /> }[status];
  return (
    <Badge tone={tone[status]}>
      {icon} {EXCUSE_STATUS_LABELS[status]}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  const tone: Record<Role, BadgeTone> = { admin: 'brand', student_affairs: 'info', teacher: 'neutral' };
  return <Badge tone={tone[role]}>{ROLE_LABELS[role]}</Badge>;
}
