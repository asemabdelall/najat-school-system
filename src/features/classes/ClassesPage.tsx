import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { DoorOpen, Plus, School, UserRound, Users } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { useAcademicYears, useClasses } from '@/lib/queries';
import { formatNumber } from '@/lib/format';
import { TRACK_LABELS, useAssignments, useEnrollmentCounts } from './api';
import { ClassFormDialog } from './ClassFormDialog';

export function ClassesPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const years = useAcademicYears();
  const yearId = params.get('year') ?? years.data?.find((y) => y.is_current)?.id;
  const year = years.data?.find((y) => y.id === yearId);
  const classes = useClasses(yearId, { includeArchived: true });
  const counts = useEnrollmentCounts(yearId);
  const assignments = useAssignments();
  const [createOpen, setCreateOpen] = React.useState(false);

  const grouped = React.useMemo(() => {
    const g = new Map<number, NonNullable<typeof classes.data>>();
    for (const c of classes.data ?? []) g.set(c.grade_level, [...(g.get(c.grade_level) ?? []), c]);
    return [...g.entries()].sort(([a], [b]) => a - b);
  }, [classes.data]);

  return (
    <>
      <PageHeader
        title="الصفوف والفصول"
        description={can('classes.manage') ? 'الفصول الدراسية وأعداد الطلاب والمعلمون المسندون' : 'الفصول المسندة إليك'}
        actions={
          <>
            <label htmlFor="year-filter" className="sr-only">العام الدراسي</label>
            <Select id="year-filter" className="w-36" value={yearId ?? ''} onChange={(e) => setParams({ year: e.target.value })}>
              {years.data?.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
            {can('classes.manage') && year?.status !== 'closed' && (
              <Button onClick={() => setCreateOpen(true)}><Plus /> إضافة فصل</Button>
            )}
          </>
        }
      />

      {classes.isPending || years.isPending ? (
        <LoadingState rows={6} />
      ) : classes.isError ? (
        <ErrorState error={classes.error} onRetry={() => classes.refetch()} />
      ) : grouped.length === 0 ? (
        <EmptyState icon={<School />} title="لا توجد فصول" description={can('classes.manage') ? 'أضف فصول هذا العام الدراسي للبدء.' : 'لم يتم إسناد أي فصل إليك بعد. تواصل مع شؤون الطلبة.'} />
      ) : (
        <div className="space-y-6">
          {grouped.map(([grade, list]) => (
            <section key={grade} aria-labelledby={`grade-${grade}`}>
              <h2 id={`grade-${grade}`} className="mb-2.5 flex items-center gap-2 text-sm font-bold text-fg-muted">
                <span className="h-4 w-1 rounded-full bg-leaf" aria-hidden /> الصف {formatNumber(grade)}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((c) => {
                  const enrolled = counts.data?.get(c.id) ?? 0;
                  const homeroom = assignments.data?.find((a) => a.class_id === c.id && a.is_homeroom);
                  const teachers = new Set(assignments.data?.filter((a) => a.class_id === c.id).map((a) => a.teacher_id)).size;
                  const fill = c.capacity ? Math.min(100, Math.round((enrolled / c.capacity) * 100)) : null;
                  return (
                    <li key={c.id}>
                      <Link to={`/classes/${c.id}`} className="group block rounded-lg border border-line bg-surface p-4 shadow-sm transition-shadow hover:border-line-strong hover:shadow-md">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-lg font-bold text-fg-strong group-hover:text-brand dark:group-hover:text-link">فصل {c.name}</p>
                            <p className="text-xs text-fg-muted">
                              {c.track ? TRACK_LABELS[c.track] : ''} {c.room && `· ${c.room}`}
                            </p>
                          </div>
                          {c.is_archived ? <Badge tone="neutral">مؤرشف</Badge> : <Badge tone="brand"><Users aria-hidden /> {formatNumber(enrolled)} طالب</Badge>}
                        </div>
                        {fill !== null && (
                          <div className="mt-3" aria-label={`الإشغال ${fill}%`}>
                            <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                              <div className="h-full rounded-full [background:var(--brand-gradient)]" style={{ width: `${fill}%` }} />
                            </div>
                            <p className="tabular mt-1 text-2xs text-fg-subtle">{formatNumber(enrolled)} من {formatNumber(c.capacity)} مقعدًا</p>
                          </div>
                        )}
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-fg-muted">
                          <span className="flex items-center gap-1"><UserRound className="size-3.5" aria-hidden /> رائد الفصل: {homeroom?.profiles?.full_name ?? 'غير محدد'}</span>
                          <span className="flex items-center gap-1"><DoorOpen className="size-3.5" aria-hidden /> {formatNumber(teachers)} معلمين</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {years.data && <ClassFormDialog open={createOpen} onOpenChange={setCreateOpen} years={years.data} defaultYearId={yearId} />}
    </>
  );
}
