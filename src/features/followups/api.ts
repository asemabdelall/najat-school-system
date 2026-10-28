import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import { kuwaitToday } from '@/lib/format';
import type { TablesInsert, TablesUpdate } from '@/lib/database.types';

export type FollowUpFilters = { status: string; assignee: string | null; category: string | null; overdue: boolean; page: number };
export const FOLLOWUP_PAGE = 20;

const LIST_SELECT =
  'id, title, category, priority, status, due_date, created_at, student_id, students(full_name), assignee:profiles!follow_up_tasks_assigned_to_fkey(id, full_name), creator:profiles!follow_up_tasks_created_by_fkey(full_name)';

export function useFollowUps(f: FollowUpFilters) {
  return useQuery({
    queryKey: ['follow-ups', 'list', f],
    queryFn: async () => {
      let q = supabase.from('follow_up_tasks').select(LIST_SELECT, { count: 'exact' })
        .order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
        .range((f.page - 1) * FOLLOWUP_PAGE, f.page * FOLLOWUP_PAGE - 1);
      if (f.status === 'active') q = q.in('status', ['open', 'in_progress']);
      else if (f.status) q = q.eq('status', f.status);
      if (f.assignee) q = q.eq('assigned_to', f.assignee);
      if (f.category) q = q.eq('category', f.category);
      if (f.overdue) q = q.in('status', ['open', 'in_progress']).lt('due_date', kuwaitToday());
      const res = await q;
      return { rows: unwrap(res), total: res.count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

export function useFollowUp(id: string | undefined) {
  return useQuery({
    queryKey: ['follow-ups', 'detail', id],
    queryFn: async () => {
      const task = unwrap(
        await supabase
          .from('follow_up_tasks')
          .select('*, students(id, full_name, student_number), behavior_incidents(id, incident_date), assignee:profiles!follow_up_tasks_assigned_to_fkey(id, full_name), creator:profiles!follow_up_tasks_created_by_fkey(id, full_name)')
          .eq('id', id!)
          .maybeSingle(),
      );
      if (!task) return null;
      const notes = unwrap(
        await supabase.from('follow_up_notes').select('*, author:profiles!follow_up_notes_author_id_fkey(full_name)').eq('task_id', id!).order('created_at', { ascending: false }),
      );
      return { task, notes };
    },
    enabled: Boolean(id),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['follow-ups'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['students'] });
  };
}

export function useCreateFollowUp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: TablesInsert<'follow_up_tasks'>) => unwrap(await supabase.from('follow_up_tasks').insert(v).select('id').single()).id,
    onSuccess: invalidate,
  });
}

export function useUpdateFollowUp(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: TablesUpdate<'follow_up_tasks'>) => {
      const rows = unwrap(await supabase.from('follow_up_tasks').update(v).eq('id', id).select('id'));
      if (!rows.length) throw { code: '42501' };
    },
    onSuccess: invalidate,
  });
}

export function useAddFollowUpNote(taskId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { body: string; author_id: string }) => unwrap(await supabase.from('follow_up_notes').insert({ task_id: taskId, ...v }).select('id')),
    onSuccess: invalidate,
  });
}
