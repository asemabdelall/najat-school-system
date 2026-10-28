-- =====================================================================
-- Authorization helpers, protective triggers and Row Level Security.
-- Roles are read ONLY from public.user_roles (never from JWT/user
-- metadata, which a user can edit). Deactivated profiles have no role.
-- =====================================================================

create or replace function public.is_active_staff()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    join public.user_roles r on r.user_id = p.id
    where p.id = (select auth.uid()) and p.is_active
  );
$$;

create or replace function public.has_role(_role text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = (select auth.uid()) and r.role = _role and p.is_active
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.has_role('admin'); $$;

-- admin or student_affairs: school-wide oversight of student records.
create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = ''
as $$ select public.has_role('admin') or public.has_role('student_affairs'); $$;

create or replace function public.teaches_class(_class_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.has_role('teacher') and exists (
    select 1 from public.teacher_class_assignments a
    where a.teacher_id = (select auth.uid()) and a.class_id = _class_id
  );
$$;

-- A teacher "has" a student when the student is (or was) enrolled in one
-- of the teacher's assigned classes.
create or replace function public.teaches_student(_student_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.has_role('teacher') and exists (
    select 1 from public.enrollments e
    join public.teacher_class_assignments a on a.class_id = e.class_id
    where e.student_id = _student_id and a.teacher_id = (select auth.uid())
  );
$$;

create or replace function public.can_view_student(_student_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select public.is_manager() or public.teaches_student(_student_id); $$;

-- Current user's roles, for the client to drive UI (never trusted server-side).
create or replace function public.my_roles()
returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.role order by r.role), '{}')
  from public.user_roles r join public.profiles p on p.id = r.user_id
  where r.user_id = (select auth.uid()) and p.is_active;
$$;

-- True when a privileged SECURITY DEFINER workflow function set the flag
-- for the current transaction, or when running as service_role (seeding).
create or replace function public.in_trusted_context()
returns boolean language sql stable set search_path = ''
as $$
  select coalesce(current_setting('app.trusted', true), '') = 'on'
      or current_user in ('postgres', 'service_role', 'supabase_admin');
$$;

-- ---------------------------------------------------------------------
-- New auth user -> profile. Roles are NEVER derived from metadata.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Guard triggers
-- ---------------------------------------------------------------------

-- Non-admins may only change their own display name and phone.
create or replace function public.guard_profile_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.in_trusted_context() or public.is_admin() then
    if new.id = (select auth.uid()) and new.is_active is distinct from old.is_active then
      raise exception 'لا يمكنك تعطيل حسابك بنفسك' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.id <> old.id or new.email is distinct from old.email or new.is_active is distinct from old.is_active then
    raise exception 'غير مسموح بتعديل هذه الحقول' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Role changes: admins cannot remove their own admin role and the school
-- can never be left without an active admin.
create or replace function public.guard_user_roles()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin' and old.user_id = (select auth.uid()) and not public.in_trusted_context() then
      raise exception 'لا يمكنك إزالة صلاحية المدير عن حسابك' using errcode = '42501';
    end if;
    if old.role = 'admin' and not exists (
      select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
      where r.role = 'admin' and p.is_active and r.user_id <> old.user_id
    ) then
      raise exception 'يجب أن يبقى مدير نشط واحد على الأقل' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.granted_by := coalesce((select auth.uid()), new.granted_by);
  end if;
  return new;
end;
$$;
create trigger user_roles_guard before insert or delete on public.user_roles
  for each row execute function public.guard_user_roles();

create or replace function public.guard_teacher_assignment()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.user_roles where user_id = new.teacher_id and role = 'teacher') then
    raise exception 'المستخدم المحدد ليس معلمًا' using errcode = '23514';
  end if;
  if exists (select 1 from public.school_classes c where c.id = new.class_id and c.is_archived) then
    raise exception 'لا يمكن الإسناد إلى فصل مؤرشف' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger tca_guard before insert or update on public.teacher_class_assignments
  for each row execute function public.guard_teacher_assignment();

-- Only one current academic year; setting a new current one clears others.
create or replace function public.academic_year_single_current()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.is_current then
    update public.academic_years set is_current = false where id <> new.id and is_current;
  end if;
  return new;
end;
$$;
create trigger academic_years_single_current before insert or update of is_current on public.academic_years
  for each row when (new.is_current) execute function public.academic_year_single_current();

-- Incidents: status/review columns change only through workflow functions;
-- the reporter may edit content only while still "submitted".
create or replace function public.guard_incident_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.in_trusted_context() then return new; end if;
  if new.status is distinct from old.status
     or new.reported_by is distinct from old.reported_by
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.decision_note is distinct from old.decision_note
     or new.resolved_at is distinct from old.resolved_at
     or new.created_at is distinct from old.created_at then
    raise exception 'تغيير حالة البلاغ يتم عبر إجراءات المراجعة فقط' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger behavior_incidents_guard before update on public.behavior_incidents
  for each row execute function public.guard_incident_update();

-- Follow-ups: assignees who are not managers/creators may only move the
-- task through its status and record the outcome.
create or replace function public.guard_follow_up_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  if new.assigned_to is distinct from old.assigned_to then
    new.due_soon_notified_at := null;
  end if;
  if public.in_trusted_context() or public.is_manager() then return new; end if;
  if new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'غير مسموح' using errcode = '42501';
  end if;
  if old.created_by = (select auth.uid()) and new.assigned_to = (select auth.uid()) then
    return new; -- a teacher's own self-assigned task
  end if;
  if new.title is distinct from old.title or new.description is distinct from old.description
     or new.category is distinct from old.category or new.priority is distinct from old.priority
     or new.assigned_to is distinct from old.assigned_to or new.due_date is distinct from old.due_date
     or new.student_id is distinct from old.student_id or new.incident_id is distinct from old.incident_id then
    raise exception 'يمكنك تحديث الحالة والنتيجة فقط' using errcode = '42501';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    raise exception 'إلغاء المهمة متاح لمنشئها أو لشؤون الطلبة فقط' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger follow_up_tasks_guard before update on public.follow_up_tasks
  for each row execute function public.guard_follow_up_update();

create or replace function public.guard_follow_up_insert()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not public.in_trusted_context() then
    new.created_by := (select auth.uid());
  end if;
  new.completed_at := case when new.status = 'completed' then now() end;
  if not exists (select 1 from public.profiles p where p.id = new.assigned_to and p.is_active) then
    raise exception 'لا يمكن إسناد المهمة إلى حساب غير نشط' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger follow_up_tasks_guard_insert before insert on public.follow_up_tasks
  for each row execute function public.guard_follow_up_insert();

-- Notifications: recipients may only mark read / unread.
create or replace function public.guard_notification_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.in_trusted_context() then return new; end if;
  if new.recipient_id <> old.recipient_id or new.type <> old.type or new.title <> old.title
     or new.body is distinct from old.body or new.link is distinct from old.link
     or new.created_at <> old.created_at then
    raise exception 'غير مسموح' using errcode = '42501';
  end if;
  new.read_at := case when new.is_read then coalesce(old.read_at, now()) end;
  return new;
end;
$$;
create trigger notifications_guard before update on public.notifications
  for each row execute function public.guard_notification_update();

-- Audit log is append-only for everyone, including service_role.
create or replace function public.audit_logs_immutable()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'سجل التدقيق غير قابل للتعديل أو الحذف' using errcode = '42501';
end;
$$;
create trigger audit_logs_no_update before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function public.audit_logs_immutable();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.school_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.academic_years enable row level security;
alter table public.school_classes enable row level security;
alter table public.students enable row level security;
alter table public.enrollments enable row level security;
alter table public.teacher_class_assignments enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.absence_excuses enable row level security;
alter table public.behavior_categories enable row level security;
alter table public.behavior_incidents enable row level security;
alter table public.incident_students enable row level security;
alter table public.incident_actions enable row level security;
alter table public.follow_up_tasks enable row level security;
alter table public.follow_up_notes enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- Nothing is readable by anonymous visitors.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on all functions in schema public to authenticated;

-- school_settings
create policy settings_select on public.school_settings for select to authenticated
  using (public.is_active_staff());
create policy settings_update on public.school_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles: colleagues' names are visible to active staff (needed for
-- assignment pickers); only admins change other people's records.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_active_staff());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- user_roles
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_active_staff());
create policy user_roles_insert on public.user_roles for insert to authenticated
  with check (public.is_admin());
