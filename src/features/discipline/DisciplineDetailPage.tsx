import * as React from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Ban, CalendarClock, CheckCircle2, Flag, Lock, PenLine, Printer, UserX } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, formatNumber, formatTime, formatWeekday, kuwaitToday } from '@/lib/format';
import { useSchoolSettings } from '@/lib/queries';
import {
  DISCIPLINE_STATUS_LABELS, DISCIPLINE_STATUS_TONE, DISCIPLINE_TYPE_LABELS, SUSPENSION_PHASE_LABELS, nextStatuses, returnDate,
  schoolDaysBetween, suspensionPhase, type DisciplineStatus, type DisciplineType,
} from '@/lib/domain/discipline';
import { isoToKuwaitLocal, kuwaitLocalToIso, useDiscipline, useUpdateDiscipline } from './api';
import { TYPE_ICON } from './DisciplinePage';

type Action = NonNullable<ReturnType<typeof useDiscipline>['data']>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 border-b border-line py-2.5 text-sm last:border-0">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 font-semibold text-fg">{children}</dd>
    </div>
  );
}

/** The official letter, printed on its own (the app chrome is hidden in print). */
function OfficialDocument({ a, schoolName }: { a: Action; schoolName: string }) {
  const student = a.students;
  const cls = a.class_name ? `الصف ${a.class_name}` : '';
  const issued = formatDate(a.created_at.slice(0, 10));
  const sig = (label: string) => (
    <div className="text-center">
      <p className="font-bold">{label}</p>
      <p className="mt-10 border-t border-dashed border-current pt-1 text-xs opacity-70">الاسم والتوقيع</p>
    </div>
  );
  return (
    <article className="mx-auto max-w-[44rem] rounded-lg border border-line bg-white p-8 text-base leading-loose text-slate-900 shadow-sm print:max-w-none print:border-0 print:p-0 print:shadow-none" dir="rtl" aria-label="المستند الرسمي">
      <header className="mb-6 flex items-start justify-between gap-4 border-b-2 border-[#004d72] pb-4">
        <div className="text-sm leading-relaxed">
          <p className="font-bold">{schoolName}</p>
          <p>العام الدراسي {a.academic_years?.name}</p>
        </div>
        <img src="/brand/alnajat-logo.png" alt="" className="h-16 w-auto" />
        <div className="text-start text-sm leading-relaxed">
          <p>التاريخ: {issued}</p>
          {a.action_type === 'suspension' && a.decision_number && <p>رقم القرار: <span className="ltr tabular">{a.decision_number}</span></p>}
        </div>
      </header>

      {a.action_type === 'guardian_summons' && (
        <>
          <h2 className="mb-5 text-center text-xl font-bold">استدعاء ولي أمر</h2>
          <p>السيد / ولي أمر الطالب <b>{student?.full_name}</b> {cls && <>المقيد بـ<b>{cls}</b></>} المحترم،</p>
          <p>تحية طيبة وبعد،</p>
          <p>
            نرجو التكرم بالحضور إلى المدرسة يوم <b>{a.meeting_at && formatWeekday(isoToKuwaitLocal(a.meeting_at).slice(0, 10))}</b> الموافق <b>{a.meeting_at && formatDate(isoToKuwaitLocal(a.meeting_at).slice(0, 10))}</b> الساعة <b>{a.meeting_at && formatTime(a.meeting_at)}</b>
            {a.meeting_with && <> لمقابلة <b>{a.meeting_with}</b></>}، وذلك بخصوص: {a.reason}.
          </p>
          <p>شاكرين لكم حسن تعاونكم وحرصكم على مصلحة ابنكم.</p>
          <div className="mt-12 grid grid-cols-2 gap-10">{sig('شؤون الطلبة')}{sig('مدير المدرسة')}</div>
        </>
      )}

      {a.action_type === 'suspension' && a.suspension_from && a.suspension_to && (
        <>
          <h2 className="mb-5 text-center text-xl font-bold">قرار فصل مؤقت</h2>
          <p>بناءً على ما صدر من الطالب <b>{student?.full_name}</b> {cls && <>المقيد بـ<b>{cls}</b></>}، وهو: {a.reason}،</p>
          <p>
            وعملًا باللائحة المنظمة للسلوك الطلابي، تقرر فصل الطالب المذكور فصلًا مؤقتًا لمدة <b>{formatNumber(schoolDaysBetween(a.suspension_from, a.suspension_to))}</b> يوم دراسي،
            اعتبارًا من يوم <b>{formatWeekday(a.suspension_from)} {formatDate(a.suspension_from)}</b> حتى يوم <b>{formatWeekday(a.suspension_to)} {formatDate(a.suspension_to)}</b>،
            على أن يعود إلى الدراسة يوم <b>{formatWeekday(returnDate(a.suspension_to))} {formatDate(returnDate(a.suspension_to))}</b> مصحوبًا بولي أمره.
          </p>
          <div className="mt-12 grid grid-cols-2 gap-10">{sig('مدير المدرسة')}{sig('ولي الأمر (بالعلم)')}</div>
        </>
      )}

      {a.action_type === 'pledge' && (
        <>
          <h2 className="mb-5 text-center text-xl font-bold">تعهد</h2>
          <p className="whitespace-pre-line">{a.pledge_text}</p>
          {a.signed_on && <p className="mt-4 text-sm">تاريخ التوقيع: {formatDate(a.signed_on)}</p>}
          <div className="mt-12 grid grid-cols-3 gap-8">{sig('الطالب')}{sig('ولي الأمر')}{sig('شؤون الطلبة')}</div>
        </>
      )}
    </article>
  );
}

