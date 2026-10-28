import * as React from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, BellOff, CalendarClock, CheckCheck, FileClock, Flag, ListChecks, RefreshCw, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/lib/supabase';
import { errorMessage, unwrap } from '@/lib/errors';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ElementType> = {
  follow_up_assigned: ListChecks, follow_up_due_soon: CalendarClock, incident_submitted: Flag, incident_reviewed: Flag,
  excuse_submitted: FileClock, excuse_reviewed: FileClock, attendance_reopened: RotateCcw, role_changed: ShieldCheck,
};

export function NotificationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = React.useState<'all' | 'unread'>('unread');
  const list = useQuery({
    queryKey: ['notifications', 'list', filter],
    queryFn: async () => {
      let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
      if (filter === 'unread') q = q.eq('is_read', false);
      return unwrap(await q);
    },
    refetchInterval: 60_000,
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['notifications'] });
  const mark = useMutation({
    mutationFn: async (v: { ids?: string[]; read: boolean }) => {
      let q = supabase.from('notifications').update({ is_read: v.read });
      q = v.ids ? q.in('id', v.ids) : q.eq('is_read', !v.read);
      unwrap(await q.select('id'));
    },
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => unwrap(await supabase.from('notifications').delete().eq('id', id).select('id')),
    onSuccess: invalidate,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const unread = (list.data ?? []).filter((n) => !n.is_read).length;

  return (
    <>
      <PageHeader
        title="الإشعارات"
        description="تُحدَّث تلقائيًا كل دقيقة. لا تتضمن الإشعارات تفاصيل حساسة؛ افتح السجل لعرضها حسب صلاحيتك."
        actions={
          <>
            <Button variant="secondary" onClick={() => list.refetch()} loading={list.isFetching && !list.isPending}><RefreshCw /> تحديث</Button>
            <Button variant="secondary" disabled={filter === 'unread' ? unread === 0 : false} loading={mark.isPending && !mark.variables?.ids} onClick={() => mark.mutate({ read: true })}><CheckCheck /> تعليم الكل كمقروء</Button>
          </>
        }
      />
      <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unread')} dir="rtl" className="mb-4">
        <TabsList>
          <TabsTrigger value="unread">غير المقروءة</TabsTrigger>
          <TabsTrigger value="all">الكل</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card>
        {list.isPending ? <LoadingState /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : list.data.length === 0 ? (
          <EmptyState icon={filter === 'unread' ? <BellOff /> : <Bell />} title={filter === 'unread' ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات'} />
        ) : (
          <ul className="divide-y divide-line" aria-label={`${formatNumber(list.data.length)} إشعار`}>
            {list.data.map((n) => {
              const Icon = ICONS[n.type] ?? Bell;
              return (
                <li key={n.id} className={cn('flex items-start gap-3 px-5 py-3.5', !n.is_read && 'bg-brand-soft/40')}>
                  <span className={cn('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full', n.is_read ? 'bg-surface-sunken text-fg-muted' : 'bg-brand text-white')}><Icon className="size-4" aria-hidden /></span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', !n.is_read && 'font-bold')}>
                      {!n.is_read && <span className="sr-only">غير مقروء: </span>}
                      {n.link ? (
                        <Link to={n.link} className="hover:text-link hover:underline" onClick={() => !n.is_read && mark.mutate({ ids: [n.id], read: true })}>{n.title}</Link>
                      ) : n.title}
                    </p>
                    {n.body && <p className="text-sm text-fg-muted">{n.body}</p>}
                    <p className="mt-0.5 text-xs text-fg-subtle" title={formatDateTime(n.created_at)}>{formatRelative(n.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => mark.mutate({ ids: [n.id], read: !n.is_read })}>{n.is_read ? 'تعليم كغير مقروء' : 'تعليم كمقروء'}</Button>
                    <Button variant="ghost" size="icon-sm" aria-label="حذف الإشعار" onClick={() => remove.mutate(n.id)}><Trash2 className="text-fg-muted" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
