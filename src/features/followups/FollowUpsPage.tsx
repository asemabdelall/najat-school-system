import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ListChecks, Plus } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Select } from '@/components/ui/input';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { DueBadge, FollowUpStatusBadge, PriorityBadge } from '@/components/ui/status-badges';
import { useStaff } from '@/lib/queries';
import { formatDate, kuwaitToday } from '@/lib/format';
import { dueState, FOLLOW_UP_CATEGORY_LABELS, FOLLOW_UP_STATUS_LABELS, FOLLOW_UP_STATUSES, type FollowUpPriority, type FollowUpStatus } from '@/lib/domain/followups';
import { useStudent } from '@/features/students/api';
import { FOLLOWUP_PAGE, useFollowUps } from './api';
import { FollowUpFormDialog, type FollowUpPrefill } from './FollowUpFormDialog';

export function FollowUpsPage() {
  const { isManager, profile } = useAuth();
  const navigate = useNavigate();
  const today = kuwaitToday();
  const [params, setParams] = useSearchParams();
  const staff = useStaff();
  const [createOpen, setCreateOpen] = React.useState(params.get('new') === '1');

  // Prefill from links such as an incident's "create follow-up" action.
  const prefillStudent = useStudent(params.get('student') ?? undefined);
  const prefill: FollowUpPrefill | undefined = params.get('new')
    ? {
        student: prefillStudent.data ? { id: prefillStudent.data.id, full_name: prefillStudent.data.full_name, student_number: prefillStudent.data.student_number, class_name: null } : undefined,
        incidentId: params.get('incident') ?? undefined,
        category: params.get('category') ?? undefined,
      }
    : undefined;

  const mine = params.get('mine') === '1' || (!isManager && !params.has('mine'));
  const filters = {
    status: params.has('status') ? (params.get('status') ?? '') : 'active',
    assignee: mine ? (profile?.id ?? null) : params.get('assignee'),
    category: params.get('category') && !params.get('new') ? params.get('category') : null,
    overdue: params.get('overdue') === '1',
    page: Math.max(1, Number(params.get('page') ?? 1)),
  };
  const list = useFollowUps(filters);
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    for (const key of ['new', 'student', 'incident']) next.delete(key);
    if (v === null) next.delete(k);
    else next.set(k, v);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="المتابعة"
        description={isManager ? 'مهام متابعة الطلاب وإسنادها للمسؤولين' : 'المهام المسندة إليك أو التي أنشأتها'}
        actions={<Button onClick={() => setCreateOpen(true)}><Plus /> مهمة جديدة</Button>}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <Select aria-label="الحالة" className="w-44" value={filters.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">النشطة (مفتوحة/قيد التنفيذ)</option>
            <option value="">كل الحالات</option>
            {FOLLOW_UP_STATUSES.map((s) => <option key={s} value={s}>{FOLLOW_UP_STATUS_LABELS[s]}</option>)}
          </Select>
          <Select aria-label="التصنيف" className="w-44" value={filters.category ?? ''} onChange={(e) => set('category', e.target.value || null)}>
            <option value="">كل التصنيفات</option>
            {Object.entries(FOLLOW_UP_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {isManager && (
            <Select aria-label="المسؤول" className="w-52" value={mine ? '' : (params.get('assignee') ?? '')} disabled={mine} onChange={(e) => set('assignee', e.target.value || null)}>
              <option value="">كل المسؤولين</option>
              {staff.data?.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </Select>
          )}
          {isManager && (
            <label className="flex items-center gap-1.5 text-sm"><Checkbox checked={mine} onChange={(e) => set('mine', e.target.checked ? '1' : null)} /> المسندة إليّ فقط</label>
          )}
          <label className="flex items-center gap-1.5 text-sm"><Checkbox checked={filters.overdue} onChange={(e) => set('overdue', e.target.checked ? '1' : null)} /> المتأخرة فقط</label>
        </div>
        {list.isPending ? (
          <LoadingState rows={8} />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.rows.length === 0 ? (
          <EmptyState icon={<ListChecks />} title={filters.overdue ? 'لا توجد مهام متأخرة' : 'لا توجد مهام مطابقة'} />
        ) : (
          <>
            <Table caption="مهام المتابعة">
              <THead><Tr><Th>المهمة</Th><Th className="hidden md:table-cell">الطالب</Th><Th>المسؤول</Th><Th>الموعد</Th><Th className="hidden sm:table-cell">الأولوية</Th><Th>الحالة</Th></Tr></THead>
              <TBody>
                {list.data.rows.map((t) => {
                  const ds = dueState(t.status as FollowUpStatus, t.due_date, today);
                  return (
                    <Tr key={t.id} className="cursor-pointer hover:bg-surface-hover" onClick={() => navigate(`/follow-ups/${t.id}`)}>
                      <Td>
                        <Link to={`/follow-ups/${t.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:text-link hover:underline">{t.title}</Link>
                        <p className="text-xs text-fg-muted">{FOLLOW_UP_CATEGORY_LABELS[t.category]}</p>
                      </Td>
                      <Td className="hidden md:table-cell">{t.students?.full_name ?? <span className="text-fg-subtle">—</span>}</Td>
                      <Td>{t.assignee?.full_name}</Td>
                      <Td className="whitespace-nowrap">
                        <span className="block">{formatDate(t.due_date)}</span>
                        <DueBadge state={ds} dueDate={t.due_date} today={today} />
                      </Td>
                      <Td className="hidden sm:table-cell"><PriorityBadge priority={t.priority as FollowUpPriority} /></Td>
                      <Td><FollowUpStatusBadge status={t.status as FollowUpStatus} /></Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={filters.page} pageSize={FOLLOWUP_PAGE} total={list.data.total} onPageChange={(p) => set('page', String(p))} />
          </>
        )}
      </Card>
      <FollowUpFormDialog
        open={createOpen && (!params.get('student') || !prefillStudent.isPending)}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o && params.get('new')) set('new', null);
        }}
        prefill={prefill}
        onSaved={(id) => navigate(`/follow-ups/${id}`)}
      />
    </>
  );
}
