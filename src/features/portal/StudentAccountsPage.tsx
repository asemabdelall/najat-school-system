import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, FileSpreadsheet, KeyRound, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox, Input, Select } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { supabase } from '@/lib/supabase';
import { errorMessage, unwrap } from '@/lib/errors';
import { formatDateTime, formatNumber, kuwaitToday } from '@/lib/format';
import { useClasses, useCurrentYear } from '@/lib/queries';
import { buildXlsx, downloadXlsx } from '@/lib/xlsx';

type Row = {
  student_id: string; full_name: string; student_number: string; civil_id: string | null; email: string | null;
  has_account: boolean; last_sign_in_at: string | null;
  /** Still on the school-issued password (null when there is no account). */
  must_change_password: boolean | null;
};

/** Whether the student has replaced the password the school issued. */
function PasswordState({ row }: { row: Row }) {
  if (!row.has_account) return <span className="text-fg-subtle">—</span>;
  return row.must_change_password === false
    ? <Badge tone="success">غيّر كلمة المرور</Badge>
    : <Badge tone="warning">لم يغيّر كلمة المرور بعد</Badge>;
}

const MIN_PASSWORD = 8;

export function StudentAccountsPage() {
  const qc = useQueryClient();
  const year = useCurrentYear();
  const classes = useClasses(year.data?.id ?? undefined);
  const [classId, setClassId] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const cls = classes.data?.find((c) => c.id === classId);

  React.useEffect(() => {
    if (!classId && classes.data?.[0]) setClassId(classes.data[0].id);
  }, [classes.data, classId]);

  const roster = useQuery({
    queryKey: ['student-accounts', classId],
    enabled: Boolean(classId),
    queryFn: async (): Promise<Row[]> => unwrap(await supabase.rpc('portal_accounts', { p_class_id: classId })),
  });
  const rows = React.useMemo(() => roster.data ?? [], [roster.data]);
  const eligible = React.useMemo(() => rows.filter((r) => r.civil_id), [rows]);

  // Default selection: students who can have an account but don't yet.
  React.useEffect(() => {
    setSelected(new Set(rows.filter((r) => r.civil_id && !r.has_account).map((r) => r.student_id)));
  }, [rows]);

  const resetting = rows.filter((r) => selected.has(r.student_id) && r.has_account).length;
  const creating = selected.size - resetting;
  const passwordOk = password.length >= MIN_PASSWORD;

  const save = useMutation({
    mutationFn: async () => unwrap(await supabase.rpc('portal_set_accounts', { p_student_ids: [...selected], p_password: password })),
    onSuccess: (res) => {
      const made = res.filter((r) => r.created).length;
      const reset = res.length - made;
      setOpen(false);
      setPassword('');
      void qc.invalidateQueries({ queryKey: ['student-accounts'] });
      toast.success(
        [made && `تم إنشاء ${formatNumber(made)} حساب`, reset && `تم تغيير كلمة مرور ${formatNumber(reset)} حساب`].filter(Boolean).join(' · ') || 'لا توجد تغييرات',
      );
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const exportExcel = () =>
    downloadXlsx(`najat-student-accounts-${cls?.name.replace(/\W+/g, '-') ?? ''}-${kuwaitToday()}.xlsx`, buildXlsx([{
      name: `حسابات ${cls?.name ?? ''}`,
      rows: rows.filter((r) => r.has_account),
      columns: [
        { header: 'اسم الطالب', value: (r: Row) => r.full_name, width: 40 },
        { header: 'الفصل', value: () => cls?.name ?? '', width: 8 },
        { header: 'الرقم المدني', value: (r: Row) => r.civil_id ?? '', width: 16 },
        { header: 'البريد (اسم الدخول)', value: (r: Row) => r.email ?? '', width: 34 },
        { header: 'آخر دخول', value: (r: Row) => (r.last_sign_in_at ? formatDateTime(r.last_sign_in_at) : ''), width: 22 },
        { header: 'كلمة المرور', value: (r: Row) => (r.must_change_password === false ? 'غيّر كلمة المرور' : 'لم يغيّر كلمة المرور بعد'), width: 24 },
      ],
    }]));

  const allSelected = eligible.length > 0 && eligible.every((r) => selected.has(r.student_id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader
        title="حسابات الطلاب"
        breadcrumbs={[{ label: 'الطلاب', to: '/students' }, { label: 'حسابات الطلاب' }]}
        description={
          <>
            حساب لكل طالب يدخل به هو وولي أمره إلى صفحة الطالب من صفحة تسجيل الدخول نفسها. اسم الدخول:{' '}
            <span dir="ltr" className="inline-block font-semibold text-fg">s + الرقم المدني + @alnajat.edu.kw</span>
          </>
        }
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-48">
            <label htmlFor="sa-class" className="mb-1 block text-xs font-semibold text-fg-muted">الفصل</label>
            <Select id="sa-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.data?.map((c) => <option key={c.id} value={c.id}>فصل {c.name}</option>)}
            </Select>
          </div>
          <p className="text-sm text-fg-muted">
            {formatNumber(rows.filter((r) => r.has_account).length)} من {formatNumber(rows.length)} طالب لديهم حساب
            {' · '}
            {formatNumber(rows.filter((r) => r.last_sign_in_at).length)} سجّلوا الدخول
            {' · '}
            {formatNumber(rows.filter((r) => r.has_account && r.must_change_password === false).length)} غيّروا كلمة المرور
          </p>
          <div className="ms-auto flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!rows.some((r) => r.has_account)} onClick={exportExcel}><FileSpreadsheet /> Excel</Button>
            <Button disabled={selected.size === 0} onClick={() => setOpen(true)}><KeyRound /> إنشاء / تعيين كلمة المرور ({formatNumber(selected.size)})</Button>
          </div>
        </div>
      </Card>

      <Card>
        {roster.isPending ? <LoadingState rows={8} /> : roster.isError ? <ErrorState error={roster.error} onRetry={() => roster.refetch()} /> : rows.length === 0 ? (
          <EmptyState icon={<Users />} title="لا يوجد طلاب مسجلون في هذا الفصل" />
        ) : (
          <Table caption="حسابات طلاب الفصل">
            <THead>
              <Tr>
                <Th className="w-10"><Checkbox aria-label="تحديد الكل" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? new Set(eligible.map((r) => r.student_id)) : new Set())} /></Th>
                <Th>الطالب</Th>
                <Th className="hidden md:table-cell">اسم الدخول</Th>
                <Th>الحساب</Th>
                <Th className="hidden sm:table-cell">كلمة المرور</Th>
                <Th className="hidden lg:table-cell">آخر دخول</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map((r) => (
                <Tr key={r.student_id} className="hover:bg-surface-hover">
                  <Td>
                    <Checkbox aria-label={`تحديد ${r.full_name}`} disabled={!r.civil_id} checked={selected.has(r.student_id)} onChange={() => toggle(r.student_id)} />
                  </Td>
                  <Td className="min-w-48">
                    <p className="font-semibold">{r.full_name}</p>
                    {r.civil_id ? (
                      <p className="ltr tabular text-xs text-fg-muted md:hidden">{r.email}</p>
                    ) : (
                      <p className="text-xs text-warning">لا يوجد رقم مدني مسجل، أضفه من ملف الطالب أولًا</p>
                    )}
                  </Td>
                  <Td className="hidden md:table-cell"><span className="ltr tabular text-sm text-fg-muted">{r.email ?? '—'}</span></Td>
                  <Td className="whitespace-nowrap">
                    {r.has_account ? <Badge tone="success">مفعّل</Badge> : <Badge tone="outline">لم يُنشأ</Badge>}
                    {r.has_account && <span className="mt-1 block sm:hidden"><PasswordState row={r} /></span>}
                  </Td>
                  <Td className="hidden whitespace-nowrap sm:table-cell"><PasswordState row={r} /></Td>
                  <Td className="hidden whitespace-nowrap text-fg-muted lg:table-cell">{r.last_sign_in_at ? formatDateTime(r.last_sign_in_at) : '—'}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPassword('');
        }}
        title={`حسابات ${formatNumber(selected.size)} طالب`}
        description={
          <span className="block space-y-3">
            <span className="block">
              {creating > 0 && <>سيُنشأ {formatNumber(creating)} حساب جديد. </>}
              اكتب كلمة المرور التي سيدخل بها الطلاب المحددون وأولياء أمورهم.
            </span>
            <span className="block text-fg-muted">
              هذه كلمة مرور مؤقتة: عند أول دخول يُطلب من الطالب اختيار كلمة مرور خاصة به قبل عرض أي بيانات.
            </span>
            {resetting > 0 && (
              <span className="flex gap-2 font-semibold text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {formatNumber(resetting)} طالب لديهم حساب: ستُستبدل كلمة المرور الحالية.
              </span>
            )}
            <Input aria-label="كلمة المرور" dir="ltr" className="text-start" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={`${formatNumber(MIN_PASSWORD)} أحرف على الأقل`} />
          </span>
        }
        confirmLabel="حفظ كلمة المرور"
        loading={save.isPending}
        onConfirm={() => {
          if (!passwordOk) return void toast.error(`كلمة المرور ${formatNumber(MIN_PASSWORD)} أحرف على الأقل`);
          save.mutate();
        }}
      />
    </>
  );
}