create policy user_roles_delete on public.user_roles for delete to authenticated
  using (public.is_admin());

-- academic_years
create policy academic_years_select on public.academic_years for select to authenticated
  using (public.is_active_staff());
create policy academic_years_write on public.academic_years for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- school_classes
create policy classes_select on public.school_classes for select to authenticated
  using (public.is_manager() or public.teaches_class(id));
create policy classes_insert on public.school_classes for insert to authenticated
  with check (public.is_manager());
create policy classes_update on public.school_classes for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- students
create policy students_select on public.students for select to authenticated
  using (public.can_view_student(id));
create policy students_insert on public.students for insert to authenticated
  with check (public.is_manager());
create policy students_update on public.students for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- enrollments (writes through enroll/transfer functions or by managers)
create policy enrollments_select on public.enrollments for select to authenticated
  using (public.is_manager() or public.teaches_class(class_id));
create policy enrollments_insert on public.enrollments for insert to authenticated
  with check (public.is_manager());
create policy enrollments_update on public.enrollments for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- teacher_class_assignments
create policy tca_select on public.teacher_class_assignments for select to authenticated
  using (public.is_manager() or teacher_id = (select auth.uid()));
create policy tca_insert on public.teacher_class_assignments for insert to authenticated
  with check (public.is_manager());
