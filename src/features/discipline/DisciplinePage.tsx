import * as React from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarClock, ChevronLeft, FileSignature, Gavel, Plus, UserX, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { StatCard } from '@/components/ui/stat-card';
import { Stagger } from '@/components/motion/Stagger';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDate, formatDateTime, formatNumber, kuwaitToday } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  DISCIPLINE_STATUS_LABELS, DISCIPLINE_STATUS_TONE, DISCIPLINE_TYPE_LABELS, DISCIPLINE_TYPES, SUSPENSION_PHASE_LABELS,
  schoolDaysBetween, suspensionPhase, type DisciplineType,
} from '@/lib/domain/discipline';
import { DISCIPLINE_PAGE, useDisciplineList, useDisciplineOverview, type DisciplineRow } from './api';

export const TYPE_ICON: Record<DisciplineType, React.ElementType> = {
  guardian_summons: CalendarClock,
  suspension: UserX,
  pledge: FileSignature,
};

/** One-line summary of the type-specific details. */
export function DisciplineSummary({ row }: { row: Pick<DisciplineRow, 'action_type' | 'status' | 'meeting_at' | 'suspension_from' | 'suspension_to' | 'signed_on'> }) {
  const today = kuwaitToday();
  if (row.action_type === 'guardian_summons' && row.meeting_at) {
    const overdue = row.status === 'scheduled' && Date.parse(row.meeting_at) < Date.now();
    return <span className={cn('tabular', overdue && 'font-semibold text-warning')}>{formatDateTime(row.meeting_at)}{overdue && ' · فات الموعد'}</span>;
  }
  if (row.action_type === 'suspension' && row.suspension_from && row.suspension_to) {
    const phase = suspensionPhase(row.suspension_from, row.suspension_to, today);
    return (
      <span className="tabular">
        {formatDate(row.suspension_from)} – {formatDate(row.suspension_to)} · {formatNumber(schoolDaysBetween(row.suspension_from, row.suspension_to))} يوم
        {row.status === 'issued' && <Badge tone={phase === 'active' ? 'danger' : 'outline'} className="ms-2">{SUSPENSION_PHASE_LABELS[phase]}</Badge>}
      </span>
    );
  }
  if (row.action_type === 'pledge') return <span>{row.signed_on ? `وُقّع في ${formatDate(row.signed_on)}` : '—'}</span>;
  return <span>—</span>;
}

