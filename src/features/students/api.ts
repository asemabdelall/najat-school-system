import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import { sqlNull } from '@/lib/utils';

export const STUDENT_STATUS_LABELS: Record<string, string> = {
  active: 'منتظم',
  transferred: 'منقول من المدرسة',
  graduated: 'متخرج',
  archived: 'مؤرشف',
};

export type StudentFilters = {
  search: string;
  yearId: string | null;
  classId: string | null;
  grade: number | null;
  status: string | null;
  page: number;
};

export const PAGE_SIZE = 25;

export function useStudentSearch(f: StudentFilters) {
  return useQuery({
    queryKey: ['students', 'search', f],
    queryFn: async () => {
      const rows = unwrap(
        await supabase.rpc('search_students', {
          p_search: sqlNull(f.search.trim() || null),
          p_year_id: sqlNull(f.yearId),
          p_class_id: sqlNull(f.classId),
          p_grade: sqlNull(f.grade),
          p_status: sqlNull(f.status),
          p_limit: PAGE_SIZE,
          p_offset: (f.page - 1) * PAGE_SIZE,
        }),
      );
      return { rows, total: Number(rows[0]?.total_count ?? 0) };
    },
    placeholderData: keepPreviousData,
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ['students', id],
    queryFn: async () => unwrap(await supabase.from('students').select('*').eq('id', id!).maybeSingle()),
    enabled: Boolean(id),
  });
}

export function useStudentEnrollments(id: string | undefined) {
  return useQuery({
    queryKey: ['students', id, 'enrollments'],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('enrollments')
          .select('id, status, enrolled_on, ended_on, class_id, academic_year_id, school_classes(name, grade_level, academic_years(name, is_current))')
          .eq('student_id', id!)
          .order('enrolled_on', { ascending: false }),
      ),
    enabled: Boolean(id),
  });
}

export type StudentInput = {
  student_number: string;
  full_name: string;
  date_of_birth: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  notes: string | null;
};

export function useInvalidateStudents() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['students'] });
}

export function useCreateStudent() {
  const invalidate = useInvalidateStudents();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: StudentInput & { class_id: string | null }) =>
      unwrap(
        await supabase.rpc('create_student', {
          p_student_number: v.student_number,
          p_full_name: v.full_name,
          p_date_of_birth: sqlNull(v.date_of_birth),
          p_guardian_name: sqlNull(v.guardian_name),
          p_guardian_phone: sqlNull(v.guardian_phone),
          p_notes: sqlNull(v.notes),
          p_class_id: sqlNull(v.class_id),
        }),
      ),
    onSuccess: () => {
      void invalidate();
      void qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}

export function useUpdateStudent(id: string) {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: async (v: StudentInput) => {
      const res = await supabase.from('students').update(v).eq('id', id).select('id');
      const rows = unwrap(res);
      if (!rows.length) throw { code: '42501' };
    },
    onSuccess: () => void invalidate(),
  });
}

export function useSetStudentStatus(id: string) {
  const invalidate = useInvalidateStudents();
  return useMutation({
    mutationFn: async (v: { status: string; reason: string }) =>
      unwrap(await supabase.rpc('set_student_status', { p_student_id: id, p_status: v.status, p_reason: v.reason })),
    onSuccess: () => void invalidate(),
  });
}

export function useEnrollStudent(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { class_id: string; date: string }) =>
      unwrap(await supabase.rpc('enroll_student', { p_student_id: studentId, p_class_id: v.class_id, p_date: v.date })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['students'] });
      void qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });
}
