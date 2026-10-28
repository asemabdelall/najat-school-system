import * as React from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';

const TABLE_LABELS: Record<string, string> = {
  students: 'الطلاب', enrollments: 'التسجيل', school_classes: 'الفصول', academic_years: 'الأعوام الدراسية',
  teacher_class_assignments: 'إسناد المعلمين', attendance_sessions: 'جلسات الحضور', absence_excuses: 'أعذار الغياب',
  behavior_incidents: 'البلاغات السلوكية', behavior_categories: 'تصنيفات السلوك', follow_up_tasks: 'المتابعة',
  user_roles: 'الصلاحيات', profiles: 'الحسابات', school_settings: 'الإعدادات', 'auth.users': 'حسابات الدخول',
};
const ACTION_LABELS: Record<string, string> = {
  insert: 'إضافة', update: 'تعديل', delete: 'حذف', status_change: 'تغيير حالة', attendance_saved: 'حفظ حضور',
  attendance_submitted: 'اعتماد حضور', attendance_corrected: 'تصحيح حضور', attendance_reopened: 'إعادة فتح جلسة',
  create_user: 'إنشاء حساب', activate_user: 'تفعيل حساب', deactivate_user: 'تعطيل حساب', reset_password: 'تعيين كلمة مرور',
};
const PAGE = 30;

function Changes({ value }: { value: unknown }) {
  if (!value || typeof value !== 'object') return <span className="text-fg-subtle">—</span>;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return <span className="text-fg-subtle">—</span>;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-link">{entries.length} حقل</summary>
      <dl className="mt-2 max-w-xl space-y-1 rounded-md bg-surface-sunken p-2">
        {entries.map(([k, v]) => {
          const diff = v && typeof v === 'object' && 'from' in (v as object) && 'to' in (v as object) ? (v as { from: unknown; to: unknown }) : null;
          return (
            <div key={k} className="flex flex-wrap gap-x-2">
              <dt className="ltr font-mono font-semibold">{k}</dt>
              <dd className="ltr break-all text-fg-muted">{diff ? `${JSON.stringify(diff.from)} → ${JSON.stringify(diff.to)}` : JSON.stringify(v)}</dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}

export function AuditLogPage() {
  const [table, setTable] = React.useState('');
  const [action, setAction] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [page, setPage] = React.useState(1);
  const logs = useQuery({
    queryKey: ['audit', table, action, from, to, page],
    queryFn: async () => {
      let q = supabase.from('audit_logs').select('*, actor:profiles!audit_logs_actor_id_fkey(full_name)', { count: 'exact' })
        .order('created_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
      if (table) q = q.eq('table_name', table);
      if (action) q = q.eq('action', action);
      // Date filters are Kuwait calendar days (UTC+3).
      if (from) q = q.gte('created_at', `${from}T00:00:00+03:00`);
      if (to) q = q.lte('created_at', `${to}T23:59:59.999+03:00`);
      const res = await q;
      return { rows: unwrap(res), total: res.count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
  const reset = (fn: () => void) => { fn(); setPage(1); };
  return (
    <>
      <PageHeader title="سجل التدقيق" description="سجل غير قابل للتعديل أو الحذف لكل العمليات المهمة. تُستبعد النصوص الحساسة (أوصاف البلاغات والملاحظات) من السجل." />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select aria-label="الجدول" value={table} onChange={(e) => reset(() => setTable(e.target.value))}>
            <option value="">كل السجلات</option>
            {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select aria-label="العملية" value={action} onChange={(e) => reset(() => setAction(e.target.value))}>
            <option value="">كل العمليات</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input type="date" aria-label="من تاريخ" value={from} onChange={(e) => reset(() => setFrom(e.target.value))} />
          <Input type="date" aria-label="إلى تاريخ" value={to} onChange={(e) => reset(() => setTo(e.target.value))} />
        </div>
        {logs.isPending ? <LoadingState rows={10} /> : logs.isError ? <ErrorState error={logs.error} onRetry={() => logs.refetch()} /> : logs.data.rows.length === 0 ? <EmptyState icon={<History />} title="لا توجد سجلات مطابقة" /> : (
          <>
            <Table caption="سجل التدقيق">
              <THead><Tr><Th>الوقت (الكويت)</Th><Th>المستخدم</Th><Th>العملية</Th><Th>السجل</Th><Th>التغييرات</Th><Th className="hidden lg:table-cell">السبب</Th></Tr></THead>
              <TBody>
                {logs.data.rows.map((l) => (
                  <Tr key={l.id} className="align-top">
                    <Td className="whitespace-nowrap text-fg-muted">{formatDateTime(l.created_at)}</Td>
                    <Td>{l.actor?.full_name ?? <span className="text-fg-subtle">النظام</span>}</Td>
                    <Td><Badge tone={l.action === 'delete' || l.action === 'deactivate_user' ? 'danger' : l.action === 'insert' || l.action === 'create_user' ? 'success' : 'neutral'}>{ACTION_LABELS[l.action] ?? l.action}</Badge></Td>
                    <Td>{TABLE_LABELS[l.table_name] ?? l.table_name}<span className="ltr block font-mono text-2xs text-fg-subtle">{l.record_id?.slice(0, 8)}</span></Td>
                    <Td><Changes value={l.changes} /></Td>
                    <Td className="hidden text-fg-muted lg:table-cell">{l.reason ?? '—'}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE} total={logs.data.total} onPageChange={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
