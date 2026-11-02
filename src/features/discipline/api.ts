import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import { useYearScope } from '@/lib/queries';
import type { DisciplineStatus, DisciplineType } from '@/lib/domain/discipline';

export const DISCIPLINE_PAGE = 20;

export type DisciplineRow = {
  id: string;
  action_type: DisciplineType;
  status: DisciplineStatus;
  reason: string;
  meeting_at: string | null;
  suspension_from: string | null;
  suspension_to: string | null;
  signed_on: string | null;
  created_at: string;
  student_id: string;
  students: { full_name: string; student_number: string } | null;
};

const LIST_SELECT = 'id, action_type, status, reason, meeting_at, suspension_from, suspension_to, signed_on, created_at, student_id, students(full_name, student_number)';

export type DisciplineFilters = { type: DisciplineType | null; status: string | null; page: number };

export function useDisciplineList(f: DisciplineFilters) {
  const { yearId } = useYearScope();
  return useQuery({
    queryKey: ['discipline', 'list', yearId, f],
    enabled: Boolean(yearId),
    queryFn: async () => {
      let q = supabase
        .from('disciplinary_actions')
        .select(LIST_SELECT, { count: 'exact' })
        .eq('academic_year_id', yearId!)
        .order('created_at', { ascending: false })
        .range((f.page - 1) * DISCIPLINE_PAGE, f.page * DISCIPLINE_PAGE - 1);
      if (f.type) q = q.eq('action_type', f.type);
      if (f.status === 'open') q = q.in('status', ['scheduled', 'no_show', 'pending_signature']);
      else if (f.status) q = q.eq('status', f.status);
      const res = await q;
      return { rows: unwrap(res) as unknown as DisciplineRow[], total: res.count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });
}

export type DisciplineOverview = {
  summons_upcoming: number;
  summons_overdue: number;
  summons_total: number;
  suspensions_active: number;
  suspensions_total: number;
  pledges_pending: number;
  pledges_signed: number;
  students: number;
};

export function useDisciplineOverview() {
  return useQuery({
    queryKey: ['discipline', 'overview'],
    queryFn: async () => unwrap(await supabase.rpc('discipline_overview')) as unknown as DisciplineOverview,
  });
}

export function useDiscipline(id: string | undefined) {
  return useQuery({
    queryKey: ['discipline', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const row = unwrap(
        await supabase
          .from('disciplinary_actions')
          .select(
            '*, students(id, full_name, student_number, guardian_name, guardian_phone), academic_years(name, status), behavior_incidents(id, incident_date, behavior_categories(name)), issuer:profiles!disciplinary_actions_issued_by_fkey(full_name), updater:profiles!disciplinary_actions_updated_by_fkey(full_name)',
          )
          .eq('id', id!)
          .maybeSingle(),
      );
      if (!row) return null;
      // The student's class in the action's year (for the printed documents).
      const enr = unwrap(
        await supabase
          .from('enrollments')
          .select('status, school_classes(name, grade_level)')
          .eq('student_id', row.student_id)
          .eq('academic_year_id', row.academic_year_id)
          .order('enrolled_on', { ascending: false })
          .limit(1),
      );
      return { ...row, class_name: enr[0]?.school_classes?.name ?? null };
    },
  });
}

export function useStudentDiscipline(studentId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['discipline', 'student', studentId],
    enabled: Boolean(studentId) && enabled,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('disciplinary_actions')
          .select('id, action_type, status, reason, meeting_at, suspension_from, suspension_to, signed_on, created_at, academic_years(name)')
          .eq('student_id', studentId!)
          .order('created_at', { ascending: false }),
      ),
  });
}

export type NewDiscipline = {
  student_id: string;
  action_type: DisciplineType;
  status: DisciplineStatus;
  reason: string;
  incident_id: string | null;
  meeting_at?: string | null;
  meeting_with?: string | null;
  suspension_from?: string | null;
  suspension_to?: string | null;
  decision_number?: string | null;
  pledge_text?: string | null;
  signed_on?: string | null;
};

export function useCreateDiscipline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: NewDiscipline) => unwrap(await supabase.from('disciplinary_actions').insert(v).select('id').single()).id,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['discipline'] }),
  });
}

export type DisciplinePatch = Partial<{
  status: DisciplineStatus;
  meeting_at: string;
  attendee_name: string | null;
  outcome_notes: string | null;
  cancel_reason: string;
  signed_on: string;
}>;

export function useUpdateDiscipline(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: DisciplinePatch) => {
      const rows = unwrap(await supabase.from('disciplinary_actions').update(patch).eq('id', id).select('id'));
      if (!rows.length) throw { code: '42501' };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['discipline'] }),
  });
}

/** <input type="datetime-local"> value (Kuwait wall-clock) → ISO timestamp. Kuwait has no DST (UTC+3). */
export function kuwaitLocalToIso(local: string): string {
  return new Date(`${local}:00+03:00`).toISOString();
}

/** ISO timestamp → <input type="datetime-local"> value in Kuwait time. */
export function isoToKuwaitLocal(iso: string): string {
  return new Date(Date.parse(iso) + 3 * 3_600_000).toISOString().slice(0, 16);
}
