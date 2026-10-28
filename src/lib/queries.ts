/** Shared lookup queries used across features. */
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import { unwrap } from './errors';
import type { Role } from './domain/permissions';
import type { Tables } from './database.types';

export type SchoolSettings = Tables<'school_settings'>;
export type AcademicYear = Tables<'academic_years'>;
export type SchoolClass = Tables<'school_classes'>;

export const qk = {
  settings: ['settings'] as const,
  years: ['academic-years'] as const,
  classes: (yearId?: string | null) => ['classes', yearId ?? 'all'] as const,
  staff: ['staff'] as const,
  categories: ['behavior-categories'] as const,
};

export function useSchoolSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: async () => unwrap(await supabase.from('school_settings').select('*').eq('id', 1).single()),
    staleTime: 5 * 60_000,
  });
}

export function useAcademicYears() {
  return useQuery({
    queryKey: qk.years,
    queryFn: async () => unwrap(await supabase.from('academic_years').select('*').order('starts_on', { ascending: false })),
    staleTime: 5 * 60_000,
  });
}

export function useCurrentYear() {
  const years = useAcademicYears();
  return { ...years, data: years.data?.find((y) => y.is_current) ?? null };
}

/** Classes visible to the user (RLS: managers all, teachers assigned). */
export function useClasses(yearId?: string | null, opts: { includeArchived?: boolean } = {}) {
  return useQuery({
    queryKey: [...qk.classes(yearId), opts.includeArchived ? 'with-archived' : 'active'],
    queryFn: async () => {
      let q = supabase.from('school_classes').select('*').order('grade_level').order('section');
      if (yearId) q = q.eq('academic_year_id', yearId);
      if (!opts.includeArchived) q = q.eq('is_archived', false);
      return unwrap(await q);
    },
    enabled: yearId !== undefined,
  });
}

export type StaffMember = { id: string; full_name: string; email: string | null; is_active: boolean; roles: Role[] };

/** Active staff with their roles (for assignment pickers). */
export function useStaff() {
  return useQuery({
    queryKey: qk.staff,
    queryFn: async (): Promise<StaffMember[]> => {
      const [profiles, roles] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, is_active').order('full_name'),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      const p = unwrap(profiles);
      const r = unwrap(roles);
      return p.map((x) => ({ ...x, roles: r.filter((y) => y.user_id === x.id).map((y) => y.role as Role) }));
    },
    staleTime: 60_000,
  });
}

export function useBehaviorCategories(includeInactive = false) {
  return useQuery({
    queryKey: [...qk.categories, includeInactive],
    queryFn: async () => {
      let q = supabase.from('behavior_categories').select('*').order('sort_order').order('name');
      if (!includeInactive) q = q.eq('is_active', true);
      return unwrap(await q);
    },
    staleTime: 5 * 60_000,
  });
}