export function NewDisciplineMenu({ studentId, incidentId, size = 'md' }: { studentId?: string; incidentId?: string; size?: 'sm' | 'md' }) {
  const qs = (t: DisciplineType) => {
    const p = new URLSearchParams({ type: t });
    if (studentId) p.set('student', studentId);
    if (incidentId) p.set('incident', incidentId);
    return `/discipline/new?${p}`;
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size}><Plus /> إجراء جديد</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        {DISCIPLINE_TYPES.map((t) => {
          const Icon = TYPE_ICON[t];
          return (
            <DropdownMenuItem key={t} asChild>
              <Link to={qs(t)}><Icon /> {DISCIPLINE_TYPE_LABELS[t]}</Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DisciplinePage() {
  const [params, setParams] = useSearchParams();
  const type = (params.get('type') as DisciplineType | null) ?? null;
  const status = params.get('status');
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const update = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    if (k === 'type') next.delete('status');
    setParams(next, { replace: true });
  };

  const overview = useDisciplineOverview();
  const list = useDisciplineList({ type, status, page });
  const o = overview.data;

  const statusOptions = type
    ? Object.entries(DISCIPLINE_STATUS_LABELS).filter(([k]) =>
        type === 'guardian_summons' ? ['scheduled', 'attended', 'no_show', 'cancelled'].includes(k)
        : type === 'suspension' ? ['issued', 'cancelled'].includes(k)
        : ['pending_signature', 'signed', 'cancelled'].includes(k))
    : [];

  return (
    <>
      <PageHeader title="الجزاءات" description="استدعاء أولياء الأمور، وقرارات الفصل المؤقت، والتعهدات للعام الحالي" actions={<NewDisciplineMenu />} />

      <Stagger className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="استدعاءات قادمة" value={formatNumber(o?.summons_upcoming)} hint={o?.summons_overdue ? `${formatNumber(o.summons_overdue)} فات موعدها دون تسجيل` : `${formatNumber(o?.summons_total)} استدعاء هذا العام`} icon={<CalendarClock />} tone="info" loading={overview.isPending} to="/discipline?type=guardian_summons&status=scheduled" />
        <StatCard label="مفصولون حاليًا" value={formatNumber(o?.suspensions_active)} hint={`${formatNumber(o?.suspensions_total)} قرار فصل هذا العام`} icon={<UserX />} tone="danger" loading={overview.isPending} to="/discipline?type=suspension" />
        <StatCard label="تعهدات بانتظار التوقيع" value={formatNumber(o?.pledges_pending)} hint={`${formatNumber(o?.pledges_signed)} تعهد موقّع`} icon={<FileSignature />} tone="warning" loading={overview.isPending} to="/discipline?type=pledge&status=pending_signature" />
        <StatCard label="طلاب عليهم إجراءات" value={formatNumber(o?.students)} icon={<Users />} loading={overview.isPending} />
      </Stagger>

      <Card>
        <div className="no-print flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div role="tablist" aria-label="نوع الإجراء" className="flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-1">
            {([null, ...DISCIPLINE_TYPES] as (DisciplineType | null)[]).map((t) => {
              const Icon = t ? TYPE_ICON[t] : Gavel;
              const on = type === t;
              return (
                <button
                  key={t ?? 'all'}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => update('type', t)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors',
                    on ? 'bg-surface text-fg-strong shadow-xs' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <Icon className="size-4" aria-hidden /> {t ? DISCIPLINE_TYPE_LABELS[t] : 'الكل'}
                </button>
              );
            })}
          </div>
          <div className="ms-auto w-48">
            <label htmlFor="disc-status" className="sr-only">الحالة</label>
            <Select id="disc-status" value={status ?? ''} onChange={(e) => update('status', e.target.value || null)}>
              <option value="">كل الحالات</option>
              <option value="open">تحتاج إجراء</option>
              {statusOptions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </div>
        </div>

        {list.isPending ? <LoadingState rows={6} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : list.data.rows.length === 0 ? (
          <EmptyState icon={<Gavel />} title={type || status ? 'لا توجد إجراءات مطابقة' : 'لا توجد جزاءات مسجلة هذا العام'} description="ابدأ من «إجراء جديد»، أو من ملف الطالب، أو من بلاغ سلوكي." />
        ) : (
          <div className={list.isFetching ? 'opacity-70 transition-opacity' : undefined}>
            <ul className="divide-y divide-line sm:hidden" aria-label="الجزاءات">
              {list.data.rows.map((r) => {
                const Icon = TYPE_ICON[r.action_type];
                return (
                  <li key={r.id}>
                    <Link to={`/discipline/${r.id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-hover">
                      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-md bg-brand-soft text-brand dark:text-link"><Icon className="size-[18px]" aria-hidden /></span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-semibold leading-snug">{r.students?.full_name}</span>
                          <Badge tone={DISCIPLINE_STATUS_TONE[r.status]} className="shrink-0">{DISCIPLINE_STATUS_LABELS[r.status]}</Badge>
                        </span>
                        <span className="block text-xs text-fg-muted">{DISCIPLINE_TYPE_LABELS[r.action_type]} · <DisciplineSummary row={r} /></span>
                      </span>
                      <ChevronLeft className="mt-2 size-4 shrink-0 text-fg-subtle" aria-hidden />
                    </Link>
                  </li>
                );
              })}
            </ul>
            <div className="hidden sm:block">
              <Table caption="قائمة الجزاءات">
                <THead><Tr><Th>الطالب</Th><Th>الإجراء</Th><Th>التفاصيل</Th><Th>الحالة</Th><Th>أُنشئ</Th></Tr></THead>
                <TBody>
                  {list.data.rows.map((r) => {
                    const Icon = TYPE_ICON[r.action_type];
                    return (
                      <Tr key={r.id} className="hover:bg-surface-hover">
                        <Td className="min-w-48">
                          <Link to={`/discipline/${r.id}`} className="font-semibold hover:text-link hover:underline">{r.students?.full_name}</Link>
                          <p className="line-clamp-1 text-xs text-fg-muted">{r.reason}</p>
                        </Td>
                        <Td className="whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Icon className="size-4 text-brand dark:text-link" aria-hidden />{DISCIPLINE_TYPE_LABELS[r.action_type]}</span></Td>
                        <Td className="whitespace-nowrap text-sm"><DisciplineSummary row={r} /></Td>
                        <Td><Badge tone={DISCIPLINE_STATUS_TONE[r.status]}>{DISCIPLINE_STATUS_LABELS[r.status]}</Badge></Td>
                        <Td className="whitespace-nowrap text-fg-muted">{formatDate(r.created_at.slice(0, 10))}</Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </div>
            <Pagination page={page} pageSize={DISCIPLINE_PAGE} total={list.data.total} onPageChange={(p) => update('page', String(p))} />
          </div>
        )}
      </Card>
    </>
  );
}
