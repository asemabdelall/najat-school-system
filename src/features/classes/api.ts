import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import type { TablesInsert } from '@/lib/database.types';

export const TRACK_LABELS: Record<string, string> = { general: 'عام', science: 'علمي', literary: 'أدبي' };

/** Active-enrollment counts per class (RLS-scoped). */
export function useEnrollmentCounts(yearId: string | undefined) {
  return useQuery({
    queryKey: ['classes', yearId, 'enrollment-counts'],
    queryFn: async () => {
      const rows = unwrap(await supabase.from('enrollments').select('class_id').eq('academic_year_id', yearId!).eq('status', 'active'));
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.class_id, (counts.get(r.class_id) ?? 0) + 1);
      return counts;
    },
    enabled: Boolean(yearId),
  });
}

export function useAssignments(classId?: string) {
  return useQuery({
    queryKey: ['classes', 'assignments', classId ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('teacher_class_assignments')
        .select('id, class_id, subject, is_homeroom, teacher_id, profiles!teacher_class_assignments_teacher_id_fkey(full_name, is_active)')
        .order('is_homeroom', { ascending: false });
      if (classId) q = q.eq('class_id', classId);
      return unwrap(await q);
    },
  });
}

export function useSaveClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...v }: TablesInsert<'school_classes'> & { id?: string }) => {
      const res = id ? await supabase.from('school_classes').update(v).eq('id', id).select('id').single() : await supabase.from('school_classes').insert(v).select('id').single();
      return unwrap(res).id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['classes'] }),
  });
}

export function useAssignTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { teacher_id: string; class_id: string; subject: string; is_homeroom: boolean }) => {
      if (v.is_homeroom) {
        // Only one homeroom per class (also enforced by a unique index).
        unwrap(await supabase.from('teacher_class_assignments').update({ is_homeroom: false }).eq('class_id', v.class_id).eq('is_homeroom', true).select('id'));
      }
      unwrap(await supabase.from('teacher_class_assignments').insert(v).select('id'));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['classes'] }),
  });
}

export function useUnassignTeacher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const rows = unwrap(await supabase.from('teacher_class_assignments').delete().eq('id', id).select('id'));
      if (!rows.length) throw { code: '42501' };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['classes'] }),
  });
}
