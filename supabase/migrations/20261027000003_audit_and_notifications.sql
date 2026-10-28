-- =====================================================================
-- Audit trail and notification fan-out (trigger based, SECURITY DEFINER
-- so that ordinary users never need direct write access).
-- =====================================================================

-- Generic row audit. TG_ARGV[0] = comma separated columns to omit
-- (e.g. free-text fields with sensitive content, noisy timestamps).
create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_skip text[] := array['updated_at', 'created_at'] || coalesce(string_to_array(tg_argv[0], ','), '{}');
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any (v_skip)) and (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('from', v_old -> v_key, 'to', v_new -> v_key));
      end if;
    end loop;
    if v_changes = '{}'::jsonb then return new; end if;
  else
    v_changes := coalesce(v_new, v_old);
    foreach v_key in array v_skip loop v_changes := v_changes - v_key; end loop;
  end if;

  insert into public.audit_logs (actor_id, action, table_name, record_id, changes)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', concat_ws(':', v_row ->> 'user_id', v_row ->> 'role')),
    v_changes
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_school_settings after update on public.school_settings
  for each row execute function public.audit_row_change();
create trigger audit_profiles after insert or update on public.profiles
  for each row execute function public.audit_row_change();
create trigger audit_user_roles after insert or delete on public.user_roles
  for each row execute function public.audit_row_change();
create trigger audit_academic_years after insert or update or delete on public.academic_years
  for each row execute function public.audit_row_change();
create trigger audit_school_classes after insert or update on public.school_classes
  for each row execute function public.audit_row_change();
create trigger audit_students after insert or update on public.students
  for each row execute function public.audit_row_change('notes');
create trigger audit_enrollments after insert or update on public.enrollments
  for each row execute function public.audit_row_change();
create trigger audit_tca after insert or update or delete on public.teacher_class_assignments
  for each row execute function public.audit_row_change();
create trigger audit_attendance_sessions after update of status on public.attendance_sessions
  for each row execute function public.audit_row_change();
create trigger audit_absence_excuses after insert or update on public.absence_excuses
  for each row execute function public.audit_row_change('details');
create trigger audit_behavior_categories after insert or update or delete on public.behavior_categories
  for each row execute function public.audit_row_change();
create trigger audit_behavior_incidents after insert or update on public.behavior_incidents
  for each row execute function public.audit_row_change('description,decision_note');
create trigger audit_follow_up_tasks after insert or update on public.follow_up_tasks
  for each row execute function public.audit_row_change('description,outcome,due_soon_notified_at');

-- Explicit audit entry for workflow functions.
create or replace function public.write_audit(_action text, _table text, _record text, _changes jsonb, _reason text default null)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, table_name, record_id, changes, reason)
  values ((select auth.uid()), _action, _table, _record, _changes, _reason);
$$;
revoke execute on function public.write_audit(text, text, text, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------
create or replace function public.notify(_recipient uuid, _type text, _title text, _body text, _link text)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, type, title, body, link)
  select _recipient, _type, _title, _body, _link
  where _recipient is not null
    and _recipient is distinct from (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = _recipient and p.is_active);
$$;
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_managers(_type text, _title text, _body text, _link text)
returns void
language sql security definer
set search_path = ''
as $$
  select public.notify(u.user_id, _type, _title, _body, _link)
  from (select distinct r.user_id from public.user_roles r where r.role in ('admin', 'student_affairs')) u;
$$;
revoke execute on function public.notify_managers(text, text, text, text) from public, anon, authenticated;

create or replace function public.on_follow_up_assigned()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to then
    perform public.notify(new.assigned_to, 'follow_up_assigned', 'أُسندت إليك مهمة متابعة',
      left(new.title, 160), '/follow-ups/' || new.id);
  end if;
  return new;
end;
$$;
create trigger follow_up_assigned_notify after insert or update of assigned_to on public.follow_up_tasks
  for each row execute function public.on_follow_up_assigned();

create or replace function public.on_role_changed()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.user_roles := coalesce(new, old);
  v_label text := case v_row.role when 'admin' then 'مدير النظام' when 'student_affairs' then 'شؤون الطلبة' else 'معلم' end;
begin
  perform public.notify(v_row.user_id, 'role_changed',
    case when tg_op = 'INSERT' then 'تم منحك صلاحية: ' || v_label else 'تم سحب صلاحية: ' || v_label end,
    null, '/');
  return v_row;
end;
$$;
create trigger user_roles_notify after insert or delete on public.user_roles
  for each row execute function public.on_role_changed();

create or replace function public.on_excuse_submitted()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.user_roles r
                 where r.user_id = new.submitted_by and r.role in ('admin', 'student_affairs')) then
    perform public.notify_managers('excuse_submitted', 'عذر غياب جديد بانتظار المراجعة', null,
      '/attendance/excuses');
  end if;
  return new;
end;
$$;
create trigger absence_excuse_notify after insert on public.absence_excuses
  for each row execute function public.on_excuse_submitted();

-- Reporter edits to an incident are recorded in its action history.
create or replace function public.on_incident_edited()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if (new.description, new.location, new.category_id, new.severity, new.incident_date)
     is distinct from (old.description, old.location, old.category_id, old.severity, old.incident_date) then
    insert into public.incident_actions (incident_id, action_type, note, actor_id)
    values (new.id, 'edited', 'تم تعديل بيانات البلاغ', (select auth.uid()));
  end if;
  return new;
end;
$$;
create trigger behavior_incidents_edited after update on public.behavior_incidents
  for each row execute function public.on_incident_edited();
