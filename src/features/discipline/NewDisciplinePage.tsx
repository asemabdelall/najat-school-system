import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { m } from 'motion/react';
import { toast } from 'sonner';
import { Flag, Info, Save, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Checkbox, Input, Textarea } from '@/components/ui/input';
import { StudentPicker, type PickedStudent } from '@/components/StudentPicker';
import { UnsavedChangesDialog } from '@/components/ui/unsaved-changes-dialog';
import { supabase } from '@/lib/supabase';
import { errorMessage, unwrap } from '@/lib/errors';
import { addDays, formatDate, formatNumber, isSchoolDay, kuwaitToday } from '@/lib/format';
import { useUnsavedChanges } from '@/lib/hooks';
import { spring } from '@/lib/motion';
import { useYearScope } from '@/lib/queries';
import { cn } from '@/lib/utils';
import {
  DISCIPLINE_TYPE_DESCRIPTIONS, DISCIPLINE_TYPE_LABELS, DISCIPLINE_TYPES, INITIAL_STATUS, defaultPledgeText, returnDate, schoolDaysBetween,
  validateDiscipline, type DisciplineType,
} from '@/lib/domain/discipline';
import { kuwaitLocalToIso, useCreateDiscipline } from './api';
import { TYPE_ICON } from './DisciplinePage';

function nextSchoolDay(d: string) {
  let x = addDays(d, 1);
  while (!isSchoolDay(x)) x = addDays(x, 1);
  return x;
}

