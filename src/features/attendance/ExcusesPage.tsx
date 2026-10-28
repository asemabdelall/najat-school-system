import * as React from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, FilePlus2, FileText, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ExcuseStatusBadge } from '@/components/ui/status-badges';
import { StudentPicker, type PickedStudent } from '@/components/StudentPicker';
import { supabase } from '@/lib/supabase';
import { errorMessage, unwrap } from '@/lib/errors';
import { formatDate, formatNumber, kuwaitToday } from '@/lib/format';
import { EXCUSE_REASON_LABELS, EXCUSE_STATUS_LABELS, type ExcuseStatus } from '@/lib/domain/attendance';

function NewExcuseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const today = kuwaitToday();
  const [student, setStudent] = React.useState<PickedStudent[]>([]);
  const [from, setFrom] = React.useState(today);
  const [to, setTo] = React.useState(today);
  const [reason, setReason] = React.useState('medical');
  const [details, setDetails] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (open) { setStudent([]); setFrom(today); setTo(today); setReason('medical'); setDetails(''); setError(null); }
  }, [open, today]);
  const create = useMutation({
    mutationFn: async () =>
      unwrap(await supabase.from('absence_excuses').insert({ student_id: student[0].id, from_date: from, to_date: to, reason_type: reason, details: details.trim() || null, submitted_by: profile!.id, status: 'pending' }).select('id')),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['excuses'] }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="تسجيل عذر غياب" description="يُراجع العذر من شؤون الطلبة؛ وعند اعتماده تتحول حالات الغياب في الفترة إلى «غياب بعذر» تلقائيًا مع التوثيق." size="md">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!student.length) return setError('اختر الطالب');
            if (to < from) return setError('تاريخ النهاية يسبق تاريخ البداية');
            try {
              await create.mutateAsync();
              toast.success('تم تسجيل العذر وإحالته للمراجعة');
              onOpenChange(false);
            } catch (err) {
              setError(errorMessage(err));
            }
          }}
        >
          <Field label="الطالب" htmlFor="excuse-student" required noClone className="sm:col-span-2">
            <StudentPicker id="excuse-student" value={student} onChange={setStudent} />
          </Field>
          <Field label="من تاريخ" htmlFor="excuse-from" required>
            <Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} required />
          </Field>
          <Field label="إلى تاريخ" htmlFor="excuse-to" required>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
          </Field>
          <Field label="نوع العذر" htmlFor="excuse-reason" required className="sm:col-span-2">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(EXCUSE_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="التفاصيل" htmlFor="excuse-details" hint="تجنّب ذكر تفاصيل طبية غير ضرورية." className="sm:col-span-2">
            <Textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
          </Field>
          {error && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2">{error}</p>}
          <DialogFooter className="sm:col-span-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" loading={create.isPending}>تسجيل العذر</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExcusesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<ExcuseStatus | ''>('pending');
  const [newOpen, setNewOpen] = React.useState(false);
  const [review, setReview] = React.useState<{ id: string; decision: 'approved' | 'rejected' } | null>(null);

  const excuses = useQuery({
    queryKey: ['excuses', status],
    queryFn: async () => {
      let q = supabase
        .from('absence_excuses')
        .select('*, students(full_name, student_number), submitter:profiles!absence_excuses_submitted_by_fkey(full_name), reviewer:profiles!absence_excuses_reviewed_by_fkey(full_name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (status) q = q.eq('status', status);
      return unwrap(await q);
    },
  });

  const decide = useMutation({
    mutationFn: async (v: { id: string; decision: string; note: string }) =>
      unwrap(await supabase.rpc('review_absence_excuse', { p_excuse_id: v.id, p_decision: v.decision, p_note: v.note })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['excuses'] });
      void qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  return (
    <>
      <PageHeader
        title="أعذار الغياب"
        breadcrumbs={[{ label: 'الحضور والغياب', to: '/attendance' }, { label: 'أعذار الغياب' }]}
        description={can('excuses.review') ? 'مراجعة الأعذار واعتمادها' : 'الأعذار المسجلة لطلاب فصولك'}
        actions={<Button onClick={() => setNewOpen(true)}><FilePlus2 /> تسجيل عذر</Button>}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <label htmlFor="excuse-status" className="text-sm font-semibold text-fg-muted">الحالة</label>
          <Select id="excuse-status" className="w-48" value={status} onChange={(e) => setStatus(e.target.value as ExcuseStatus | '')}>
            <option value="">الكل</option>
            {Object.entries(EXCUSE_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </div>
        {excuses.isPending ? (
          <LoadingState />
        ) : excuses.isError ? (
          <ErrorState error={excuses.error} onRetry={() => excuses.refetch()} />
        ) : excuses.data.length === 0 ? (
          <EmptyState icon={<FileText />} title={status === 'pending' ? 'لا توجد أعذار بانتظار المراجعة' : 'لا توجد أعذار'} />
        ) : (
          <Table caption="أعذار الغياب">
            <THead><Tr><Th>الطالب</Th><Th>الفترة</Th><Th>النوع</Th><Th className="hidden lg:table-cell">التفاصيل</Th><Th>مقدم من</Th><Th>الحالة</Th>{can('excuses.review') && <Th><span className="sr-only">إجراءات</span></Th>}</Tr></THead>
            <TBody>
              {excuses.data.map((x) => (
                <Tr key={x.id}>
                  <Td><Link to={`/students/${x.student_id}`} className="font-semibold hover:text-link hover:underline">{x.students?.full_name}</Link></Td>
                  <Td className="whitespace-nowrap">{x.from_date === x.to_date ? formatDate(x.from_date) : `${formatDate(x.from_date)} – ${formatDate(x.to_date)}`}</Td>
                  <Td>{EXCUSE_REASON_LABELS[x.reason_type]}</Td>
                  <Td className="hidden max-w-64 truncate text-fg-muted lg:table-cell" title={x.details ?? ''}>{x.details ?? '—'}</Td>
                  <Td className="text-fg-muted">{x.submitter?.full_name}</Td>
                  <Td>
                    <ExcuseStatusBadge status={x.status as ExcuseStatus} />
                    {x.review_note && <p className="mt-0.5 text-xs text-fg-muted">{x.reviewer?.full_name}: {x.review_note}</p>}
                  </Td>
                  {can('excuses.review') && (
                    <Td className="whitespace-nowrap">
                      {x.status === 'pending' && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="subtle" onClick={() => setReview({ id: x.id, decision: 'approved' })}><Check /> اعتماد</Button>
                          <Button size="sm" variant="danger-ghost" onClick={() => setReview({ id: x.id, decision: 'rejected' })}><X /> رفض</Button>
                        </div>
                      )}
                    </Td>
                  )}
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <NewExcuseDialog open={newOpen} onOpenChange={setNewOpen} />
      <ConfirmDialog
        open={Boolean(review)}
        onOpenChange={(o) => !o && setReview(null)}
        title={review?.decision === 'approved' ? 'اعتماد العذر' : 'رفض العذر'}
        description={review?.decision === 'approved' ? 'ستتحول جميع حالات «غائب» للطالب ضمن الفترة إلى «غياب بعذر» مع توثيق كل تصحيح.' : 'يبقى الغياب كما هو، ويُبلَّغ مقدم العذر بالقرار.'}
        confirmLabel={review?.decision === 'approved' ? 'اعتماد' : 'رفض'}
        tone={review?.decision === 'rejected' ? 'danger' : 'primary'}
        reasonLabel={review?.decision === 'rejected' ? 'سبب الرفض' : 'ملاحظة المراجعة'}
        loading={decide.isPending}
        onConfirm={async (note) => {
          try {
            const converted = await decide.mutateAsync({ id: review!.id, decision: review!.decision, note });
            toast.success(review!.decision === 'approved' ? `تم اعتماد العذر وتحويل ${formatNumber(converted)} غياب إلى غياب بعذر` : 'تم رفض العذر');
            setReview(null);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}
