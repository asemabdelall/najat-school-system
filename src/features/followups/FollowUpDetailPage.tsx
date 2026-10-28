import * as React from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ListChecks, Pencil } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DueBadge, FollowUpStatusBadge, PriorityBadge } from '@/components/ui/status-badges';
import { errorMessage } from '@/lib/errors';
import { formatDate, formatDateTime, kuwaitToday } from '@/lib/format';
import { dueState, FOLLOW_UP_CATEGORY_LABELS, FOLLOW_UP_STATUS_LABELS, nextStatuses, type FollowUpPriority, type FollowUpStatus } from '@/lib/domain/followups';
import { useAddFollowUpNote, useFollowUp, useUpdateFollowUp } from './api';
import { FollowUpFormDialog } from './FollowUpFormDialog';

export function FollowUpDetailPage() {
  const { taskId } = useParams();
  const { profile, isManager } = useAuth();
  const today = kuwaitToday();
  const q = useFollowUp(taskId);
  const update = useUpdateFollowUp(taskId ?? '');
  const addNote = useAddFollowUpNote(taskId ?? '');
  const [note, setNote] = React.useState('');
  const [outcome, setOutcome] = React.useState<string | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [pending, setPending] = React.useState<FollowUpStatus | null>(null);

  if (q.isPending) return <LoadingState rows={6} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data) return <EmptyState icon={<ListChecks />} title="المهمة غير موجودة أو غير متاحة لك" action={<Button asChild variant="secondary"><Link to="/follow-ups">العودة للمتابعة</Link></Button>} />;

  const { task: t, notes } = q.data;
  const status = t.status as FollowUpStatus;
  const ds = dueState(status, t.due_date, today);
  const isCreator = t.created_by === profile?.id;
  const canEdit = isManager || (isCreator && t.assigned_to === profile?.id);
  const canCancel = isManager || isCreator;
  const outcomeValue = outcome ?? t.outcome ?? '';

  const changeStatus = async (to: FollowUpStatus) => {
    try {
      await update.mutateAsync({ status: to, outcome: outcomeValue.trim() || null });
      toast.success(`تم تحديث الحالة إلى «${FOLLOW_UP_STATUS_LABELS[to]}»`);
      setPending(null);
      setOutcome(null);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title={t.title}
        breadcrumbs={[{ label: 'المتابعة', to: '/follow-ups' }, { label: t.title }]}
        description={<span className="flex flex-wrap items-center gap-2"><FollowUpStatusBadge status={status} /><PriorityBadge priority={t.priority as FollowUpPriority} /><DueBadge state={ds} dueDate={t.due_date} today={today} /></span>}
        actions={canEdit && <Button variant="secondary" onClick={() => setEditOpen(true)}><Pencil /> تعديل</Button>}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="تفاصيل المهمة" />
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-3">
                <div><dt className="text-fg-muted">الطالب</dt><dd className="font-semibold">{t.students ? <Link className="text-link hover:underline" to={`/students/${t.students.id}`}>{t.students.full_name}</Link> : '—'}</dd></div>
                <div><dt className="text-fg-muted">المسؤول</dt><dd className="font-semibold">{t.assignee?.full_name}</dd></div>
                <div><dt className="text-fg-muted">تاريخ الاستحقاق</dt><dd className="font-semibold">{formatDate(t.due_date)}</dd></div>
                <div><dt className="text-fg-muted">التصنيف</dt><dd className="font-semibold">{FOLLOW_UP_CATEGORY_LABELS[t.category]}</dd></div>
                <div><dt className="text-fg-muted">أنشأها</dt><dd className="font-semibold">{t.creator?.full_name ?? '—'}<span className="block text-xs font-normal text-fg-muted">{formatDateTime(t.created_at)}</span></dd></div>
                <div><dt className="text-fg-muted">آخر تحديث</dt><dd className="font-semibold">{formatDateTime(t.updated_at)}</dd></div>
                {t.behavior_incidents && <div><dt className="text-fg-muted">البلاغ المرتبط</dt><dd><Link className="font-semibold text-link hover:underline" to={`/behavior/${t.behavior_incidents.id}`}>بلاغ {formatDate(t.behavior_incidents.incident_date)}</Link></dd></div>}
                {t.completed_at && <div><dt className="text-fg-muted">اكتملت في</dt><dd className="font-semibold">{formatDateTime(t.completed_at)}</dd></div>}
              </dl>
              {t.description && <p className="mt-4 whitespace-pre-line rounded-md bg-surface-sunken p-4">{t.description}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="ملاحظات التقدم" />
            <CardContent className="space-y-4">
              <form
                className="space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await addNote.mutateAsync({ body: note.trim(), author_id: profile!.id });
                    setNote('');
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              >
                <Textarea aria-label="ملاحظة جديدة" rows={3} maxLength={2000} placeholder="أضف ملاحظة عن سير المتابعة…" value={note} onChange={(e) => setNote(e.target.value)} />
                <Button type="submit" variant="secondary" size="sm" disabled={!note.trim()} loading={addNote.isPending}>إضافة ملاحظة</Button>
              </form>
              {notes.length === 0 ? (
                <p className="text-sm text-fg-muted">لا توجد ملاحظات بعد.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {notes.map((n) => (
                    <li key={n.id} className="py-3">
                      <p className="whitespace-pre-line text-sm">{n.body}</p>
                      <p className="mt-1 text-xs text-fg-muted">{n.author?.full_name} · {formatDateTime(n.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="تحديث الحالة" />
          <CardContent className="space-y-3">
            <Field label="النتيجة / ما تم إنجازه" htmlFor="fu-outcome" hint="يُنصح بتوثيق النتيجة قبل إكمال المهمة.">
              <Textarea rows={4} maxLength={3000} value={outcomeValue} onChange={(e) => setOutcome(e.target.value)} />
            </Field>
            {outcome !== null && outcome !== (t.outcome ?? '') && (
              <Button size="sm" variant="secondary" loading={update.isPending} onClick={() => changeStatus(status)}>حفظ النتيجة</Button>
            )}
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              {nextStatuses(status, canCancel).map((s) => (
                <Button key={s} variant={s === 'completed' ? 'primary' : s === 'cancelled' ? 'danger-ghost' : 'secondary'} className="justify-start" loading={update.isPending && update.variables?.status === s} onClick={() => (s === 'cancelled' || s === 'completed' ? setPending(s) : changeStatus(s))}>
                  {s === 'in_progress' && status === 'open' ? 'بدء التنفيذ' : s === 'completed' ? 'إكمال المهمة' : s === 'cancelled' ? 'إلغاء المهمة' : s === 'open' ? 'إعادة فتح' : FOLLOW_UP_STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending === 'completed' ? 'إكمال المهمة' : 'إلغاء المهمة'}
        description={pending === 'completed' ? (outcomeValue.trim() ? 'سيتم تسجيل المهمة مكتملة مع النتيجة الموثقة.' : 'لم تُوثَّق نتيجة بعد. هل تريد الإكمال دون نتيجة؟') : 'لن تظهر المهمة ضمن المهام النشطة. يمكن إعادة فتحها لاحقًا.'}
        confirmLabel={pending === 'completed' ? 'إكمال' : 'إلغاء المهمة'}
        tone={pending === 'cancelled' ? 'danger' : 'primary'}
        loading={update.isPending}
        onConfirm={() => changeStatus(pending!)}
      />
      <FollowUpFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editing={{ id: t.id, title: t.title, description: t.description, category: t.category, priority: t.priority, assigned_to: t.assigned_to, due_date: t.due_date, student: t.students ? { id: t.students.id, full_name: t.students.full_name, student_number: t.students.student_number, class_name: null } : null }}
      />
    </>
  );
}