create policy tca_update on public.teacher_class_assignments for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy tca_delete on public.teacher_class_assignments for delete to authenticated
  using (public.is_manager());

-- attendance: read by scope; ALL writes go through save_attendance() etc.
create policy attendance_sessions_select on public.attendance_sessions for select to authenticated
  using (public.is_manager() or public.teaches_class(class_id));
create policy attendance_records_select on public.attendance_records for select to authenticated
  using (exists (
    select 1 from public.attendance_sessions s
    where s.id = session_id and (public.is_manager() or public.teaches_class(s.class_id))
  ));
create policy attendance_corrections_select on public.attendance_corrections for select to authenticated
  using (exists (
    select 1 from public.attendance_sessions s
    where s.id = session_id and (public.is_manager() or public.teaches_class(s.class_id))
  ));

-- absence excuses: teachers may file one (pending) for their own students.
create policy excuses_select on public.absence_excuses for select to authenticated
  using (public.is_manager() or (public.teaches_student(student_id)));
create policy excuses_insert on public.absence_excuses for insert to authenticated
  with check (
    status = 'pending' and reviewed_by is null and reviewed_at is null
    and submitted_by = (select auth.uid())
    and (public.is_manager() or public.teaches_student(student_id))
  );

-- behaviour categories
create policy categories_select on public.behavior_categories for select to authenticated
  using (public.is_active_staff());
create policy categories_write on public.behavior_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- incidents: managers see all; teachers see only what they reported.
create policy incidents_select on public.behavior_incidents for select to authenticated
  using (public.is_manager() or (reported_by = (select auth.uid()) and public.is_active_staff()));
create policy incidents_update_reporter on public.behavior_incidents for update to authenticated
  using (reported_by = (select auth.uid()) and status = 'submitted' and public.is_active_staff())
  with check (reported_by = (select auth.uid()) and status = 'submitted');

create policy incident_students_select on public.incident_students for select to authenticated
  using (exists (
    select 1 from public.behavior_incidents i where i.id = incident_id
      and (public.is_manager() or (i.reported_by = (select auth.uid()) and public.is_active_staff()))
  ));
create policy incident_actions_select on public.incident_actions for select to authenticated
  using (exists (
    select 1 from public.behavior_incidents i where i.id = incident_id
      and (public.is_manager() or (i.reported_by = (select auth.uid()) and public.is_active_staff()))
  ));

-- follow-ups
create policy follow_ups_select on public.follow_up_tasks for select to authenticated
  using (public.is_manager()
    or (public.is_active_staff() and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()))));
create policy follow_ups_insert on public.follow_up_tasks for insert to authenticated
  with check (
    public.is_manager()
    or (public.has_role('teacher') and assigned_to = (select auth.uid())
        and (student_id is null or public.teaches_student(student_id))
        and incident_id is null)
  );
create policy follow_ups_update on public.follow_up_tasks for update to authenticated
  using (public.is_manager()
    or (public.is_active_staff() and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()))))
  with check (public.is_manager()
    or (public.is_active_staff() and (assigned_to = (select auth.uid()) or created_by = (select auth.uid()))));

create policy follow_up_notes_select on public.follow_up_notes for select to authenticated
  using (exists (select 1 from public.follow_up_tasks t where t.id = task_id));
create policy follow_up_notes_insert on public.follow_up_notes for insert to authenticated
  with check (author_id = (select auth.uid())
    and exists (select 1 from public.follow_up_tasks t where t.id = task_id));

-- notifications
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (recipient_id = (select auth.uid()));

-- audit log: admins read; nobody writes directly (triggers only).
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_admin());

-- Table privileges: least privilege per table (RLS still applies).
revoke insert, update, delete, truncate on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant update on public.school_settings to authenticated;
grant update (full_name, phone, is_active) on public.profiles to authenticated;
grant insert, delete on public.user_roles to authenticated;
grant insert, update, delete on public.academic_years to authenticated;
grant insert, update on public.school_classes to authenticated;
grant insert, update on public.students to authenticated;
grant insert, update on public.enrollments to authenticated;
grant insert, update, delete on public.teacher_class_assignments to authenticated;
grant insert on public.absence_excuses to authenticated;
grant insert, update, delete on public.behavior_categories to authenticated;
grant update (category_id, incident_date, location, description, severity) on public.behavior_incidents to authenticated;
grant insert, update on public.follow_up_tasks to authenticated;
grant insert on public.follow_up_notes to authenticated;
grant update (is_read), delete on public.notifications to authenticated;
