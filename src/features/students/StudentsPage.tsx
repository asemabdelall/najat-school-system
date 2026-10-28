import * as React from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Search, UserPlus, Users, X } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Pagination } from '@/components/ui/pagination';
import { useAcademicYears, useClasses } from '@/lib/queries';
import { useDebouncedValue } from '@/lib/hooks';
import { formatNumber } from '@/lib/format';
import { PAGE_SIZE, STUDENT_STATUS_LABELS, useStudentSearch } from './api';
import { StudentFormDialog } from './StudentFormDialog';

export function StudentStatusBadge({ status }: { status: string }) {
  const tone = status === 'active' ? 'success' : status === 'archived' ? 'neutral' : 'info';
  return <Badge tone={tone}>{STUDENT_STATUS_LABELS[status] ?? status}</Badge>;
}

export function StudentsPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [searchText, setSearchText] = React.useState(params.get('q') ?? '');
  const debounced = useDebouncedValue(searchText, 300);
  const [createOpen, setCreateOpen] = React.useState(false);

  const years = useAcademicYears();
  const yearId = params.get('year');
  const effectiveYear = yearId ?? years.data?.find((y) => y.is_current)?.id ?? null;
  const classes = useClasses(effectiveYear ?? undefined, { includeArchived: true });

  const filters = {
    search: debounced,
    yearId,
    classId: params.get('class'),
    grade: params.get('grade') ? Number(params.get('grade')) : null,
    status: params.has('status') ? params.get('status') || null : 'active',
    page: Math.max(1, Number(params.get('page') ?? 1)),
  };
  const query = useStudentSearch(filters);

  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    if (key !== 'page') next.delete('page');
    if (key === 'year') next.delete('class');
    setParams(next, { replace: true });
  };

  React.useEffect(() => {
    if ((params.get('q') ?? '') !== debounced) update('q', debounced || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const hasFilters = Boolean(params.get('q') || yearId || filters.classId || filters.grade || params.has('status'));

  return (
    <>
      <PageHeader
        title="الطلاب"
        description="سجل الطلاب وتسجيلهم في الفصول"
        actions={
          can('students.manage') && (
            <Button onClick={() => setCreateOpen(true)}>
              <UserPlus /> إضافة طالب
            </Button>
          )
        }
      />

      <Card>
        <div className="no-print grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,2fr)_repeat(4,minmax(8rem,1fr))_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
            <label htmlFor="student-search" className="sr-only">
              بحث بالاسم أو الرقم الطلابي
            </label>
            <Input id="student-search" type="search" className="ps-9" placeholder="بحث بالاسم أو الرقم الطلابي" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
          </div>
          <Select aria-label="العام الدراسي" value={yearId ?? ''} onChange={(e) => update('year', e.target.value || null)}>
            <option value="">العام الحالي</option>
            {years.data?.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
          <Select aria-label="الصف" value={filters.grade ?? ''} onChange={(e) => update('grade', e.target.value || null)}>
            <option value="">كل الصفوف</option>
            {[10, 11, 12].map((g) => (
              <option key={g} value={g}>
                الصف {g}
              </option>
            ))}
          </Select>
          <Select aria-label="الفصل" value={filters.classId ?? ''} onChange={(e) => update('class', e.target.value || null)}>
            <option value="">كل الفصول</option>
            {classes.data
              ?.filter((c) => !filters.grade || c.grade_level === filters.grade)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
          <Select aria-label="حالة الطالب" value={params.has('status') ? (params.get('status') ?? '') : 'active'} onChange={(e) => update('status', e.target.value)}>
            <option value="">كل الحالات</option>
            {Object.entries(STUDENT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          {hasFilters && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchText('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              <X /> مسح
            </Button>
          )}
        </div>

        {query.isPending ? (
          <LoadingState rows={8} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.rows.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={hasFilters ? 'لا توجد نتائج مطابقة' : 'لا يوجد طلاب بعد'}
            description={hasFilters ? 'جرّب تعديل البحث أو عوامل التصفية.' : 'ابدأ بإضافة الطلاب وتسجيلهم في الفصول.'}
          />
        ) : (
          <>
            <p className="sr-only" aria-live="polite">
              {formatNumber(query.data.total)} طالب
            </p>
            <Table caption="قائمة الطلاب" className={query.isFetching ? 'opacity-70 transition-opacity' : ''}>
              <THead>
                <Tr>
                  <Th>الرقم الطلابي</Th>
                  <Th>اسم الطالب</Th>
                  <Th>الفصل</Th>
                  <Th>الحالة</Th>
                  {can('students.manage') && <Th className="hidden md:table-cell">هاتف ولي الأمر</Th>}
                </Tr>
              </THead>
              <TBody>
                {query.data.rows.map((s) => (
                  <Tr key={s.id} className="cursor-pointer hover:bg-surface-hover" onClick={() => navigate(`/students/${s.id}`)}>
                    <Td className="whitespace-nowrap text-fg-muted"><span className="ltr tabular">{s.student_number}</span></Td>
                    <Td>
                      <Link to={`/students/${s.id}`} className="font-semibold text-fg hover:text-link hover:underline" onClick={(e) => e.stopPropagation()}>
                        {s.full_name}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">
                      {s.class_name ? (
                        <span>
                          {s.class_name}
                          {s.enrollment_status !== 'active' && <span className="ms-1 text-xs text-fg-muted">(سابق)</span>}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">غير مسجل</span>
                      )}
                    </Td>
                    <Td>
                      <StudentStatusBadge status={s.status} />
                    </Td>
                    {can('students.manage') && <Td className="hidden whitespace-nowrap text-fg-muted md:table-cell"><span className="ltr tabular">{s.guardian_phone ?? '—'}</span></Td>}
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={filters.page} pageSize={PAGE_SIZE} total={query.data.total} onPageChange={(p) => update('page', String(p))} />
          </>
        )}
      </Card>

      <StudentFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => navigate(`/students/${id}`)} />
    </>
  );
}
