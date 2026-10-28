import * as React from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArrowLeftRight, CalendarCheck2, Flag, History, ListChecks, Pencil, RotateCcw, UserRound } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState, QueryState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AttendanceBadge, DueBadge, FollowUpStatusBadge, IncidentStatusBadge } from '@/components/ui/status-badges';
import { supabase } from '@/lib/supabase';
import { errorMessage, unwrap } from '@/lib/errors';
import { formatDate, formatNumber, formatPercent, kuwaitToday } from '@/lib/format';
import { attendanceRate, periodLabel, type AttendanceStatus } from '@/lib/domain/attendance';
import type { IncidentStatus } from '@/lib/domain/behavior';
import { dueState, type FollowUpStatus } from '@/lib/domain/followups';
import { useClasses, useCurrentYear } from '@/lib/queries';
import { StudentFormDialog } from './StudentFormDialog';
import { StudentStatusBadge } from './StudentsPage';
import { useEnrollStudent, useSetStudentStatus, useStudent, useStudentEnrollments } from './api';

const ENROLLMENT_LABELS: Record<string, string> = { active: 'حالي', transferred: 'نُقل إلى فصل آخر', withdrawn: 'منسحب', completed: 'مكتمل' };

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-sm font-semibold text-fg">{children}</dd>
    </div>
  );
}

