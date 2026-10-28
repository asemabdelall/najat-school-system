import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import { sqlNull } from '@/lib/utils';
import type { AttendanceMark, AttendanceStatus } from '@/lib/domain/attendance';

export type MarkEntry = { status: AttendanceMark; minutes_late: number | null; note: string };

export function useSessionsForDate(date: string) {
  return useQuery({
    queryKey: ['attendance', 'sessions', date],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('attendance_sessions')
          .select('id, class_id, session_date, period, status, submitted_at, submitted_late, taken_by, attendance_records(count)')
          .eq('session_date', date),
      ),
  });
}

export function useRecentSessions(opts: { from: string; to: string; classId: string | null; status: string | null; page: number; pageSize: number }) {
  return useQuery({
    queryKey: ['attendance', 'recent', opts],
    queryFn: async () => {
      let q = supabase
        .from('attendance_sessions')
        .select('id, class_id, session_date, period, status, submitted_at, submitted_late, reopened_at, school_classes(name), taker:profiles!attendance_sessions_taken_by_fkey(full_name), attendance_records(count)', { count: 'exact' })
        .gte('session_date', opts.from)
        .lte('session_date', opts.to)
        .order('session_date', { ascending: false })
        .order('period')
        .range((opts.page - 1) * opts.pageSize, opts.page * opts.pageSize - 1);
      if (opts.classId) q = q.eq('class_id', opts.classId);
      if (opts.status) q = q.eq('status', opts.status);
      const res = await q;
      return { rows: unwrap(res), total: res.count ?? 0 };
    },
  });
}

export function useRoster(classId: string | null, date: string) {
  return useQuery({
    queryKey: ['attendance', 'roster', classId, date],
    queryFn: async () => unwrap(await supabase.rpc('class_roster', { p_class_id: classId!, p_date: date })),
    enabled: Boolean(classId),
  });
}

export function useSession(classId: string | null, date: string, period: number) {
  return useQuery({
    queryKey: ['attendance', 'session', classId, date, period],
    queryFn: async () => {
      const session = unwrap(
        await supabase
          .from('attendance_sessions')
          .select('*, taker:profiles!attendance_sessions_taken_by_fkey(full_name), reopener:profiles!attendance_sessions_reopened_by_fkey(full_name)')
          .eq('class_id', classId!)
          .eq('session_date', date)
          .eq('period', period)
          .maybeSingle(),
      );
      if (!session) return { session: null, records: [], corrections: [] };
      const [records, corrections] = await Promise.all([
        supabase.from('attendance_records').select('student_id, status, minutes_late, note').eq('session_id', session.id),
        supabase
          .from('attendance_corrections')
          .select('id, student_id, old_status, new_status, reason, source, corrected_at, students(full_name), corrector:profiles!attendance_corrections_corrected_by_fkey(full_name)')
          .eq('session_id', session.id)
          .order('corrected_at', { ascending: false }),
      ]);
      return { session, records: unwrap(records), corrections: unwrap(corrections) };
    },
    enabled: Boolean(classId),
  });
}

export function useSaveAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      classId: string;
      date: string;
      period: number;
      records: { student_id: string; status: AttendanceStatus | null; minutes_late: number | null; note: string | null }[];
      submit: boolean;
      reason?: string;
    }) =>
      unwrap(
        await supabase.rpc('save_attendance', {
          p_class_id: v.classId,
          p_date: v.date,
          p_period: v.period,
          p_records: v.records,
          p_submit: v.submit,
          p_reason: sqlNull(v.reason ?? null),
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['attendance'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['students'] });
    },
  });
}

export function useReopenSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { sessionId: string; reason: string }) =>
      unwrap(await supabase.rpc('reopen_attendance_session', { p_session_id: v.sessionId, p_reason: v.reason })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['attendance'] }),
  });
}