export function DisciplineDetailPage() {
  const { actionId } = useParams();
  const settings = useSchoolSettings();
  const q = useDiscipline(actionId);
  const update = useUpdateDiscipline(actionId ?? '');
  const [dialog, setDialog] = React.useState<null | 'attended' | 'no_show' | 'reschedule' | 'sign' | 'cancel'>(null);
  const [attendee, setAttendee] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [when, setWhen] = React.useState('');
  const [signedOn, setSignedOn] = React.useState(kuwaitToday());

  if (q.isPending) return <LoadingState rows={8} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const a = q.data;
  if (!a) return <EmptyState title="الإجراء غير موجود أو لا تملك صلاحية عرضه" action={<Button asChild variant="secondary"><Link to="/discipline">العودة للجزاءات</Link></Button>} />;

  const type = a.action_type as DisciplineType;
  const status = a.status as DisciplineStatus;
  const Icon = TYPE_ICON[type];
  const closedYear = a.academic_years?.status === 'closed';
  const options = closedYear ? [] : nextStatuses(type, status);
  const today = kuwaitToday();

  const apply = async (patch: Parameters<typeof update.mutateAsync>[0], ok: string) => {
    try {
      await update.mutateAsync(patch);
      toast.success(ok);
      setDialog(null);
      setNotes('');
    } catch (e) {
      toast.error(errorMessage(e), { duration: 8000 });
    }
  };

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={DISCIPLINE_TYPE_LABELS[type]}
          breadcrumbs={[{ label: 'الجزاءات', to: '/discipline' }, { label: a.students?.full_name ?? '' }]}
          description={<span className="inline-flex flex-wrap items-center gap-2"><Badge tone={DISCIPLINE_STATUS_TONE[status]}>{DISCIPLINE_STATUS_LABELS[status]}</Badge> {a.students?.full_name}{a.class_name && ` · ${a.class_name}`}</span>}
          actions={
            <>
              {options.includes('attended') && <Button onClick={() => { setAttendee(a.students?.guardian_name ?? ''); setDialog('attended'); }}><CheckCircle2 /> حضر ولي الأمر</Button>}
              {options.includes('no_show') && <Button variant="secondary" onClick={() => setDialog('no_show')}><UserX /> لم يحضر</Button>}
              {options.includes('scheduled') && <Button onClick={() => { setWhen(a.meeting_at ? isoToKuwaitLocal(a.meeting_at) : ''); setDialog('reschedule'); }}><CalendarClock /> موعد جديد</Button>}
              {options.includes('signed') && <Button onClick={() => setDialog('sign')}><PenLine /> تسجيل التوقيع</Button>}
              <Button variant="secondary" onClick={() => window.print()}><Printer /> طباعة المستند</Button>
              {options.includes('cancelled') && <Button variant="danger-ghost" onClick={() => setDialog('cancel')}><Ban /> إلغاء</Button>}
            </>
          }
        />
        {closedYear && (
          <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-neutral-line bg-neutral-soft p-3 text-sm text-neutral">
            <Lock className="size-4 shrink-0" aria-hidden /> هذا الإجراء من عام دراسي مغلق، وهو للعرض فقط.
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        <Card className="no-print self-start">
          <CardHeader icon={<Icon />} title="تفاصيل الإجراء" />
          <dl className="px-5 py-1">
            <Row label="الطالب"><Link to={`/students/${a.student_id}`} className="hover:text-link hover:underline">{a.students?.full_name}</Link></Row>
            <Row label="الفصل">{a.class_name ?? '—'}</Row>
            <Row label="السبب"><span className="whitespace-pre-line font-normal">{a.reason}</span></Row>
            {type === 'guardian_summons' && (
              <>
                <Row label="الموعد">{a.meeting_at ? formatDateTime(a.meeting_at) : '—'}</Row>
                <Row label="المقابلة مع">{a.meeting_with ?? '—'}</Row>
                {a.attendee_name && <Row label="الحاضر">{a.attendee_name}</Row>}
              </>
            )}
            {type === 'suspension' && a.suspension_from && a.suspension_to && (
              <>
                <Row label="المدة">{formatDate(a.suspension_from)} – {formatDate(a.suspension_to)}</Row>
                <Row label="الأيام الدراسية">{formatNumber(schoolDaysBetween(a.suspension_from, a.suspension_to))}</Row>
                <Row label="تاريخ العودة">{formatDate(returnDate(a.suspension_to))}</Row>
                {status === 'issued' && <Row label="الوضع الآن">{SUSPENSION_PHASE_LABELS[suspensionPhase(a.suspension_from, a.suspension_to, today)]}</Row>}
                {a.decision_number && <Row label="رقم القرار"><span className="ltr tabular">{a.decision_number}</span></Row>}
              </>
            )}
            {type === 'pledge' && <Row label="التوقيع">{a.signed_on ? formatDate(a.signed_on) : 'لم يُوقّع بعد'}</Row>}
            {a.outcome_notes && <Row label="النتيجة"><span className="whitespace-pre-line font-normal">{a.outcome_notes}</span></Row>}
            {a.cancel_reason && <Row label="سبب الإلغاء"><span className="font-normal">{a.cancel_reason}</span></Row>}
            {a.behavior_incidents && (
              <Row label="البلاغ المرتبط">
                <Link to={`/behavior/${a.behavior_incidents.id}`} className="inline-flex items-center gap-1 text-link hover:underline"><Flag className="size-3.5" aria-hidden />{a.behavior_incidents.behavior_categories?.name} · {formatDate(a.behavior_incidents.incident_date)}</Link>
              </Row>
            )}
            <Row label="أصدره">{a.issuer?.full_name ?? '—'} · <span className="font-normal text-fg-muted">{formatDateTime(a.created_at)}</span></Row>
            {a.updater && <Row label="آخر تحديث">{a.updater.full_name} · <span className="font-normal text-fg-muted">{formatDateTime(a.updated_at)}</span></Row>}
          </dl>
        </Card>

        <div>
          <p className="no-print mb-2 text-xs font-semibold text-fg-muted">معاينة المستند الرسمي (يُطبع وحده من زر «طباعة المستند»)</p>
          {status === 'cancelled' ? (
            <Card><EmptyState icon={<Ban />} title="الإجراء ملغى" description="لا يُطبع مستند لإجراء ملغى." /></Card>
          ) : (
            <OfficialDocument a={a} schoolName={settings.data?.school_name_ar ?? ''} />
          )}
        </div>
      </div>

      {/* Attended */}
      <Dialog open={dialog === 'attended'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="تسجيل حضور ولي الأمر" size="sm">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void apply({ status: 'attended', attendee_name: attendee.trim() || null, outcome_notes: notes.trim() || null }, 'تم تسجيل الحضور'); }}>
            <Field label="اسم الحاضر" htmlFor="att-name" hint="مثال: الأب، الأخ الأكبر"><Input value={attendee} maxLength={120} onChange={(e) => setAttendee(e.target.value)} /></Field>
            <Field label="نتيجة المقابلة" htmlFor="att-notes"><Textarea rows={4} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} /></Field>
            <DialogFooter><Button variant="secondary" onClick={() => setDialog(null)}>إلغاء</Button><Button type="submit" loading={update.isPending}>حفظ</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reschedule */}
      <Dialog open={dialog === 'reschedule'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="تحديد موعد جديد" size="sm">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!when) return toast.error('حدّد الموعد'); void apply({ status: 'scheduled', meeting_at: kuwaitLocalToIso(when) }, 'تم تحديد موعد جديد'); }}>
            <Field label="الموعد الجديد" htmlFor="re-when" required><Input type="datetime-local" value={when} min={`${today}T00:00`} onChange={(e) => setWhen(e.target.value)} /></Field>
            <DialogFooter><Button variant="secondary" onClick={() => setDialog(null)}>إلغاء</Button><Button type="submit" loading={update.isPending}>حفظ الموعد</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Signed */}
      <Dialog open={dialog === 'sign'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="تسجيل توقيع التعهد" description="بعد التسجيل لا يمكن تعديل نص التعهد." size="sm">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void apply({ status: 'signed', signed_on: signedOn }, 'تم تسجيل التوقيع'); }}>
            <Field label="تاريخ التوقيع" htmlFor="sign-on" required><Input type="date" value={signedOn} max={today} onChange={(e) => setSignedOn(e.target.value)} /></Field>
            <DialogFooter><Button variant="secondary" onClick={() => setDialog(null)}>إلغاء</Button><Button type="submit" loading={update.isPending}>تسجيل</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog === 'no_show'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="لم يحضر ولي الأمر"
        description="يُسجَّل عدم الحضور، ويمكن تحديد موعد جديد لاحقًا."
        confirmLabel="تسجيل"
        reasonLabel="ملاحظات (مثال: تم التواصل هاتفيًا)"
        loading={update.isPending}
        onConfirm={(r) => void apply({ status: 'no_show', outcome_notes: r }, 'تم تسجيل عدم الحضور')}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        tone="danger"
        title={`إلغاء ${DISCIPLINE_TYPE_LABELS[type]}`}
        description="يبقى الإجراء في السجل بحالة «ملغى» مع سبب الإلغاء، ولا يمكن التراجع."
        confirmLabel="إلغاء الإجراء"
        reasonLabel="سبب الإلغاء"
        loading={update.isPending}
        onConfirm={(r) => void apply({ status: 'cancelled', cancel_reason: r }, 'تم إلغاء الإجراء')}
      />
    </>
  );
}
