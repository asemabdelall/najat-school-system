import * as React from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, ArrowLeftRight, CalendarCheck2, ChevronLeft, Flag, Gavel, Hash, History, ListChecks, Pencil, RotateCcw, School, UserRound } from 'lucide-react';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useAuth } from '@/auth/AuthProvider';
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
import { DisciplineSummary, NewDisciplineMenu, TYPE_ICON } from '@/features/discipline/DisciplinePage';
import { useStudentDiscipline } from '@/features/discipline/api';
import { DISCIPLINE_STATUS_LABELS, DISCIPLINE_STATUS_TONE, DISCIPLINE_TYPE_LABELS, type DisciplineStatus, type DisciplineType } from '@/lib/domain/discipline';
import { StudentStatusBadge } from './StudentsPage';
import { useEnrollStudent, useSetStudentStatus, useStudent, useStudentEnrollments } from './api';

const ENROLLMENT_LABELS: Record<string, string> = { active: 'حالي', transferred: 'نُقل إلى فصل آخر', withdrawn: 'منسحب', completed: 'مكتمل' };

function initialsOf(full: string) {
  const parts = full.trim().split(/\s+/);
  const first = (w?: string) => (w ? w.replace(/^ال(?=..)/, '')[0] : '');
  return first(parts[0]) + (parts.length > 1 ? first(parts[parts.length - 1]) : '');
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line py-3.5">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-end text-base font-bold text-fg">{children}</dd>
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
  useDocumentTitle(student.data?.full_name ?? 'الطالب');
  const enrollments = useStudentEnrollments(studentId);
  const discipline = useStudentDiscipline(studentId, can('discipline.manage'));
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
      <nav aria-label="مسار التنقل" className="no-print mb-3">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-fg-muted">
          <li><Link to="/students" className="hover:text-link hover:underline">الطلاب</Link></li>
          <li aria-hidden><ChevronLeft className="size-3.5" /></li>
          <li aria-current="page" className="truncate">{s.full_name}</li>
        </ol>
      </nav>

      <section className="mb-5 overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        <div className="h-20 [background:var(--brand-gradient-deep)] sm:h-24" aria-hidden />
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 px-5 pb-5 sm:px-6">
          <span className="-mt-10 grid size-20 shrink-0 place-items-center rounded-2xl text-2xl font-extrabold text-white shadow-lg ring-4 ring-surface [background:var(--brand-gradient)]" aria-hidden>
            {initialsOf(s.full_name)}
          </span>
          <div className="min-w-0 flex-1 pt-2">
            <h1 className="text-xl font-extrabold leading-snug tracking-tight sm:text-2xl">{s.full_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-3 py-1 font-semibold text-fg-muted"><Hash className="size-3.5" aria-hidden /><span className="ltr tabular">{s.student_number}</span></span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 font-bold text-brand dark:text-link"><School className="size-3.5" aria-hidden />{active ? `فصل ${active.school_classes?.name}` : 'غير مسجل في فصل'}</span>
              <StudentStatusBadge status={s.status} />
            </div>
          </div>
          <div className="no-print flex flex-wrap items-center gap-2">
            {can('students.manage') && (
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
          )}
          </div>
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
        {[
          { label: 'نسبة الحضور', value: formatPercent(attendanceRate(totals)), tone: 'text-brand dark:text-link', bar: 'bg-brand' },
          { label: 'حضور', value: formatNumber(totals.present), tone: 'text-success', bar: 'bg-success' },
          { label: 'تأخر', value: formatNumber(totals.late), tone: 'text-warning', bar: 'bg-[var(--chart-late)]' },
          { label: 'غياب', value: formatNumber(totals.absent), tone: 'text-danger', bar: 'bg-[var(--chart-absent)]' },
          { label: 'غياب بعذر', value: formatNumber(totals.excused), tone: 'text-info', bar: 'bg-[var(--chart-excused)]' },
        ].map((k, i) => (
          <div key={k.label} className={cn('relative overflow-hidden rounded-lg border border-line bg-surface p-4 shadow-sm sm:p-5', i === 0 && 'col-span-2 md:col-span-1')}>
            <span className={cn('absolute inset-y-0 start-0 w-1.5', k.bar)} aria-hidden />
            <p className="text-sm font-bold text-fg-muted">{k.label}</p>
            <p className={cn('tabular mt-1 text-3xl font-extrabold leading-tight', k.tone)}>{summary.isPending ? '…' : k.value}</p>
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
          {can('discipline.manage') && <TabsTrigger value="discipline"><Gavel /> الجزاءات</TabsTrigger>}
          <TabsTrigger value="enrollments"><History /> سجل التسجيل</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader icon={<UserRound />} title="البيانات الأساسية" />
            <dl className="grid gap-x-10 px-5 py-2 sm:px-6 md:grid-cols-2">
              <InfoRow label="الاسم الكامل">{s.full_name}</InfoRow>
              <InfoRow label="الرقم الطلابي"><span className="ltr tabular">{s.student_number}</span></InfoRow>
              <InfoRow label="الرقم المدني"><span className="ltr tabular">{s.civil_id ?? '—'}</span></InfoRow>
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
            <CardHeader title="آخر السجلات" description="أحدث 60 سجل حضور" />
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

        {can('discipline.manage') && (
          <TabsContent value="discipline" className="mt-4">
            <Card>
              <CardHeader title="الجزاءات" description="استدعاءات ولي الأمر وقرارات الفصل والتعهدات في كل الأعوام" actions={s.status === 'active' && <NewDisciplineMenu studentId={s.id} size="sm" />} />
              <QueryState query={discipline} isEmpty={(d) => d.length === 0} empty={<EmptyState icon={<Gavel />} title="لا توجد جزاءات للطالب" />}>
                {(rows) => (
                  <ul className="divide-y divide-line">
                    {rows.map((d) => {
                      const Icon = TYPE_ICON[d.action_type as DisciplineType];
                      return (
                        <li key={d.id}>
                          <Link to={`/discipline/${d.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-surface-hover">
                            <Icon className="size-4 text-brand dark:text-link" aria-hidden />
                            <span className="font-semibold">{DISCIPLINE_TYPE_LABELS[d.action_type as DisciplineType]}</span>
                            <Badge tone={DISCIPLINE_STATUS_TONE[d.status as DisciplineStatus]}>{DISCIPLINE_STATUS_LABELS[d.status as DisciplineStatus]}</Badge>
                            <span className="text-sm text-fg-muted"><DisciplineSummary row={{ ...d, action_type: d.action_type as DisciplineType, status: d.status as DisciplineStatus }} /></span>
                            <span className="ms-auto text-xs text-fg-subtle">{d.academic_years?.name}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </QueryState>
            </Card>
          </TabsContent>
        )}

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
