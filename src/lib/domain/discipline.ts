/**
 * Discipline (الجزاءات): guardian summons, suspension decisions and pledges.
 * Mirrors public.discipline_transition_allowed() and the table checks so the
 * UI only offers valid actions; the database enforces them again.
 */
import { addDays, isSchoolDay } from '@/lib/format';

export const DISCIPLINE_TYPES = ['guardian_summons', 'suspension', 'pledge'] as const;
export type DisciplineType = (typeof DISCIPLINE_TYPES)[number];

export const DISCIPLINE_TYPE_LABELS: Record<DisciplineType, string> = {
  guardian_summons: 'استدعاء ولي أمر',
  suspension: 'قرار فصل مؤقت',
  pledge: 'تعهد',
};

export const DISCIPLINE_TYPE_DESCRIPTIONS: Record<DisciplineType, string> = {
  guardian_summons: 'تحديد موعد لمقابلة ولي الأمر وتوثيق حضوره ونتيجة المقابلة.',
  suspension: 'قرار فصل مؤقت من الدراسة لعدد من الأيام، مع رقم القرار وتاريخ العودة.',
  pledge: 'تعهد مكتوب يوقّعه الطالب وولي أمره بعدم تكرار المخالفة.',
};

export type DisciplineStatus = 'scheduled' | 'attended' | 'no_show' | 'issued' | 'pending_signature' | 'signed' | 'cancelled';

export const DISCIPLINE_STATUS_LABELS: Record<DisciplineStatus, string> = {
  scheduled: 'موعد قادم',
  attended: 'حضر ولي الأمر',
  no_show: 'لم يحضر',
  issued: 'صادر',
  pending_signature: 'بانتظار التوقيع',
  signed: 'موقّع',
  cancelled: 'ملغى',
};

export const DISCIPLINE_STATUS_TONE: Record<DisciplineStatus, 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'brand'> = {
  scheduled: 'info',
  attended: 'success',
  no_show: 'warning',
  issued: 'danger',
  pending_signature: 'warning',
  signed: 'success',
  cancelled: 'neutral',
};

export const INITIAL_STATUS: Record<DisciplineType, DisciplineStatus> = {
  guardian_summons: 'scheduled',
  suspension: 'issued',
  pledge: 'pending_signature',
};

const TRANSITIONS: Record<DisciplineType, Partial<Record<DisciplineStatus, DisciplineStatus[]>>> = {
  guardian_summons: { scheduled: ['attended', 'no_show', 'cancelled'], no_show: ['scheduled'] },
  suspension: { issued: ['cancelled'] },
  pledge: { pending_signature: ['signed', 'cancelled'] },
};

export function nextStatuses(type: DisciplineType, status: DisciplineStatus): DisciplineStatus[] {
  return TRANSITIONS[type][status] ?? [];
}

export function canTransition(type: DisciplineType, from: DisciplineStatus, to: DisciplineStatus): boolean {
  return from === to || nextStatuses(type, from).includes(to);
}

/** School days (Sunday–Thursday) between two dates, inclusive. */
export function schoolDaysBetween(from: string, to: string): number {
  if (!from || !to || to < from) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isSchoolDay(d)) n++;
  return n;
}

/** The first school day after the suspension ends (the student's return date). */
export function returnDate(to: string): string {
  let d = addDays(to, 1);
  while (!isSchoolDay(d)) d = addDays(d, 1);
  return d;
}

/** Suspension state on a given day, for badges: upcoming / in progress / finished. */
export function suspensionPhase(from: string, to: string, today: string): 'upcoming' | 'active' | 'ended' {
  if (today < from) return 'upcoming';
  if (today > to) return 'ended';
  return 'active';
}

export const SUSPENSION_PHASE_LABELS = { upcoming: 'لم يبدأ', active: 'جارٍ الآن', ended: 'انتهى' } as const;

export const MAX_SUSPENSION_DAYS = 30;

/** Validation shared by the form (the database repeats it with the same messages). */
export function validateDiscipline(v: {
  type: DisciplineType;
  reason: string;
  meetingAt?: string;
  suspensionFrom?: string;
  suspensionTo?: string;
  pledgeText?: string;
}): Partial<Record<'reason' | 'meetingAt' | 'suspensionFrom' | 'suspensionTo' | 'pledgeText', string>> {
  const e: Partial<Record<'reason' | 'meetingAt' | 'suspensionFrom' | 'suspensionTo' | 'pledgeText', string>> = {};
  if (v.reason.trim().length < 3) e.reason = 'اذكر سبب الإجراء (3 أحرف على الأقل)';
  if (v.type === 'guardian_summons' && !v.meetingAt) e.meetingAt = 'حدّد موعد الاستدعاء';
  if (v.type === 'suspension') {
    if (!v.suspensionFrom) e.suspensionFrom = 'حدّد تاريخ البداية';
    if (!v.suspensionTo) e.suspensionTo = 'حدّد تاريخ النهاية';
    else if (v.suspensionFrom && v.suspensionTo < v.suspensionFrom) e.suspensionTo = 'تاريخ النهاية قبل البداية';
    else if (v.suspensionFrom && addDays(v.suspensionFrom, MAX_SUSPENSION_DAYS) < v.suspensionTo) e.suspensionTo = 'المدة لا تتجاوز 30 يومًا';
  }
  if (v.type === 'pledge' && (v.pledgeText ?? '').trim().length < 10) e.pledgeText = 'نص التعهد مطلوب (10 أحرف على الأقل)';
  return e;
}

/** Default pledge wording, filled with the student's name and class. */
export function defaultPledgeText(studentName: string, className: string | null, reason: string): string {
  const cls = className ? ` المقيد بالصف ${className}` : '';
  const about = reason.trim() ? ` بخصوص: ${reason.trim()}` : '';
  return (
    `أتعهد أنا الطالب / ${studentName}${cls}، بالالتزام بأنظمة المدرسة ولوائحها، وبعدم تكرار المخالفة${about}. ` +
    'وفي حال تكرارها أتحمّل الإجراءات التي تتخذها إدارة المدرسة وفق اللائحة المعمول بها، وعلى ذلك أوقّع.'
  );
}
