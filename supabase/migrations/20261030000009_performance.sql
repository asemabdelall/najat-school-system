-- =====================================================================
-- Performance (Supabase advisors): cover foreign keys with indexes and
-- give each table one permissive policy per role and action.
-- =====================================================================

create index if not exists absence_excuses_reviewed_by_idx on public.absence_excuses (reviewed_by);
create index if not exists absence_excuses_submitted_by_idx on public.absence_excuses (submitted_by);
create index if not exists attendance_corrections_corrected_by_idx on public.attendance_corrections (corrected_by);
create index if not exists attendance_corrections_record_idx on public.attendance_corrections (record_id);
create index if not exists attendance_records_enrollment_idx on public.attendance_records (enrollment_id);
create index if not exists attendance_records_recorded_by_idx on public.attendance_records (recorded_by);
create index if not exists attendance_sessions_reopened_by_idx on public.attendance_sessions (reopened_by);
create index if not exists attendance_sessions_taken_by_idx on public.attendance_sessions (taken_by);
create index if not exists behavior_incidents_reviewed_by_idx on public.behavior_incidents (reviewed_by);
create index if not exists enrollments_class_year_idx on public.enrollments (class_id, academic_year_id);
create index if not exists follow_up_notes_author_idx on public.follow_up_notes (author_id);
create index if not exists follow_up_tasks_created_by_idx on public.follow_up_tasks (created_by);
create index if not exists follow_up_tasks_incident_idx on public.follow_up_tasks (incident_id);
create index if not exists incident_actions_actor_idx on public.incident_actions (actor_id);
create index if not exists user_roles_granted_by_idx on public.user_roles (granted_by);

-- "for all" write policies also applied to SELECT, so SELECT evaluated two
-- policies. Split them into insert / update / delete.
drop policy academic_years_write on public.academic_years;
create policy academic_years_insert on public.academic_years for insert to authenticated
  with check (public.is_admin());
create policy academic_years_update on public.academic_years for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy academic_years_delete on public.academic_years for delete to authenticated
  using (public.is_admin());

drop policy categories_write on public.behavior_categories;
create policy categories_insert on public.behavior_categories for insert to authenticated
  with check (public.is_admin());
create policy categories_update on public.behavior_categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy categories_delete on public.behavior_categories for delete to authenticated
  using (public.is_admin());

-- One UPDATE policy on profiles: yourself, or an admin.
drop policy profiles_update_self on public.profiles;
drop policy profiles_update_admin on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());
