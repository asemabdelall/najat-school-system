import * as React from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, CalendarCheck2, Pencil, Plus, School, Trash2, UserPlus, Users } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState, QueryState } from '@/components/ui/states';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Checkbox, Input, Select } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';
import { errorMessage, unwrap } from '@/lib/errors';
import { formatNumber, formatPercent, kuwaitToday } from '@/lib/format';
import { useAcademicYears, useStaff } from '@/lib/queries';
import { TRACK_LABELS, useAssignTeacher, useAssignments, useSaveClass, useUnassignTeacher } from './api';
import { ClassFormDialog } from './ClassFormDialog';

function AssignTeacherDialog({ classId, open, onOpenChange }: { classId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const staff = useStaff();
  const assign = useAssignTeacher();
  const [teacherId, setTeacherId] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [homeroom, setHomeroom] = React.useState(false);
  React.useEffect(() => {
    if (open) { setTeacherId(''); setSubject(''); setHomeroom(false); }
  }, [open]);
  const teachers = staff.data?.filter((s) => s.is_active && s.roles.includes('teacher')) ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="إسناد معلم إلى الفصل" size="sm">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await assign.mutateAsync({ teacher_id: teacherId, class_id: classId, subject: subject.trim(), is_homeroom: homeroom });
              toast.success('تم إسناد المعلم');
              onOpenChange(false);
            } catch (err) {
              toast.error(/مكررة/.test(errorMessage(err)) ? 'هذا المعلم مسند بالفعل للفصل بنفس المادة' : errorMessage(err));
            }
          }}
        >
          <Field label="المعلم" htmlFor="assign-teacher" required>
            <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
              <option value="">اختر المعلم</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </Select>
          </Field>
          <Field label="المادة" htmlFor="assign-subject" hint="اختياري — يمكن إسناد المعلم نفسه بأكثر من مادة.">
            <Input value={subject} maxLength={60} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={homeroom} onChange={(e) => setHomeroom(e.target.checked)} /> رائد الفصل (يحل محل الرائد الحالي إن وجد)
          </label>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={!teacherId} loading={assign.isPending}>إسناد</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClassDetailPage() {
  const { classId } = useParams();
  const { can } = useAuth();
  const today = kuwaitToday();
  const years = useAcademicYears();
  const cls = useQuery({
    queryKey: ['classes', 'detail', classId],
    queryFn: async () => unwrap(await supabase.from('school_classes').select('*, academic_years(name, starts_on, ends_on, is_current, status)').eq('id', classId!).maybeSingle()),
    enabled: Boolean(classId),
  });
  const roster = useQuery({
    queryKey: ['classes', 'roster', classId, today],
    queryFn: async () => unwrap(await supabase.rpc('class_roster', { p_class_id: classId!, p_date: today })),
    enabled: Boolean(classId),
  });
  const stats = useQuery({
    queryKey: ['classes', 'stats', classId, cls.data?.academic_years?.starts_on],
    queryFn: async () => unwrap(await supabase.rpc('attendance_student_summary', { p_from: cls.data!.academic_years!.starts_on, p_to: today, p_class_id: classId! })),
    enabled: Boolean(cls.data?.academic_years),
  });
  const assignments = useAssignments(classId);
  const unassign = useUnassignTeacher();
  const save = useSaveClass();
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [removeId, setRemoveId] = React.useState<string | null>(null);

  if (cls.isPending) return <LoadingState rows={8} />;
  if (cls.isError) return <ErrorState error={cls.error} onRetry={() => cls.refetch()} />;
  if (!cls.data) return <EmptyState icon={<School />} title="الفصل غير موجود أو غير مسند إليك" action={<Button asChild variant="secondary"><Link to="/classes">العودة للفصول</Link></Button>} />;

  const c = cls.data;
  const byStudent = new Map((stats.data ?? []).map((r) => [r.student_id, r]));
  const manage = can('classes.manage') && c.academic_years?.status !== 'closed';

  return (
    <>
      <PageHeader
        title={`فصل ${c.name}`}
        breadcrumbs={[{ label: 'الصفوف والفصول', to: '/classes' }, { label: `فصل ${c.name}` }]}
        description={`الصف ${c.grade_level} · ${c.track ? TRACK_LABELS[c.track] : ''} · العام ${c.academic_years?.name ?? ''}${c.is_archived ? ' · مؤرشف' : ''}`}
        actions={
          <>
            {!c.is_archived && (
              <Button asChild>
                <Link to={`/attendance/take?class=${c.id}`}><CalendarCheck2 /> رصد الحضور</Link>
              </Button>
            )}
            {manage && (
              <>
                <Button variant="secondary" onClick={() => setEditOpen(true)}><Pencil /> تعديل</Button>
                {!c.is_archived && <Button variant="danger-ghost" onClick={() => setArchiveOpen(true)}><Archive /> أرشفة</Button>}
              </>
            )}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader
            icon={<Users />}
            title="طلاب الفصل"
            description={`المسجلون حاليًا: ${formatNumber(roster.data?.length ?? 0)}${c.capacity ? ` من ${formatNumber(c.capacity)}` : ''}`}
            actions={can('students.manage') && <Button asChild variant="secondary" size="sm"><Link to="/students"><UserPlus /> تسجيل طالب</Link></Button>}
          />
          <QueryState query={roster} isEmpty={(d) => d.length === 0} empty={<EmptyState icon={<Users />} title="لا يوجد طلاب مسجلون" description="سجّل الطلاب من ملف كل طالب." />}>
            {(rows) => (
              <Table caption="طلاب الفصل">
                <THead>
                  <Tr><Th className="w-10">#</Th><Th>الطالب</Th><Th className="hidden sm:table-cell">الرقم</Th><Th>نسبة الحضور</Th><Th>غياب</Th><Th>تأخر</Th></Tr>
                </THead>
                <TBody>
                  {rows.map((s, i) => {
                    const st = byStudent.get(s.student_id);
                    return (
                      <Tr key={s.student_id} className="hover:bg-surface-hover">
                        <Td className="tabular text-fg-subtle">{formatNumber(i + 1)}</Td>
                        <Td><Link to={`/students/${s.student_id}`} className="font-semibold hover:text-link hover:underline">{s.full_name}</Link></Td>
                        <Td className="hidden text-fg-muted sm:table-cell"><span className="ltr tabular">{s.student_number}</span></Td>
                        <Td className="tabular">{formatPercent(st?.rate ?? null)}</Td>
                        <Td className="tabular">{formatNumber(st?.absent ?? 0)}</Td>
                        <Td className="tabular">{formatNumber(st?.late ?? 0)}</Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </QueryState>
        </Card>

        <Card className="self-start">
          <CardHeader
            title="المعلمون المسندون"
            actions={manage && !c.is_archived && <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}><Plus /> إسناد</Button>}
          />
          <QueryState query={assignments} isEmpty={(d) => d.length === 0} empty={<EmptyState title="لا يوجد معلمون مسندون" className="py-8" />}>
            {(rows) => (
              <ul className="divide-y divide-line">
                {rows.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{a.profiles?.full_name}</p>
                      <p className="text-xs text-fg-muted">{a.subject || 'بدون مادة محددة'}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {a.is_homeroom && <Badge tone="brand">رائد الفصل</Badge>}
                      {manage && (
                        <Button variant="ghost" size="icon-sm" aria-label={`إلغاء إسناد ${a.profiles?.full_name}`} onClick={() => setRemoveId(a.id)}>
                          <Trash2 className="text-fg-muted" />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Card>
      </div>

      <AssignTeacherDialog classId={c.id} open={assignOpen} onOpenChange={setAssignOpen} />
      {years.data && <ClassFormDialog open={editOpen} onOpenChange={setEditOpen} years={years.data} editing={c} />}
      <ConfirmDialog
        open={Boolean(removeId)}
        onOpenChange={(o) => !o && setRemoveId(null)}
        title="إلغاء إسناد المعلم"
        description="لن يتمكن المعلم من رصد حضور هذا الفصل أو رؤية طلابه بعد الآن. تبقى سجلات الحضور السابقة محفوظة."
        confirmLabel="إلغاء الإسناد"
        tone="danger"
        loading={unassign.isPending}
        onConfirm={async () => {
          try {
            await unassign.mutateAsync(removeId!);
            toast.success('تم إلغاء الإسناد');
            setRemoveId(null);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="أرشفة الفصل"
        description="لن يظهر الفصل في الرصد والتسجيل الجديد. تبقى السجلات التاريخية محفوظة للتقارير."
        confirmLabel="أرشفة"
        tone="danger"
        loading={save.isPending}
        onConfirm={async () => {
          try {
            await save.mutateAsync({ id: c.id, academic_year_id: c.academic_year_id, grade_level: c.grade_level, section: c.section, name: c.name, is_archived: true });
            toast.success('تمت أرشفة الفصل');
            setArchiveOpen(false);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </>
  );
}