export function NewDisciplinePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const today = kuwaitToday();
  const { yearId } = useYearScope();
  const create = useCreateDiscipline();

  const [type, setType] = React.useState<DisciplineType>((DISCIPLINE_TYPES as readonly string[]).includes(params.get('type') ?? '') ? (params.get('type') as DisciplineType) : 'guardian_summons');
  const [student, setStudent] = React.useState<PickedStudent[]>([]);
  const [incidentId, setIncidentId] = React.useState<string | null>(params.get('incident'));
  const [reason, setReason] = React.useState('');
  const [meetingAt, setMeetingAt] = React.useState(`${nextSchoolDay(today)}T09:00`);
  const [meetingWith, setMeetingWith] = React.useState('شؤون الطلبة');
  const [from, setFrom] = React.useState(nextSchoolDay(today));
  const [to, setTo] = React.useState(nextSchoolDay(today));
  const [decisionNumber, setDecisionNumber] = React.useState('');
  const [pledgeText, setPledgeText] = React.useState('');
  const [pledgeEdited, setPledgeEdited] = React.useState(false);
  const [signedNow, setSignedNow] = React.useState(false);
  const [errors, setErrors] = React.useState<ReturnType<typeof validateDiscipline> & { student?: string }>({});
  const [done, setDone] = React.useState(false);

  // Prefill the student (from a profile) and keep the class for the pledge wording.
  const studentParam = params.get('student');
  const prefill = useQuery({
    queryKey: ['discipline', 'prefill-student', studentParam, yearId],
    enabled: Boolean(studentParam) && Boolean(yearId),
    queryFn: async () => {
      const s = unwrap(await supabase.from('students').select('id, full_name, student_number, enrollments(academic_year_id, status, school_classes(name))').eq('id', studentParam!).maybeSingle());
      if (!s) return null;
      const enr = s.enrollments.find((e) => e.academic_year_id === yearId && e.status === 'active');
      return { id: s.id, full_name: s.full_name, student_number: s.student_number, class_name: enr?.school_classes?.name ?? null } satisfies PickedStudent;
    },
  });
  React.useEffect(() => {
    if (prefill.data) setStudent([prefill.data]);
  }, [prefill.data]);

  const incident = useQuery({
    queryKey: ['discipline', 'prefill-incident', incidentId],
    enabled: Boolean(incidentId),
    queryFn: async () => unwrap(await supabase.from('behavior_incidents').select('id, incident_date, behavior_categories(name)').eq('id', incidentId!).maybeSingle()),
  });
  React.useEffect(() => {
    const cat = incident.data?.behavior_categories?.name;
    if (cat && !reason) setReason(cat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident.data]);

  // The default pledge wording follows the student and reason until it is edited by hand.
  React.useEffect(() => {
    if (!pledgeEdited && student[0]) setPledgeText(defaultPledgeText(student[0].full_name, student[0].class_name, reason));
  }, [student, reason, pledgeEdited]);

  const dirty = !done && (student.length > 0 || reason.trim() !== '');
  const { blocker, release } = useUnsavedChanges(dirty);
  const days = schoolDaysBetween(from, to);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validateDiscipline({ type, reason, meetingAt, suspensionFrom: from, suspensionTo: to, pledgeText });
    const errs = { ...v, ...(student[0] ? {} : { student: 'اختر الطالب' }) };
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      const id = await create.mutateAsync({
        student_id: student[0].id,
        action_type: type,
        status: type === 'pledge' && signedNow ? 'signed' : INITIAL_STATUS[type],
        reason: reason.trim(),
        incident_id: incidentId,
        ...(type === 'guardian_summons' && { meeting_at: kuwaitLocalToIso(meetingAt), meeting_with: meetingWith.trim() || null }),
        ...(type === 'suspension' && { suspension_from: from, suspension_to: to, decision_number: decisionNumber.trim() || null }),
        ...(type === 'pledge' && { pledge_text: pledgeText.trim(), signed_on: signedNow ? today : null }),
      });
      setDone(true);
      release();
      toast.success(`تم تسجيل ${DISCIPLINE_TYPE_LABELS[type]}`);
      navigate(`/discipline/${id}`, { replace: true });
    } catch (err) {
      toast.error(errorMessage(err), { duration: 8000 });
    }
  };

  return (
    <>
      <PageHeader title={`إجراء جديد: ${DISCIPLINE_TYPE_LABELS[type]}`} breadcrumbs={[{ label: 'الجزاءات', to: '/discipline' }, { label: 'إجراء جديد' }]} />
      <form onSubmit={submit} noValidate className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <div role="radiogroup" aria-label="نوع الإجراء" className="grid gap-3 sm:grid-cols-3">
            {DISCIPLINE_TYPES.map((t) => {
              const Icon = TYPE_ICON[t];
              const on = t === type;
              return (
                <m.button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setType(t)}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    'relative flex flex-col items-start gap-1 rounded-lg border p-4 text-start transition-colors',
                    on ? 'border-transparent text-white' : 'border-line bg-surface hover:border-line-strong',
                  )}
                >
                  {on && <m.span layoutId="disc-type" transition={spring.indicator} className="absolute inset-0 rounded-lg shadow-md [background:var(--brand-gradient)]" aria-hidden />}
                  <Icon className={cn('relative size-5', on ? 'text-white' : 'text-brand dark:text-link')} aria-hidden />
                  <span className="relative font-bold">{DISCIPLINE_TYPE_LABELS[t]}</span>
                  <span className={cn('relative text-xs leading-relaxed', on ? 'text-white/85' : 'text-fg-muted')}>{DISCIPLINE_TYPE_DESCRIPTIONS[t]}</span>
                </m.button>
              );
            })}
          </div>

          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="الطالب" htmlFor="disc-student" required noClone error={errors.student} className="sm:col-span-2">
                <StudentPicker id="disc-student" value={student} onChange={setStudent} invalid={Boolean(errors.student)} />
              </Field>

              {incidentId && (
                <div className="flex items-center gap-2 rounded-md border border-info-line bg-info-soft px-3 py-2 text-sm text-info sm:col-span-2">
                  <Flag className="size-4 shrink-0" aria-hidden />
                  <span className="flex-1">
                    مرتبط ببلاغ سلوكي{incident.data ? `: ${incident.data.behavior_categories?.name ?? ''} بتاريخ ${formatDate(incident.data.incident_date)}` : ''}.{' '}
                    <Link to={`/behavior/${incidentId}`} className="underline">عرض البلاغ</Link>
                  </span>
                  <Button size="icon-sm" variant="ghost" aria-label="إلغاء الربط بالبلاغ" onClick={() => setIncidentId(null)}><X /></Button>
                </div>
              )}

              <Field label="سبب الإجراء" htmlFor="disc-reason" required error={errors.reason} className="sm:col-span-2" hint="يظهر في المستند المطبوع. اكتب بموضوعية.">
                <Textarea rows={3} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
              </Field>

              {type === 'guardian_summons' && (
                <>
                  <Field label="موعد الحضور" htmlFor="disc-meeting" required error={errors.meetingAt}>
                    <Input type="datetime-local" value={meetingAt} min={`${today}T00:00`} onChange={(e) => setMeetingAt(e.target.value)} />
                  </Field>
                  <Field label="المقابلة مع" htmlFor="disc-with" hint="مثال: مدير المدرسة، الأخصائي الاجتماعي">
                    <Input value={meetingWith} maxLength={120} onChange={(e) => setMeetingWith(e.target.value)} />
                  </Field>
                </>
              )}

              {type === 'suspension' && (
                <>
                  <Field label="من تاريخ" htmlFor="disc-from" required error={errors.suspensionFrom}>
                    <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value); }} />
                  </Field>
                  <Field label="إلى تاريخ" htmlFor="disc-to" required error={errors.suspensionTo}>
                    <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                  </Field>
                  <Field label="رقم القرار" htmlFor="disc-number" hint="اختياري">
                    <Input dir="ltr" className="text-start" value={decisionNumber} maxLength={40} onChange={(e) => setDecisionNumber(e.target.value)} />
                  </Field>
                  <div className="flex items-end">
                    <p className="w-full rounded-md bg-surface-sunken px-3 py-2.5 text-sm">
                      <span className="font-bold tabular">{formatNumber(days)}</span> يوم دراسي · العودة يوم <span className="font-bold">{from && to >= from ? formatDate(returnDate(to)) : '—'}</span>
                    </p>
                  </div>
                </>
              )}

              {type === 'pledge' && (
                <>
                  <Field label="نص التعهد" htmlFor="disc-pledge" required error={errors.pledgeText} className="sm:col-span-2" hint="يُكتب تلقائيًا من اسم الطالب والسبب، ويمكن تعديله.">
                    <Textarea rows={5} value={pledgeText} maxLength={3000} onChange={(e) => { setPledgeText(e.target.value); setPledgeEdited(true); }} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <Checkbox checked={signedNow} onChange={(e) => setSignedNow(e.target.checked)} /> وقّع الطالب وولي الأمر الآن (تاريخ اليوم)
                  </label>
                </>
              )}

              <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
                <Button variant="secondary" onClick={() => navigate(-1)}>إلغاء</Button>
                <Button type="submit" loading={create.isPending}><Save /> حفظ الإجراء</Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <aside className="self-start rounded-lg border border-info-line bg-info-soft p-4 text-sm text-info">
          <p className="mb-2 flex items-center gap-2 font-bold"><Info className="size-4" aria-hidden /> قبل الحفظ</p>
          <ul className="list-disc space-y-1.5 ps-5">
            <li>الجزاءات تظهر لشؤون الطلبة والإدارة فقط.</li>
            <li>لا يُحذف أي إجراء؛ يُلغى مع ذكر السبب ويبقى في السجل.</li>
            <li>بعد الحفظ يمكنك طباعة المستند الرسمي من صفحة الإجراء.</li>
          </ul>
        </aside>
      </form>
      <UnsavedChangesDialog blocker={blocker} />
    </>
  );
}
