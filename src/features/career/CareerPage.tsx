import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { CheckCircle2, CircleDashed, Compass, FileSpreadsheet, Percent, Printer, Search, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { StatCard } from '@/components/ui/stat-card';
import { Stagger } from '@/components/motion/Stagger';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { supabase } from '@/lib/supabase';
import { errorMessage, unwrap } from '@/lib/errors';
import { useDebouncedValue } from '@/lib/hooks';
import { formatDate, formatDateTime, formatNumber, formatPercent, kuwaitToday } from '@/lib/format';
import { sqlNull } from '@/lib/utils';
import { useClasses, useCurrentYear, useSchoolSettings } from '@/lib/queries';
import { buildXlsx, downloadXlsx } from '@/lib/xlsx';
import {
  CAREER_CATEGORIES, CAREER_LABELS, careerLabel, parseCareerStats, scoreOf,
  type CareerListRow, type CareerRow, type CareerStats, type CategoryStat, type ClassCareerStat,
} from '@/lib/domain/career';

type Show = 'all' | 'tested' | 'pending';
const PAGE_SIZE = 25;
const axis = { stroke: 'var(--chart-axis)', fontSize: 11, fontFamily: 'inherit' };
const num = (v: number | null | undefined) => formatNumber(Number(v ?? 0));

function ChartTooltip({ active, payload }: Partial<TooltipContentProps<number, string>>) {
  if (!active || !payload?.length) return null;
  const c = payload[0].payload as CategoryStat;
  return (
    <div className="rounded-md border border-line bg-surface-raised px-3 py-2 text-xs shadow-md" dir="rtl">
      <p className="mb-1 font-bold text-fg">{c.label}</p>
      <p className="text-fg">الميل الأول: <span className="tabular font-bold">{formatNumber(c.first)}</span> طالب</p>
      <p className="text-fg-muted">ضمن أعلى ثلاثة: {formatNumber(c.inTop3)}</p>
    </div>
  );
}

/** Single series (first-choice count per category): one hue, no legend; the card title names it. */
function FirstChoiceChart({ data }: { data: CategoryStat[] }) {
  return (
    // dir="ltr": in an RTL document SVG text anchors flip and the category
    // labels would overlap the bars. The reversed axis keeps the RTL reading order.
    <div className="h-80" dir="ltr" role="img" aria-label="عدد الطلاب حسب الميل المهني الأول">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 4, left: 8, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
          <XAxis type="number" reversed allowDecimals={false} tickFormatter={(v: number) => formatNumber(v)} tick={axis} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" orientation="right" width={120} tick={{ ...axis, fill: 'var(--fg)' }} tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
          <Bar dataKey="first" fill="var(--chart-rate)" radius={[4, 0, 0, 4]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TopThree({ row }: { row: Pick<CareerListRow, 'top_1' | 'top_2' | 'top_3'> }) {
  if (!row.top_1) return <Badge tone="warning"><CircleDashed /> لم يؤدِّ الاختبار</Badge>;
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone="brand">١. {careerLabel(row.top_1)}</Badge>
      <Badge tone="outline">٢. {careerLabel(row.top_2)}</Badge>
      <Badge tone="outline">٣. {careerLabel(row.top_3)}</Badge>
    </span>
  );
}

function buildWorkbook(rows: CareerRow[], stats: CareerStats) {
  return buildXlsx([
    {
      name: 'النتائج',
      rows,
      columns: [
        { header: 'الرقم الطلابي', value: (r: CareerRow) => r.student_number, width: 16 },
        { header: 'اسم الطالب', value: (r: CareerRow) => r.full_name, width: 40 },
        { header: 'الفصل', value: (r: CareerRow) => r.class_name, width: 8 },
        { header: 'الحالة', value: (r: CareerRow) => (r.top_1 ? 'أدى الاختبار' : 'لم يؤدِّ الاختبار'), width: 16 },
        { header: 'الميل الأول', value: (r: CareerRow) => (r.top_1 ? careerLabel(r.top_1) : ''), width: 18 },
        { header: 'الميل الثاني', value: (r: CareerRow) => (r.top_2 ? careerLabel(r.top_2) : ''), width: 18 },
        { header: 'الميل الثالث', value: (r: CareerRow) => (r.top_3 ? careerLabel(r.top_3) : ''), width: 18 },
        ...CAREER_CATEGORIES.map((k) => ({ header: `${CAREER_LABELS[k]} (من 5)`, value: (r: CareerRow) => scoreOf(r, k), width: 14 })),
        { header: 'تاريخ آخر محاولة', value: (r: CareerRow) => (r.submitted_at ? formatDateTime(r.submitted_at) : ''), width: 22 },
        { header: 'عدد المحاولات', value: (r: CareerRow) => r.attempts, width: 12 },
      ],
    },
    {
      name: 'ملخص المجالات',
      rows: stats.categories,
      columns: [
        { header: 'المجال', value: (c: CategoryStat) => c.label, width: 20 },
        { header: 'عدد الطلاب (الميل الأول)', value: (c: CategoryStat) => c.first, width: 22 },
        { header: 'النسبة من المختبَرين %', value: (c: CategoryStat) => c.share, width: 20 },
        { header: 'ضمن أعلى ثلاثة', value: (c: CategoryStat) => c.inTop3, width: 16 },
        { header: 'متوسط الدرجة (من 5)', value: (c: CategoryStat) => c.average, width: 18 },
      ],
    },
    {
      name: 'ملخص الفصول',
      rows: stats.classes,
      columns: [
        { header: 'الفصل', value: (c: ClassCareerStat) => c.class_name, width: 10 },
        { header: 'عدد الطلاب', value: (c: ClassCareerStat) => c.total, width: 12 },
        { header: 'أدوا الاختبار', value: (c: ClassCareerStat) => c.tested, width: 14 },
        { header: 'نسبة الإنجاز %', value: (c: ClassCareerStat) => c.completion, width: 14 },
        { header: 'الميل الأكثر شيوعًا', value: (c: ClassCareerStat) => (c.leading ? careerLabel(c.leading) : ''), width: 20 },
        { header: 'عدد طلابه', value: (c: ClassCareerStat) => c.leadingCount, width: 12 },
      ],
    },
  ]);
}

export function CareerPage() {
  const { isManager, profile } = useAuth();
  const settings = useSchoolSettings();
  const year = useCurrentYear();
  const classes = useClasses(year.data?.id ?? undefined);
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = React.useState(params.get('q') ?? '');
  const debounced = useDebouncedValue(searchText.trim(), 300);
  const [exporting, setExporting] = React.useState(false);

  const classId = params.get('class');
  const show = (params.get('show') as Show | null) ?? 'all';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const update = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  React.useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) update('q', debounced || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const statsQuery = useQuery({
    queryKey: ['career', 'stats', classId],
    queryFn: async () => parseCareerStats(unwrap(await supabase.rpc('career_quiz_stats', classId ? { p_class_id: classId } : {}))),
  });
  const listQuery = useQuery({
    queryKey: ['career', 'list', classId, show, debounced, page],
    queryFn: async () => {
      const rows = unwrap(
        await supabase.rpc('career_quiz_students', {
          p_class_id: sqlNull(classId),
          p_status: sqlNull(show === 'all' ? null : show),
          p_search: sqlNull(debounced || null),
          p_limit: PAGE_SIZE,
          p_offset: (page - 1) * PAGE_SIZE,
        }),
      ) as unknown as CareerListRow[];
      return { rows, total: Number(rows[0]?.total_count ?? 0) };
    },
    placeholderData: keepPreviousData,
  });

  const stats = statsQuery.data;
  const className = classes.data?.find((c) => c.id === classId)?.name;
  const scope = className ? `فصل ${className}` : isManager ? 'كل الفصول' : 'فصولك';
  const hasListFilters = show !== 'all' || Boolean(params.get('q'));

  const exportExcel = async () => {
    if (!stats) return;
    setExporting(true);
    try {
      // The export is the one place that needs every row (with scores), so it is fetched on demand.
      const rows = (unwrap(await supabase.rpc('career_quiz_overview', classId ? { p_class_id: classId } : {})) as unknown as CareerRow[]).map((r) => ({
        ...r,
        attempts: Number(r.attempts),
      }));
      downloadXlsx(`najat-career-${className ? `class-${className.replace(/\W+/g, '-')}-` : ''}${kuwaitToday()}.xlsx`, buildWorkbook(rows, stats));
      toast.success('تم تصدير ملف Excel');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="الميول المهنية"
        description={`نتائج اختبار الميول المهنية للعام ${year.data?.name ?? 'الحالي'} · ${scope}`}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => window.print()}><Printer /> طباعة</Button>
            <Button onClick={() => void exportExcel()} loading={exporting} disabled={!stats?.total}><FileSpreadsheet /> تصدير Excel</Button>
          </div>
        }
      />
      <div className="print-only mb-4 border-b pb-3">
        <p className="text-lg font-bold">{settings.data?.school_name_ar}</p>
        <p>تقرير الميول المهنية · {scope}</p>
        <p className="text-sm">أُعد بواسطة {profile?.full_name} في {formatDate(kuwaitToday())}</p>
      </div>

      <Card className="no-print mb-4">
        <div className="grid gap-3 p-4 sm:grid-cols-[minmax(10rem,14rem)]">
          <div>
            <label htmlFor="c-class" className="mb-1 block text-xs font-semibold text-fg-muted">الفصل</label>
            <Select id="c-class" value={classId ?? ''} onChange={(e) => update('class', e.target.value || null)}>
              <option value="">كل الفصول المتاحة</option>
              {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
        </div>
      </Card>

      {statsQuery.isPending ? <LoadingState rows={6} /> : statsQuery.isError ? <ErrorState error={statsQuery.error} onRetry={() => statsQuery.refetch()} /> : stats!.total === 0 ? (
        <Card><EmptyState icon={<Compass />} title="لا يوجد طلاب مسجلون في النطاق المحدد" /></Card>
      ) : (
        <>
          <Stagger className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="عدد الطلاب" value={num(stats!.total)} icon={<Users />} />
            <StatCard label="أدوا الاختبار" value={num(stats!.tested)} icon={<CheckCircle2 />} tone="success" />
            <StatCard label="لم يؤدوه بعد" value={num(stats!.notTested)} icon={<CircleDashed />} tone="warning" />
            <StatCard label="نسبة الإنجاز" value={formatPercent(stats!.completion)} icon={<Percent />} tone="info" />
          </Stagger>

          <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="print-plain min-w-0">
              <CardHeader title="عدد الطلاب حسب الميل الأول" description={`من ${num(stats!.tested)} طالب أدوا الاختبار`} icon={<Compass />} />
              <div className="p-4">
                {stats!.tested ? <FirstChoiceChart data={stats!.categories} /> : <EmptyState title="لم يؤدِّ أي طالب الاختبار بعد" />}
              </div>
            </Card>
            <Card className="print-plain min-w-0">
              <CardHeader title="ملخص المجالات" description="الأرقام نفسها التي يعرضها الرسم، مع متوسط الدرجات" />
              <Table caption="ملخص مجالات الميول المهنية">
                <THead><Tr><Th>المجال</Th><Th>الميل الأول</Th><Th>النسبة</Th><Th>ضمن أعلى ثلاثة</Th><Th>متوسط الدرجة</Th></Tr></THead>
                <TBody>
                  {stats!.categories.map((c) => (
                    <Tr key={c.key}>
                      <Td className="whitespace-nowrap font-semibold">{c.label}</Td>
                      <Td className="tabular">{num(c.first)}</Td>
                      <Td className="tabular">{formatPercent(c.share)}</Td>
                      <Td className="tabular">{num(c.inTop3)}</Td>
                      <Td className="tabular whitespace-nowrap">{c.average == null ? '—' : `${formatNumber(c.average)} / ٥`}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>

          {!classId && stats!.classes.length > 1 && (
            <Card className="print-plain mb-4 min-w-0">
              <CardHeader title="حسب الفصل" />
              <Table caption="الميول المهنية حسب الفصل">
                <THead><Tr><Th>الفصل</Th><Th>الطلاب</Th><Th>أدوا الاختبار</Th><Th>نسبة الإنجاز</Th><Th>الميل الأكثر شيوعًا</Th></Tr></THead>
                <TBody>
                  {stats!.classes.map((c) => (
                    <Tr key={c.class_id}>
                      <Td className="font-semibold"><button type="button" className="hover:text-link hover:underline" onClick={() => update('class', c.class_id)}>{c.class_name}</button></Td>
                      <Td className="tabular">{num(c.total)}</Td>
                      <Td className="tabular">{num(c.tested)}</Td>
                      <Td className="tabular">{formatPercent(c.completion)}</Td>
                      <Td className="whitespace-nowrap">{c.leading ? <>{careerLabel(c.leading)} <span className="tabular text-fg-muted">({num(c.leadingCount)})</span></> : '—'}</Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}

          <Card className="print-plain min-w-0">
            <CardHeader title="نتائج الطلاب" description="آخر محاولة لكل طالب" />
            <div className="no-print grid gap-3 border-b border-line p-4 sm:grid-cols-[minmax(14rem,2fr)_minmax(10rem,1fr)_auto]">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
                <label htmlFor="career-search" className="sr-only">بحث بالاسم أو الرقم الطلابي</label>
                <Input id="career-search" type="search" className="ps-9" placeholder="بحث بالاسم أو الرقم الطلابي" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
              </div>
              <Select aria-label="حالة الاختبار" value={show} onChange={(e) => update('show', e.target.value === 'all' ? null : e.target.value)}>
                <option value="all">كل الطلاب</option>
                <option value="tested">أدوا الاختبار</option>
                <option value="pending">لم يؤدوا الاختبار بعد</option>
              </Select>
              {hasListFilters && (
                <Button variant="ghost" onClick={() => { setSearchText(''); const next = new URLSearchParams(params); ['q', 'show', 'page'].forEach((k) => next.delete(k)); setParams(next, { replace: true }); }}>
                  <X /> مسح
                </Button>
              )}
            </div>

            {listQuery.isPending ? <LoadingState rows={6} /> : listQuery.isError ? <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} /> : listQuery.data.rows.length === 0 ? (
              <EmptyState title="لا يوجد طلاب يطابقون البحث أو التصفية" />
            ) : (
              <div className={listQuery.isFetching ? 'opacity-70 transition-opacity' : undefined}>
                <p className="sr-only" aria-live="polite">{formatNumber(listQuery.data.total)} طالب</p>
                {/* Phones: one card per student, so names never wrap into a narrow column. */}
                <ul className="divide-y divide-line sm:hidden" aria-label="نتائج الطلاب">
                  {listQuery.data.rows.map((r) => (
                    <li key={r.student_id} className="space-y-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <Link to={`/students/${r.student_id}`} className="font-semibold leading-snug hover:text-link hover:underline">{r.full_name}</Link>
                        <span className="shrink-0 text-sm text-fg-muted">{r.class_name}</span>
                      </div>
                      <TopThree row={r} />
                      {r.submitted_at && (
                        <p className="tabular text-xs text-fg-muted">{formatDateTime(r.submitted_at)}{Number(r.attempts) > 1 && ` · ${num(Number(r.attempts))} محاولات`}</p>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="hidden sm:block">
                  <Table caption="نتائج الطلاب في اختبار الميول المهنية">
                    <THead><Tr><Th>الطالب</Th><Th>الفصل</Th><Th>الميول (الأول ← الثالث)</Th><Th>التاريخ</Th></Tr></THead>
                    <TBody>
                      {listQuery.data.rows.map((r) => (
                        <Tr key={r.student_id}>
                          <Td className="min-w-48"><Link to={`/students/${r.student_id}`} className="font-semibold hover:text-link hover:underline">{r.full_name}</Link></Td>
                          <Td className="whitespace-nowrap">{r.class_name}</Td>
                          <Td><TopThree row={r} /></Td>
                          <Td className="tabular whitespace-nowrap text-fg-muted">{r.submitted_at ? formatDateTime(r.submitted_at) : '—'}{Number(r.attempts) > 1 && ` · ${num(Number(r.attempts))} محاولات`}</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </div>
                <Pagination page={page} pageSize={PAGE_SIZE} total={listQuery.data.total} onPageChange={(p) => update('page', String(p))} />
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}