function EnrollDialog({ studentId, open, onOpenChange, currentClassId }: { studentId: string; open: boolean; onOpenChange: (o: boolean) => void; currentClassId?: string }) {
  const year = useCurrentYear();
  const classes = useClasses(year.data?.id ?? undefined);
  const enroll = useEnrollStudent(studentId);
  const [classId, setClassId] = React.useState('');
  const [date, setDate] = React.useState(kuwaitToday());
  React.useEffect(() => {
    if (open) {
      setClassId('');
      setDate(kuwaitToday());
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={currentClassId ? 'نقل الطالب إلى فصل آخر' : 'تسجيل الطالب في فصل'}
        description={currentClassId ? 'يُغلق التسجيل الحالي بتاريخ النقل ويبقى محفوظًا في سجل الطالب.' : `العام الدراسي ${year.data?.name ?? ''}`}
        size="sm"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await enroll.mutateAsync({ class_id: classId, date });
              toast.success(currentClassId ? 'تم نقل الطالب' : 'تم تسجيل الطالب');
              onOpenChange(false);
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
          className="space-y-4"
        >
          <Field label="الفصل" htmlFor="enroll-class" required>
            <Select value={classId} onChange={(e) => setClassId(e.target.value)} required>
              <option value="">اختر الفصل</option>
              {classes.data
                ?.filter((c) => c.id !== currentClassId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    الصف {c.grade_level} – فصل {c.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="تاريخ السريان" htmlFor="enroll-date" required>
            <Input type="date" value={date} max={kuwaitToday()} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={!classId || !date} loading={enroll.isPending}>
              {currentClassId ? 'تأكيد النقل' : 'تسجيل'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StudentDetailPage() {
  const { studentId } = useParams();
  const { can, isManager } = useAuth();
  const student = useStudent(studentId);
  const enrollments = useStudentEnrollments(studentId);
  const year = useCurrentYear();
  const setStatus = useSetStudentStatus(studentId ?? '');
  const [editOpen, setEditOpen] = React.useState(false);
  const [enrollOpen, setEnrollOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const today = kuwaitToday();

  const summary = useQuery({
    queryKey: ['students', studentId, 'attendance-summary', year.data?.id],
    queryFn: async () =>
      unwrap(await supabase.rpc('attendance_student_summary', { p_from: year.data!.starts_on, p_to: today, p_student_id: studentId! })),
    enabled: Boolean(studentId && year.data),
  });

  const records = useQuery({
    queryKey: ['students', studentId, 'attendance-records'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('attendance_records')
          .select('id, status, minutes_late, note, attendance_sessions!inner(session_date, period, school_classes(name))')
          .eq('student_id', studentId!)
          .order('attendance_sessions(session_date)', { ascending: false })
          .limit(60),
      ),
    enabled: Boolean(studentId),
  });

  const incidents = useQuery({
    queryKey: ['students', studentId, 'incidents'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('incident_students')
          .select('behavior_incidents!inner(id, incident_date, status, severity, behavior_categories(name))')
          .eq('student_id', studentId!),
      ),
    enabled: Boolean(studentId),
  });

  const followUps = useQuery({
    queryKey: ['students', studentId, 'follow-ups'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('follow_up_tasks')
          .select('id, title, status, due_date, assignee:profiles!follow_up_tasks_assigned_to_fkey(full_name)')
          .eq('student_id', studentId!)
          .order('created_at', { ascending: false }),
      ),
    enabled: Boolean(studentId),
  });

  if (student.isPending) return <LoadingState rows={8} />;
  if (student.isError) return <ErrorState error={student.error} onRetry={() => student.refetch()} />;
  if (!student.data)
    return <EmptyState icon={<UserRound />} title="الطالب غير موجود" description="قد يكون الرابط غير صحيح أو أن الطالب خارج نطاق صلاحياتك." action={<Button asChild variant="secondary"><Link to="/students">العودة للطلاب</Link></Button>} />;

  const s = student.data;
  const active = enrollments.data?.find((e) => e.status === 'active' && e.school_classes?.academic_years?.is_current);
  const totals = (summary.data ?? []).reduce(
    (acc, r) => ({ present: acc.present + r.present, late: acc.late + r.late, absent: acc.absent + r.absent, excused: acc.excused + r.excused }),
    { present: 0, late: 0, absent: 0, excused: 0 },
  );
  const sortedIncidents = [...(incidents.data ?? [])].map((r) => r.behavior_incidents).sort((a, b) => b.incident_date.localeCompare(a.incident_date));

  return (
    <>
      <PageHeader
        title={s.full_name}
        breadcrumbs={[{ label: 'الطلاب', to: '/students' }, { label: s.full_name }]}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="ltr tabular">{s.student_number}</span>
            <span aria-hidden>·</span>
            {active ? <span>فصل {active.school_classes?.name}</span> : <span>غير مسجل في فصل حاليًا</span>}
            <StudentStatusBadge status={s.status} />
          </span>
        }
        actions={
          can('students.manage') && (
            <>
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                <Pencil /> تعديل
              </Button>
              {s.status === 'active' && (
                <Button variant="secondary" onClick={() => setEnrollOpen(true)}>
                  <ArrowLeftRight /> {active ? 'نقل إلى فصل' : 'تسجيل في فصل'}
                </Button>
              )}
              {s.status === 'active' ? (
                <Button variant="danger-ghost" onClick={() => setArchiveOpen(true)}>
                  <Archive /> أرشفة
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  loading={setStatus.isPending}
                  onClick={async () => {
                    try {
                      await setStatus.mutateAsync({ status: 'active', reason: 'إعادة تفعيل' });
                      toast.success('تمت إعادة تفعيل الطالب. سجّله في فصل لإظهاره في كشوف الحضور.');
                    } catch (e) {
                      toast.error(errorMessage(e));
                    }
                  }}
                >
                  <RotateCcw /> إعادة تفعيل
                </Button>
              )}
            </>
          )
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { label: 'نسبة الحضور', value: formatPercent(attendanceRate(totals)), tone: 'text-brand dark:text-link' },
          { label: 'حضور', value: formatNumber(totals.present), tone: 'text-success' },
          { label: 'تأخر', value: formatNumber(totals.late), tone: 'text-warning' },
          { label: 'غياب', value: formatNumber(totals.absent), tone: 'text-danger' },
          { label: 'غياب بعذر', value: formatNumber(totals.excused), tone: 'text-info' },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-line bg-surface p-3 shadow-xs">
            <p className="text-xs text-fg-muted">{k.label}</p>
            <p className={`tabular mt-0.5 text-xl font-bold ${k.tone}`}>{summary.isPending ? '…' : k.value}</p>
          </div>
        ))}
        <p className="col-span-full text-xs text-fg-muted">
          للعام {year.data?.name}. تُحتسب النسبة من الحصص المرصودة فقط: (حاضر + متأخر) ÷ إجمالي المرصود؛ ولا يُعد عدم الرصد غيابًا.
        </p>
      </div>

      <Tabs defaultValue="overview" dir="rtl">
        <TabsList>
          <TabsTrigger value="overview"><UserRound /> البيانات</TabsTrigger>
          <TabsTrigger value="attendance"><CalendarCheck2 /> سجل الحضور</TabsTrigger>
          <TabsTrigger value="behavior"><Flag /> السلوك</TabsTrigger>
          <TabsTrigger value="followups"><ListChecks /> المتابعة</TabsTrigger>
          <TabsTrigger value="enrollments"><History /> سجل التسجيل</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card className="max-w-2xl">
            <CardHeader title="البيانات الأساسية" />
            <dl className="px-5 py-2">
              <InfoRow label="الاسم الكامل">{s.full_name}</InfoRow>
              <InfoRow label="الرقم الطلابي"><span className="ltr tabular">{s.student_number}</span></InfoRow>
              <InfoRow label="تاريخ الميلاد">{formatDate(s.date_of_birth)}</InfoRow>
              {isManager && (
                <>
                  <InfoRow label="ولي الأمر">{s.guardian_name ?? '—'}</InfoRow>
                  <InfoRow label="هاتف ولي الأمر"><span className="ltr tabular">{s.guardian_phone ?? '—'}</span></InfoRow>
                  <InfoRow label="ملاحظات إدارية"><span className="whitespace-pre-line font-normal">{s.notes ?? '—'}</span></InfoRow>
                </>
              )}
            </dl>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <Card>
            <CardHeader title="آخر السجلات" description="أحدث ٦٠ سجل حضور" />
            <QueryState query={records} isEmpty={(d) => d.length === 0} empty={<EmptyState icon={<CalendarCheck2 />} title="لا توجد سجلات حضور" />}>
              {(rows) => (
                <Table caption="سجل حضور الطالب">
                  <THead>
                    <Tr><Th>التاريخ</Th><Th>الجلسة</Th><Th>الفصل</Th><Th>الحالة</Th><Th>ملاحظة</Th></Tr>
                  </THead>
                  <TBody>
                    {rows.map((r) => (
                      <Tr key={r.id}>
                        <Td className="whitespace-nowrap">{formatDate(r.attendance_sessions.session_date)}</Td>
                        <Td className="whitespace-nowrap text-fg-muted">{periodLabel(r.attendance_sessions.period)}</Td>
                        <Td>{r.attendance_sessions.school_classes?.name}</Td>
                        <Td>
                          <AttendanceBadge status={r.status as AttendanceStatus} />
                          {r.minutes_late && <span className="ms-2 text-xs text-fg-muted">{formatNumber(r.minutes_late)} د</span>}
                        </Td>
                        <Td className="text-fg-muted">{r.note ?? ''}</Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </QueryState>
          </Card>
        </TabsContent>

        <TabsContent value="behavior" className="mt-4">
          <Card>
            <CardHeader title="البلاغات السلوكية" description={isManager ? 'جميع البلاغات المرتبطة بالطالب' : 'البلاغات التي رفعتها أنت فقط'} />
            <QueryState query={incidents} isEmpty={(d) => d.length === 0} empty={<EmptyState icon={<Flag />} title="لا توجد بلاغات" />}>
              {() => (
                <Table caption="بلاغات الطالب">
                  <THead><Tr><Th>التاريخ</Th><Th>التصنيف</Th><Th>الحالة</Th></Tr></THead>
                  <TBody>
                    {sortedIncidents.map((i) => (
                      <Tr key={i.id} className="hover:bg-surface-hover">
                        <Td className="whitespace-nowrap">
                          <Link to={`/behavior/${i.id}`} className="font-semibold text-link hover:underline">{formatDate(i.incident_date)}</Link>
                        </Td>
                        <Td>{i.behavior_categories?.name}</Td>
                        <Td><IncidentStatusBadge status={i.status as IncidentStatus} /></Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </QueryState>
          </Card>
        </TabsContent>

        <TabsContent value="followups" className="mt-4">
          <Card>
            <CardHeader title="مهام المتابعة" />
            <QueryState query={followUps} isEmpty={(d) => d.length === 0} empty={<EmptyState icon={<ListChecks />} title="لا توجد مهام متابعة" />}>
              {(rows) => (
                <Table caption="مهام متابعة الطالب">
                  <THead><Tr><Th>المهمة</Th><Th>المسؤول</Th><Th>الموعد</Th><Th>الحالة</Th></Tr></THead>
                  <TBody>
                    {rows.map((t) => {
                      const ds = dueState(t.status as FollowUpStatus, t.due_date, today);
                      return (
                        <Tr key={t.id}>
                          <Td><Link to={`/follow-ups/${t.id}`} className="font-semibold text-link hover:underline">{t.title}</Link></Td>
                          <Td>{t.assignee?.full_name}</Td>
                          <Td className="whitespace-nowrap">{formatDate(t.due_date)} <DueBadge state={ds} dueDate={t.due_date} today={today} /></Td>
                          <Td><FollowUpStatusBadge status={t.status as FollowUpStatus} /></Td>
                        </Tr>
                      );
                    })}
                  </TBody>
                </Table>
              )}
            </QueryState>
          </Card>
        </TabsContent>

        <TabsContent value="enrollments" className="mt-4">
          <Card>
            <CardHeader title="سجل التسجيل في الفصول" description="يُحفظ تاريخ الفصول السابقة ولا يُحذف عند النقل." />
            <QueryState query={enrollments} isEmpty={(d) => d.length === 0} empty={<EmptyState icon={<History />} title="لا يوجد تسجيل" />}>
              {(rows) => (
                <Table caption="سجل التسجيل">
                  <THead><Tr><Th>العام</Th><Th>الفصل</Th><Th>من</Th><Th>إلى</Th><Th>الحالة</Th></Tr></THead>
                  <TBody>
                    {rows.map((e) => (
                      <Tr key={e.id}>
                        <Td className="tabular">{e.school_classes?.academic_years?.name}</Td>
                        <Td>{e.school_classes?.name}</Td>
                        <Td className="whitespace-nowrap">{formatDate(e.enrolled_on)}</Td>
                        <Td className="whitespace-nowrap">{formatDate(e.ended_on)}</Td>
                        <Td><Badge tone={e.status === 'active' ? 'success' : 'neutral'}>{ENROLLMENT_LABELS[e.status]}</Badge></Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </QueryState>
          </Card>
        </TabsContent>
      </Tabs>

      <StudentFormDialog open={editOpen} onOpenChange={setEditOpen} student={s} />
      <EnrollDialog studentId={s.id} open={enrollOpen} onOpenChange={setEnrollOpen} currentClassId={active?.class_id} />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="أرشفة الطالب"
        description="سيُغلق تسجيل الطالب الحالي ويُخفى من كشوف الحضور. تبقى جميع سجلاته التاريخية محفوظة، ويمكن إعادة تفعيله لاحقًا."
        confirmLabel="أرشفة"
        tone="danger"
        reasonLabel="سبب الأرشفة"
        loading={setStatus.isPending}
        onConfirm={async (reason) => {
          try {
            await setStatus.mutateAsync({ status: 'archived', reason });
            toast.success('تمت أرشفة الطالب');
            setArchiveOpen(false);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}
