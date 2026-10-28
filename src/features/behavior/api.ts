import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { IncidentStatus, Severity } from '@/lib/domain/behavior';

export type IncidentFilters = {
  status: string | null;
  categoryId: string | null;
  classId: string | null;
  studentId: string | null;
  from: string | null;
  to: string | null;
  page: number;
};
export const INCIDENT_PAGE = 20;

export function useIncidents(f: IncidentFilters) {
  return useQuery({
    queryKey: ['incidents', 'list', f],
    queryFn: async () => {
      // Inner joins are only added when filtering through them.
      const studentJoin = f.classId
        ? 'filter_students:incident_students!inner(students!inner(enrollments!inner(class_id)))'
        : f.studentId
          ? 'filter_students:incident_students!inner(student_id)'
          : null;
      const select = [
        'id, incident_date, severity, status, created_at, behavior_categories(name)',
        'reporter:profiles!behavior_incidents_reported_by_fkey(full_name)',
        'incident_students(students(id, full_name))',
        studentJoin,
      ].filter(Boolean).join(', ');
      let q = supabase.from('behavior_incidents').select(select, { count: 'exact' })
        .order('incident_date', { ascending: false }).order('created_at', { ascending: false })
        .range((f.page - 1) * INCIDENT_PAGE, f.page * INCIDENT_PAGE - 1);
      if (f.status === 'open') q = q.in('status', ['submitted', 'under_review']);
      else if (f.status) q = q.eq('status', f.status);
      if (f.categoryId) q = q.eq('category_id', f.categoryId);
      if (f.from) q = q.gte('incident_date', f.from);
      if (f.to) q = q.lte('incident_date', f.to);
      if (f.classId) q = q.eq('filter_students.students.enrollments.class_id', f.classId);
      else if (f.studentId) q = q.eq('filter_students.student_id', f.studentId);
      const res = await q;
      type Row = {
        id: string; incident_date: string; severity: Severity; status: IncidentStatus; created_at: string;
        behavior_categories: { name: string } | null; reporter: { full_name: string } | null;
        incident_students: { students: { id: string; full_name: string } | null }[];
      };
      return { rows: unwrap(res) as unknown as Row[], total: res.count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

export function useIncident(id: string | undefined) {
  return useQuery({
    queryKey: ['incidents', 'detail', id],
    queryFn: async () => {
      const incident = unwrap(
        await supabase
          .from('behavior_incidents')
          .select('*, behavior_categories(name), reporter:profiles!behavior_incidents_reported_by_fkey(full_name), reviewer:profiles!behavior_incidents_reviewed_by_fkey(full_name), incident_students(students(id, full_name, student_number))')
          .eq('id', id!)
          .maybeSingle(),
      );
      if (!incident) return null;
      const actions = unwrap(
        await supabase.from('incident_actions').select('*, actor:profiles!incident_actions_actor_id_fkey(full_name)').eq('incident_id', id!).order('created_at'),
      );
      return { incident, actions };
    },
    enabled: Boolean(id),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['incidents'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['students'] });
  };
}

export function useSubmitIncident() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { category_id: string; incident_date: string; location: string; description: string; severity: Severity; student_ids: string[] }) =>
      unwrap(
        await supabase.rpc('submit_incident', {
          p_category_id: v.category_id,
          p_incident_date: v.incident_date,
          p_location: v.location,
          p_description: v.description,
          p_severity: v.severity,
          p_student_ids: v.student_ids,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useTransitionIncident(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { to: IncidentStatus; note: string }) =>
      unwrap(await supabase.rpc('transition_incident', { p_incident_id: id, p_to_status: v.to, p_note: v.note })),
    onSuccess: invalidate,
  });
}

export function useAddIncidentAction(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { type: 'note' | 'action_taken'; note: string }) =>
      unwrap(await supabase.rpc('add_incident_action', { p_incident_id: id, p_type: v.type, p_note: v.note })),
    onSuccess: invalidate,
  });
}

export function useEditIncident(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { description: string; location: string | null; severity: Severity }) => {
      const rows = unwrap(await supabase.from('behavior_incidents').update(v).eq('id', id).select('id'));
      if (!rows.length) throw { code: '42501' };
    },
    onSuccess: invalidate,
  });
}
