import * as React from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { CheckCircle2, Flag, ListPlus, MessageSquarePlus, Pencil, Send } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { IncidentStatusBadge, SeverityBadge } from '@/components/ui/status-badges';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  allowedTransitions, canReviewIncident, INCIDENT_STATUS_LABELS, SEVERITY_LABELS, TRANSITION_ACTION_LABELS, transitionRequiresNote,
  type IncidentStatus, type Severity,
} from '@/lib/domain/behavior';
import { useAddIncidentAction, useEditIncident, useIncident, useTransitionIncident } from './api';

const ACTION_LABELS: Record<string, string> = { submitted: 'رفع البلاغ', edited: 'تعديل', status_change: 'تغيير الحالة', note: 'ملاحظة', action_taken: 'إجراء متخذ' };

export function IncidentDetailPage() {
  const { incidentId } = useParams();
  const { profile, isManager } = useAuth();
  const q = useIncident(incidentId);
  const transition = useTransitionIncident(incidentId ?? '');
  const addAction = useAddIncidentAction(incidentId ?? '');
  const edit = useEditIncident(incidentId ?? '');
  const [target, setTarget] = React.useState<IncidentStatus | null>(null);
  const [noteType, setNoteType] = React.useState<'note' | 'action_taken'>('note');
  const [note, setNote] = React.useState('');
  const [editOpen, setEditOpen] = React.useState(false);
  const [draft, setDraft] = React.useState({ description: '', location: '', severity: 'low' as Severity });

  if (q.isPending) return <LoadingState rows={8} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <EmptyState icon={<Flag />} title="البلاغ غير موجود أو غير متاح لك" action={<Button asChild variant="secondary"><Link to="/behavior">العودة للبلاغات</Link></Button>} />;

  const { incident: i, actions } = q.data;
  const status = i.status as IncidentStatus;
  const canReview = canReviewIncident({ isManager, userId: profile?.id ?? '', reportedBy: i.reported_by, status });
  const isReporter = i.reported_by === profile?.id;
  const students = i.incident_students.map((s) => s.students).filter(Boolean);
  const firstStudent = students[0];

  return (
    <>
      <PageHeader
        title={`بلاغ: ${i.behavior_categories?.name ?? ''}`}
        breadcrumbs={[{ label: 'السلوك الطلابي', to: '/behavior' }, { label: formatDate(i.incident_date) }]}
        description={<span className="flex flex-wrap items-center gap-2"><IncidentStatusBadge status={status} /><SeverityBadge severity={i.severity as Severity} /></span>}
        actions={
          <>
            {isReporter && status === 'submitted' && (
              <Button variant="secondary" onClick={() => { setDraft({ description: i.description, location: i.location ?? '', severity: i.severity as Severity }); setEditOpen(true); }}>
                <Pencil /> تعديل البلاغ
              </Button>
            )}
            {isManager && firstStudent && (
              <Button asChild variant="secondary">
                <Link to={`/follow-ups?new=1&student=${firstStudent.id}&incident=${i.id}&category=behavior`}><ListPlus /> إنشاء مهمة متابعة</Link>
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_24rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="تفاصيل الواقعة" />
            <CardContent className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-fg-muted">تاريخ الواقعة</dt><dd className="font-semibold">{formatDate(i.incident_date)}</dd></div>
                <div><dt className="text-fg-muted">المكان</dt><dd className="font-semibold">{i.location ?? '—'}</dd></div>
                <div><dt className="text-fg-muted">مقدم البلاغ</dt><dd className="font-semibold">{i.reporter?.full_name ?? '—'} <span className="block text-xs font-normal text-fg-muted">{formatDateTime(i.created_at)}</span></dd></div>
              </dl>
              <div>
                <p className="mb-1 text-sm text-fg-muted">الطلاب المعنيون</p>
                <ul className="flex flex-wrap gap-2">
                  {students.map((s) => (
                    <li key={s!.id}><Link to={`/students/${s!.id}`} className="inline-flex rounded-full border border-line bg-surface-sunken px-3 py-1 text-sm font-semibold hover:border-line-strong hover:text-link">{s!.full_name}</Link></li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-sm text-fg-muted">الوصف</p>
                {/* Rendered as plain text — never as HTML. */}
                <p className="whitespace-pre-line rounded-md bg-surface-sunken p-4 leading-relaxed">{i.description}</p>
              </div>
              {i.decision_note && (
                <div className="rounded-md border border-line p-4">
                  <p className="text-sm text-fg-muted">قرار المراجعة — {i.reviewer?.full_name} · {formatDateTime(i.reviewed_at)}</p>
                  <p className="mt-1 whitespace-pre-line">{i.decision_note}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="سجل الإجراءات" description="تسلسل زمني موثق لكل ما تم على البلاغ" />
            <ol className="relative space-y-0 px-5 py-4">
              {actions.map((a, idx) => (
                <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {idx < actions.length - 1 && <span className="absolute start-[0.6875rem] top-6 h-full w-px bg-line" aria-hidden />}
                  <span className="relative z-10 mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-brand dark:text-link">
                    {a.action_type === 'status_change' ? <CheckCircle2 className="size-3.5" /> : a.action_type === 'submitted' ? <Send className="size-3.5 rtl:-scale-x-100" /> : <MessageSquarePlus className="size-3.5" />}
                  </span>
                  <div className="min-w-0 text-sm">
                    <p>
                      <span className="font-bold">{ACTION_LABELS[a.action_type]}</span>
                      {a.action_type === 'status_change' && a.to_status && <> ← {INCIDENT_STATUS_LABELS[a.to_status as IncidentStatus]}</>}
                    </p>
                    {a.note && <p className="mt-0.5 whitespace-pre-line text-fg">{a.note}</p>}
                    <p className="mt-0.5 text-xs text-fg-muted">{a.actor?.full_name ?? '—'} · {formatDateTime(a.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5 self-start">
          {canReview && (
            <Card>
              <CardHeader title="قرار المراجعة" />
              <CardContent className="flex flex-col gap-2">
                {allowedTransitions(status).map((to) => (
                  <Button key={to} variant={to === 'rejected' ? 'danger-ghost' : to === 'under_review' ? 'secondary' : 'primary'} className="justify-start" onClick={() => setTarget(to)}>
                    {TRANSITION_ACTION_LABELS[to]}
                  </Button>
                ))}
                <p className="text-xs text-fg-muted">قرارات الاعتماد والرفض والإغلاق تتطلب توثيق السبب أو الإجراء المتخذ.</p>
              </CardContent>
            </Card>
          )}
          {isManager && isReporter && status !== 'resolved' && status !== 'rejected' && (
            <p className="rounded-lg border border-info-line bg-info-soft p-3 text-sm text-info">قمت برفع هذا البلاغ، لذا تتم مراجعته من زميل آخر في شؤون الطلبة أو الإدارة.</p>
          )}
          {(isManager || isReporter) && (
            <Card>
              <CardHeader title="إضافة إلى السجل" />
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await addAction.mutateAsync({ type: noteType, note });
                      setNote('');
                      toast.success('تمت الإضافة إلى سجل البلاغ');
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  {isManager && (
                    <Select aria-label="النوع" value={noteType} onChange={(e) => setNoteType(e.target.value as 'note' | 'action_taken')}>
                      <option value="note">ملاحظة</option>
                      <option value="action_taken">إجراء متخذ (مثل: استدعاء ولي الأمر)</option>
                    </Select>
                  )}
                  <Textarea aria-label="النص" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button type="submit" variant="secondary" disabled={note.trim().length < 2} loading={addAction.isPending}>إضافة</Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(target)}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target ? TRANSITION_ACTION_LABELS[target] ?? '' : ''}
        description={target ? `ستتغير حالة البلاغ إلى «${INCIDENT_STATUS_LABELS[target]}» ويُبلَّغ مقدم البلاغ.` : ''}
        confirmLabel="تأكيد"
        tone={target === 'rejected' ? 'danger' : 'primary'}
        reasonLabel={target && transitionRequiresNote(target) ? (target === 'resolved' ? 'الإجراء المتخذ للمعالجة' : 'مبررات القرار') : undefined}
        loading={transition.isPending}
        onConfirm={async (reason) => {
          try {
            await transition.mutateAsync({ to: target!, note: reason });
            toast.success('تم تحديث حالة البلاغ');
            setTarget(null);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent title="تعديل البلاغ" description="يمكن التعديل قبل بدء المراجعة فقط، ويُسجَّل التعديل في سجل البلاغ.">
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (draft.description.trim().length < 10) return toast.error('صف الواقعة في ١٠ أحرف على الأقل');
              try {
                await edit.mutateAsync({ description: draft.description.trim(), location: draft.location.trim() || null, severity: draft.severity });
                toast.success('تم حفظ التعديل');
                setEditOpen(false);
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <Field label="المكان" htmlFor="edit-location"><Input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} /></Field>
            <Field label="درجة الخطورة" htmlFor="edit-severity">
              <Select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as Severity })}>
                {Object.entries(SEVERITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="الوصف" htmlFor="edit-description" required><Textarea rows={6} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setEditOpen(false)}>إلغاء</Button>
              <Button type="submit" loading={edit.isPending}>حفظ</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
