import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, CalendarCheck2, FileSpreadsheet, Flag, Gavel, ListChecks, Lock, School, Search, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { StatCard } from '@/components/ui/stat-card';
import { Stagger } from '@/components/motion/Stagger';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { supabase } from '@/lib/supabase';
import { errorMessage, unwrap } from '@/lib/errors';
import { useDebouncedValue } from '@/lib/hooks';
import { formatDate, formatNumber, formatPercent } from '@/lib/format';
import { sqlNull } from '@/lib/utils';
import { useAcademicYears } from '@/lib/queries';
import { buildXlsx, downloadXlsx } from '@/lib/xlsx';
import { attendanceRate } from '@/lib/domain/attendance';
import { STUDENT_STATUS_LABELS } from '@/features/students/api';
import { INCIDENT_STATUS_LABELS, type IncidentStatus } from '@/lib/domain/behavior';
import { DISCIPLINE_STATUS_LABELS, DISCIPLINE_TYPE_LABELS, type DisciplineStatus, type DisciplineType } from '@/lib/domain/discipline';

const PAGE = 25;
type Summary = { students: number; classes: number; sessions: number; present: number; late: number; absent: number; excused: number; incidents: number; follow_ups: number; excuses: number };

function StudentsTab({ yearId, yearName }: { yearId: string; yearName: string }) {
  const [text, setText] = React.useState('');
  const term = useDebouncedValue(text.trim(), 300);
  const [page, setPage] = React.useState(1);
  const [exporting, setExporting] = React.useState(false);
  React.useEffect(() => setPage(1), [term, yearId]);
  const list = useQuery({
    queryKey: ['archive', 'students', yearId, term, page],
    queryFn: async () => {
      const rows = unwrap(await supabase.rpc('search_students', { p_search: sqlNull(term || null), p_year_id: yearId, p_limit: PAGE, p_offset: (page - 1) * PAGE }));
      return { rows, total: Number(rows[0]?.total_count ?? 0) };
    },
    placeholderData: keepPreviousData,
  });

  const exportAll = async () => {
    setExporting(true);
    try {
      const all: Awaited<ReturnType<typeof fetchPage>> = [];
      for (let offset = 0; ; offset += 200) {
        const rows = await fetchPage(yearId, offset);
        all.push(...rows);
        if (rows.length < 200) break;
      }
      downloadXlsx(`najat-archive-${yearName.replace(/\W+/g, '-')}-students.xlsx`, buildXlsx([{
        name: `طلاب ${yearName}`,
        rows: all,
        columns: [
          { header: 'الرقم الطلابي', value: (r: (typeof all)[number]) => r.student_number, width: 16 },
          { header: 'اسم الطالب', value: (r: (typeof all)[number]) => r.full_name, width: 40 },
          { header: 'الفصل', value: (r: (typeof all)[number]) => r.class_name, width: 8 },
          { header: 'الحالة الحالية', value: (r: (typeof all)[number]) => STUDENT_STATUS_LABELS[r.status] ?? r.status, width: 16 },
        ],
      }]));
      toast.success('تم تصدير ملف Excel');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <label htmlFor="arch-search" className="sr-only">بحث بالاسم أو الرقم الطلابي</label>
          <Input id="arch-search" type="search" className="ps-9" placeholder="بحث بالاسم أو الرقم الطلابي" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Button variant="secondary" loading={exporting} onClick={() => void exportAll()}><FileSpreadsheet /> تصدير Excel</Button>
      </div>
      {list.isPending ? <LoadingState rows={6} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : list.data.rows.length === 0 ? (
        <EmptyState icon={<Users />} title="لا يوجد طلاب مطابقون" />
      ) : (
        <div className={list.isFetching ? 'opacity-70 transition-opacity' : undefined}>
          <Table caption={`طلاب العام ${yearName}`}>
            <THead><Tr><Th>الرقم الطلابي</Th><Th>اسم الطالب</Th><Th>الفصل</Th><Th>الحالة الحالية</Th></Tr></THead>
            <TBody>
              {list.data.rows.map((s) => (
                <Tr key={s.id}>
                  <Td className="whitespace-nowrap text-fg-muted"><span className="ltr tabular">{s.student_number}</span></Td>
                  <Td className="min-w-48"><Link to={`/students/${s.id}`} className="font-semibold hover:text-link hover:underline">{s.full_name}</Link></Td>
                  <Td className="whitespace-nowrap">{s.class_name ?? '—'}</Td>
                  <Td><Badge tone={s.status === 'graduated' ? 'success' : s.status === 'active' ? 'brand' : 'neutral'}>{STUDENT_STATUS_LABELS[s.status] ?? s.status}</Badge></Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE} total={list.data.total} onPageChange={setPage} />
        </div>
      )}
    </Card>
  );
}

async function fetchPage(yearId: string, offset: number) {
  return unwrap(await supabase.rpc('search_students', { p_year_id: yearId, p_limit: 200, p_offset: offset }));
}

function IncidentsTab({ yearId }: { yearId: string }) {
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [yearId]);
  const list = useQuery({
    queryKey: ['archive', 'incidents', yearId, page],
    queryFn: async () => {
      const res = await supabase
        .from('behavior_incidents')
        .select('id, incident_date, status, behavior_categories(name), incident_students(students(full_name))', { count: 'exact' })
        .eq('academic_year_id', yearId)
        .order('incident_date', { ascending: false })
        .range((page - 1) * PAGE, page * PAGE - 1);
      return { rows: unwrap(res), total: res.count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
  return (
    <Card>
      {list.isPending ? <LoadingState rows={6} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : list.data.rows.length === 0 ? (
        <EmptyState icon={<Flag />} title="لا توجد ملاحظات سلوك في هذا العام" />
      ) : (
        <>
          <Table caption="ملاحظات السلوك في العام المؤرشف">
            <THead><Tr><Th>التاريخ</Th><Th>التصنيف</Th><Th>الطلاب</Th><Th>الحالة</Th></Tr></THead>
            <TBody>
              {list.data.rows.map((i) => (
                <Tr key={i.id}>
                  <Td className="whitespace-nowrap"><Link to={`/behavior/${i.id}`} className="font-semibold text-link hover:underline">{formatDate(i.incident_date)}</Link></Td>
                  <Td>{i.behavior_categories?.name}</Td>
                  <Td className="min-w-48">{i.incident_students.map((s) => s.students?.full_name).filter(Boolean).join('، ')}</Td>
                  <Td>{INCIDENT_STATUS_LABELS[i.status as IncidentStatus] ?? i.status}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE} total={list.data.total} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}

function DisciplineTab({ yearId }: { yearId: string }) {
  const [page, setPage] = React.useState(1);
  React.useEffect(() => setPage(1), [yearId]);
  const list = useQuery({
    queryKey: ['archive', 'discipline', yearId, page],
    queryFn: async () => {
      const res = await supabase
        .from('disciplinary_actions')
        .select('id, action_type, status, created_at, students(full_name)', { count: 'exact' })
        .eq('academic_year_id', yearId)
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE, page * PAGE - 1);
      return { rows: unwrap(res), total: res.count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
  return (
    <Card>
      {list.isPending ? <LoadingState rows={6} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : list.data.rows.length === 0 ? (
        <EmptyState icon={<Gavel />} title="لا توجد جزاءات في هذا العام" />
      ) : (
        <>
          <Table caption="الجزاءات في العام المؤرشف">
            <THead><Tr><Th>التاريخ</Th><Th>النوع</Th><Th>الطالب</Th><Th>الحالة</Th></Tr></THead>
            <TBody>
              {list.data.rows.map((d) => (
                <Tr key={d.id}>
                  <Td className="whitespace-nowrap"><Link to={`/discipline/${d.id}`} className="font-semibold text-link hover:underline">{formatDate(d.created_at.slice(0, 10))}</Link></Td>
                  <Td>{DISCIPLINE_TYPE_LABELS[d.action_type as DisciplineType]}</Td>
                  <Td className="min-w-48">{d.students?.full_name}</Td>
                  <Td>{DISCIPLINE_STATUS_LABELS[d.status as DisciplineStatus]}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={PAGE} total={list.data.total} onPageChange={setPage} />
        </>
      )}
    </Card>
  );
}

export function ArchivePage() {
  const years = useAcademicYears();
  const [params, setParams] = useSearchParams();
  const archived = React.useMemo(() => (years.data ?? []).filter((y) => !y.is_current), [years.data]);
  const yearId = params.get('year') ?? archived[0]?.id ?? null;
  const year = archived.find((y) => y.id === yearId) ?? null;
  const tab = params.get('tab') ?? 'students';
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    next.set(k, v);
    setParams(next, { replace: true });
  };

  const summary = useQuery({
    queryKey: ['archive', 'summary', yearId],
    queryFn: async () => unwrap(await supabase.rpc('academic_year_summary', { p_year_id: yearId! })) as unknown as Summary | null,
    enabled: Boolean(yearId),
  });
  const s = summary.data;

  return (
    <>
      <PageHeader
        title="الأرشيف"
        description="سجلات الأعوام الدراسية السابقة للعرض فقط. الشاشات اليومية تعرض العام الحالي وحده."
        actions={
          archived.length > 0 && (
            <div className="w-48">
              <label htmlFor="arch-year" className="sr-only">العام الدراسي</label>
              <Select id="arch-year" value={yearId ?? ''} onChange={(e) => set('year', e.target.value)}>
                {archived.map((y) => <option key={y.id} value={y.id}>{y.name}{y.status === 'closed' ? '' : ' (غير مغلق)'}</option>)}
              </Select>
            </div>
          )
        }
      />
      {years.isPending ? <LoadingState rows={4} /> : years.isError ? <ErrorState error={years.error} onRetry={() => years.refetch()} /> : !year ? (
        <Card>
          <EmptyState
            icon={<Archive />}
            title="لا توجد أعوام سابقة بعد"
            description="عند إنهاء العام الدراسي من الإعدادات تنتقل سجلاته إلى هنا، ويبدأ عام جديد بسجلات منفصلة."
          />
        </Card>
      ) : (
        <>
          <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-neutral-line bg-neutral-soft p-3 text-sm text-neutral">
            <Lock className="size-4 shrink-0" aria-hidden />
            العام <span className="ltr tabular font-bold">{year.name}</span> ({formatDate(year.starts_on)} – {formatDate(year.ends_on)})
            {year.status === 'closed' ? ' مغلق: كل سجلاته للعرض فقط.' : ' غير مغلق.'}
          </div>
          {summary.isError ? <ErrorState error={summary.error} onRetry={() => summary.refetch()} /> : (
            <Stagger className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="الطلاب" value={formatNumber(s?.students)} icon={<Users />} loading={summary.isPending} />
              <StatCard label="الفصول" value={formatNumber(s?.classes)} icon={<School />} loading={summary.isPending} />
              <StatCard label="نسبة الحضور" value={formatPercent(s ? attendanceRate(s) : null)} hint={s ? `${formatNumber(s.sessions)} جلسة حضور` : undefined} icon={<CalendarCheck2 />} tone="success" loading={summary.isPending} />
              <StatCard label="ملاحظات السلوك" value={formatNumber(s?.incidents)} hint={s ? `${formatNumber(s.follow_ups)} متابعة · ${formatNumber(s.excuses)} عذر` : undefined} icon={<ListChecks />} tone="info" loading={summary.isPending} />
            </Stagger>
          )}
          <Tabs value={tab} onValueChange={(v) => set('tab', v)} dir="rtl">
            <TabsList className="mb-4">
              <TabsTrigger value="students"><Users /> الطلاب</TabsTrigger>
              <TabsTrigger value="behavior"><Flag /> السلوك</TabsTrigger>
              <TabsTrigger value="discipline"><Gavel /> الجزاءات</TabsTrigger>
            </TabsList>
            <TabsContent value="students"><StudentsTab yearId={year.id} yearName={year.name} /></TabsContent>
            <TabsContent value="behavior"><IncidentsTab yearId={year.id} /></TabsContent>
            <TabsContent value="discipline"><DisciplineTab yearId={year.id} /></TabsContent>
          </Tabs>
        </>
      )}
    </>
  );
}

