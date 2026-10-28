import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Flag, Plus, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { IncidentStatusBadge, SeverityBadge } from '@/components/ui/status-badges';
import { StudentPicker, type PickedStudent } from '@/components/StudentPicker';
import { useBehaviorCategories, useClasses, useCurrentYear } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { INCIDENT_STATUS_LABELS, INCIDENT_STATUSES } from '@/lib/domain/behavior';
import { INCIDENT_PAGE, useIncidents } from './api';

export function IncidentsPage() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const categories = useBehaviorCategories(true);
  const year = useCurrentYear();
  const classes = useClasses(year.data?.id ?? undefined);
  const [student, setStudent] = React.useState<PickedStudent[]>([]);

  const filters = {
    status: params.has('status') ? params.get('status') || null : isManager ? 'open' : null,
    categoryId: params.get('category'),
    classId: params.get('class'),
    studentId: student[0]?.id ?? null,
    from: params.get('from'),
    to: params.get('to'),
    page: Math.max(1, Number(params.get('page') ?? 1)),
  };
  const incidents = useIncidents(filters);
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const filtered = [...params.keys()].some((k) => k !== 'page') || student.length > 0;

  return (
    <>
      <PageHeader
        title="السلوك الطلابي"
        description={isManager ? 'البلاغات السلوكية ومسار مراجعتها' : 'البلاغات التي رفعتها ومتابعة حالتها'}
        actions={<Button asChild><Link to="/behavior/new"><Plus /> رفع بلاغ</Link></Button>}
      />
      <Card>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-6">
          <Select aria-label="الحالة" value={params.has('status') ? (params.get('status') ?? '') : (filters.status ?? '')} onChange={(e) => set('status', e.target.value)}>
            <option value="">كل الحالات</option>
            <option value="open">بانتظار القرار (مرفوع/قيد المراجعة)</option>
            {INCIDENT_STATUSES.map((s) => <option key={s} value={s}>{INCIDENT_STATUS_LABELS[s]}</option>)}
          </Select>
          <Select aria-label="التصنيف" value={filters.categoryId ?? ''} onChange={(e) => set('category', e.target.value || null)}>
            <option value="">كل التصنيفات</option>
            {categories.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select aria-label="الفصل" value={filters.classId ?? ''} onChange={(e) => set('class', e.target.value || null)}>
            <option value="">كل الفصول</option>
            {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Input type="date" aria-label="من تاريخ" value={filters.from ?? ''} onChange={(e) => set('from', e.target.value || null)} />
          <Input type="date" aria-label="إلى تاريخ" value={filters.to ?? ''} onChange={(e) => set('to', e.target.value || null)} />
          {filtered && <Button variant="ghost" onClick={() => { setStudent([]); setParams(new URLSearchParams({ status: '' }), { replace: true }); }}><X /> مسح التصفية</Button>}
          <div className="sm:col-span-2 lg:col-span-3">
            <StudentPicker id="incident-student-filter" value={student} onChange={(v) => { setStudent(v); set('page', null); }} />
          </div>
        </div>
        {incidents.isPending ? (
          <LoadingState rows={8} />
        ) : incidents.isError ? (
          <ErrorState error={incidents.error} onRetry={() => incidents.refetch()} />
        ) : incidents.data.rows.length === 0 ? (
          <EmptyState icon={<Flag />} title={filtered || filters.status ? 'لا توجد بلاغات مطابقة' : 'لا توجد بلاغات'} />
        ) : (
          <>
            <Table caption="البلاغات السلوكية">
              <THead><Tr><Th>التاريخ</Th><Th>الطلاب</Th><Th>التصنيف</Th><Th className="hidden md:table-cell">الخطورة</Th><Th>الحالة</Th><Th className="hidden lg:table-cell">مقدم البلاغ</Th></Tr></THead>
              <TBody>
                {incidents.data.rows.map((i) => (
                  <Tr key={i.id} className="cursor-pointer hover:bg-surface-hover" onClick={() => navigate(`/behavior/${i.id}`)}>
                    <Td className="whitespace-nowrap"><Link to={`/behavior/${i.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-link hover:underline">{formatDate(i.incident_date)}</Link></Td>
                    <Td>{i.incident_students.map((s) => s.students?.full_name).filter(Boolean).join('، ')}</Td>
                    <Td>{i.behavior_categories?.name}</Td>
                    <Td className="hidden md:table-cell"><SeverityBadge severity={i.severity} /></Td>
                    <Td><IncidentStatusBadge status={i.status} /></Td>
                    <Td className="hidden text-fg-muted lg:table-cell">{i.reporter?.full_name}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={filters.page} pageSize={INCIDENT_PAGE} total={incidents.data.total} onPageChange={(p) => set('page', String(p))} />
          </>
        )}
      </Card>
    </>
  );
}
