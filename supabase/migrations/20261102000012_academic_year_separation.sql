-- =====================================================================
-- Academic year separation and year-end close.
--
-- Every operational record now belongs to one academic year, and the
-- day-to-day screens show the current year only. A closed year is
-- read-only: guard triggers reject writes to its attendance, incidents,
-- follow-ups, excuses (and, in the next migration, discipline records).
--
-- close_academic_year() ends the current year in one transaction:
-- enrollments are completed, the graduating grade becomes "graduated",
-- everyone else enrolled that year is archived (re-activated when they are
-- enrolled or imported again), and a new current year is created, optionally
-- with the same class structure.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Year tags
-- ---------------------------------------------------------------------
alter table public.behavior_incidents add column if not exists academic_year_id uuid references public.academic_years (id) on delete restrict;
alter table public.follow_up_tasks add column if not exists academic_year_id uuid references public.academic_years (id) on delete restrict;
alter table public.absence_excuses add column if not exists academic_year_id uuid references public.academic_years (id) on delete restrict;

update public.behavior_incidents set academic_year_id = public.current_academic_year_id() where academic_year_id is null;
update public.follow_up_tasks set academic_year_id = public.current_academic_year_id() where academic_year_id is null;
update public.absence_excuses set academic_year_id = public.current_academic_year_id() where academic_year_id is null;

alter table public.behavior_incidents alter column academic_year_id set default public.current_academic_year_id();
alter table public.follow_up_tasks alter column academic_year_id set default public.current_academic_year_id();
alter table public.absence_excuses alter column academic_year_id set default public.current_academic_year_id();

create index if not exists behavior_incidents_year_idx on public.behavior_incidents (academic_year_id, incident_date desc);
create index if not exists follow_up_tasks_year_idx on public.follow_up_tasks (academic_year_id, status);
create index if not exists absence_excuses_year_idx on public.absence_excuses (academic_year_id, status);

-- ---------------------------------------------------------------------
-- Closed years are read-only
-- ---------------------------------------------------------------------
create or replace function public.year_is_closed(p_year_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select status = 'closed' from public.academic_years where id = p_year_id), false);
$$;

-- Rows tagged with academic_year_id (incidents, follow-ups, excuses, discipline).
create or replace function public.guard_open_year()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.academic_year_id is null then
    raise exception 'لا يوجد عام دراسي حالي. حدّد العام الدراسي من الإعدادات أولًا' using errcode = '23502';
  end if;
  if public.year_is_closed(new.academic_year_id)
     or (tg_op = 'UPDATE' and public.year_is_closed(old.academic_year_id)) then
    raise exception 'العام الدراسي مغلق، وسجلاته للعرض فقط' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.academic_year_id is distinct from old.academic_year_id and not public.in_trusted_context() then
    raise exception 'لا يمكن نقل السجل إلى عام دراسي آخر' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger behavior_incidents_open_year before insert or update on public.behavior_incidents
  for each row execute function public.guard_open_year();
create or replace trigger follow_up_tasks_open_year before insert or update on public.follow_up_tasks
  for each row execute function public.guard_open_year();
create or replace trigger absence_excuses_open_year before insert or update on public.absence_excuses
  for each row execute function public.guard_open_year();

-- Attendance belongs to the class's year.
create or replace function public.guard_attendance_open_year()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_class uuid;
begin
  if tg_table_name = 'attendance_sessions' then
    v_class := new.class_id;
  else
    select s.class_id into v_class from public.attendance_sessions s where s.id = new.session_id;
  end if;
  if exists (
    select 1 from public.school_classes c join public.academic_years y on y.id = c.academic_year_id
    where c.id = v_class and y.status = 'closed'
  ) then
    raise exception 'العام الدراسي مغلق، ولا يمكن تعديل سجلات الحضور فيه' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace trigger attendance_sessions_open_year before insert or update on public.attendance_sessions
  for each row execute function public.guard_attendance_open_year();
create or replace trigger attendance_records_open_year before insert or update on public.attendance_records
  for each row execute function public.guard_attendance_open_year();

revoke execute on function public.guard_open_year(), public.guard_attendance_open_year() from public, anon, authenticated;
revoke execute on function public.year_is_closed(uuid) from public, anon;
grant execute on function public.year_is_closed(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Dashboard and follow-up summary: current year only
-- ---------------------------------------------------------------------
create or replace function public.dashboard_overview(p_from date, p_to date)
returns jsonb
language sql stable
set search_path = ''
as $$
  with yr as (select public.current_academic_year_id() as id),
  rec as (
    select r.status, count(*) as n
    from public.attendance_records r
    join public.attendance_sessions s on s.id = r.session_id
    join public.school_classes c on c.id = s.class_id
    cross join yr
    where s.session_date between p_from and p_to and c.academic_year_id = yr.id
    group by r.status
  ),
  agg as (
    select coalesce(sum(n) filter (where status = 'present'), 0) as present,
           coalesce(sum(n) filter (where status = 'late'), 0) as late,
           coalesce(sum(n) filter (where status = 'absent'), 0) as absent,
           coalesce(sum(n) filter (where status = 'excused'), 0) as excused
    from rec
  )
  select jsonb_build_object(
    'active_students', (select count(distinct e.student_id) from public.enrollments e join public.students s on s.id = e.student_id, yr
                        where e.academic_year_id = yr.id and e.status = 'active' and s.status = 'active'),
    'classes', (select count(*) from public.school_classes c, yr where c.academic_year_id = yr.id and not c.is_archived),
    'active_enrollments', (select count(*) from public.enrollments e, yr where e.academic_year_id = yr.id and e.status = 'active'),
    'present', agg.present, 'late', agg.late, 'absent', agg.absent, 'excused', agg.excused,
    'attendance_rate', public.attendance_rate(agg.present, agg.late, agg.absent, agg.excused),
    'sessions_total', (select count(*) from public.attendance_sessions s join public.school_classes c on c.id = s.class_id, yr
                       where s.session_date between p_from and p_to and c.academic_year_id = yr.id),
    'sessions_submitted', (select count(*) from public.attendance_sessions s join public.school_classes c on c.id = s.class_id, yr
                           where s.session_date between p_from and p_to and c.academic_year_id = yr.id and s.status = 'submitted'),
    'pending_incidents', (select count(*) from public.behavior_incidents i, yr where i.academic_year_id = yr.id and i.status in ('submitted', 'under_review')),
    'open_follow_ups', (select count(*) from public.follow_up_tasks t, yr where t.academic_year_id = yr.id and t.status in ('open', 'in_progress')),
    'overdue_follow_ups', (select count(*) from public.follow_up_tasks t, yr
                           where t.academic_year_id = yr.id and t.status in ('open', 'in_progress') and t.due_date < public.kw_today()),
    'pending_excuses', (select count(*) from public.absence_excuses x, yr where x.academic_year_id = yr.id and x.status = 'pending')
  )
  from agg;
$$;

create or replace function public.follow_up_summary()
returns table (assignee_id uuid, assignee_name text, open bigint, in_progress bigint, completed bigint, cancelled bigint, overdue bigint)
language sql stable
set search_path = ''
as $$
  select p.id, p.full_name,
         count(*) filter (where t.status = 'open'),
         count(*) filter (where t.status = 'in_progress'),
         count(*) filter (where t.status = 'completed'),
         count(*) filter (where t.status = 'cancelled'),
         count(*) filter (where t.status in ('open', 'in_progress') and t.due_date < public.kw_today())
  from public.follow_up_tasks t
  join public.profiles p on p.id = t.assigned_to
  where t.academic_year_id = public.current_academic_year_id()
  group by p.id, p.full_name
  order by p.full_name;
$$;

-- Incident summary for a period, limited to the current year's incidents.
create or replace function public.incident_summary(p_from date, p_to date)
returns table (category_id uuid, category_name text, status text, incidents bigint)
language sql stable
set search_path = ''
as $$
  select c.id, c.name, i.status, count(*)
  from public.behavior_incidents i
  join public.behavior_categories c on c.id = i.category_id
  where i.incident_date between p_from and p_to
    and i.academic_year_id = public.current_academic_year_id()
  group by c.id, c.name, i.status
  order by c.name, i.status;
$$;

-- ---------------------------------------------------------------------
-- Year-end close
-- ---------------------------------------------------------------------
-- What closing the current year would affect (shown before confirming).
create or replace function public.academic_year_close_preview()
returns jsonb
language sql stable
set search_path = ''
as $$
  with yr as (select * from public.academic_years where is_current limit 1),
  enr as (
    select e.student_id, c.grade_level
    from public.enrollments e join public.school_classes c on c.id = e.class_id, yr
    where e.academic_year_id = yr.id and e.status = 'active'
  )
  select jsonb_build_object(
    'year_id', (select id from yr),
    'year_name', (select name from yr),
    'starts_on', (select starts_on from yr),
    'ends_on', (select ends_on from yr),
    'enrolled_students', (select count(distinct student_id) from enr),
    'by_grade', coalesce((select jsonb_object_agg(grade_level, n) from (select grade_level, count(distinct student_id) n from enr group by grade_level) g), '{}'::jsonb),
    'classes', (select count(*) from public.school_classes c, yr where c.academic_year_id = yr.id and not c.is_archived),
    'draft_sessions', (select count(*) from public.attendance_sessions s join public.school_classes c on c.id = s.class_id, yr
                       where c.academic_year_id = yr.id and s.status = 'draft'),
    'pending_incidents', (select count(*) from public.behavior_incidents i, yr where i.academic_year_id = yr.id and i.status in ('submitted', 'under_review')),
    'open_follow_ups', (select count(*) from public.follow_up_tasks t, yr where t.academic_year_id = yr.id and t.status in ('open', 'in_progress')),
    'pending_excuses', (select count(*) from public.absence_excuses x, yr where x.academic_year_id = yr.id and x.status = 'pending')
  );
$$;

create or replace function public.close_academic_year(
  p_confirm_name text,
  p_new_name text,
  p_new_starts_on date,
  p_new_ends_on date,
  p_copy_classes boolean default true,
  p_graduating_grade smallint default 12
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_old public.academic_years;
  v_new uuid;
  v_end date;
  v_enrollments int;
  v_graduated int;
  v_archived int;
  v_classes int := 0;
begin
  if not public.is_admin() then
    raise exception 'إنهاء العام الدراسي متاح لمدير النظام فقط' using errcode = '42501';
  end if;
  select * into v_old from public.academic_years where is_current for update;
  if not found then
    raise exception 'لا يوجد عام دراسي حالي' using errcode = 'P0002';
  end if;
  if btrim(coalesce(p_confirm_name, '')) <> v_old.name then
    raise exception 'اكتب اسم العام الحالي (%) للتأكيد', v_old.name using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_new_name, ''))) not between 4 and 40 then
    raise exception 'اسم العام الجديد غير صالح' using errcode = '22023';
  end if;
  if exists (select 1 from public.academic_years where name = btrim(p_new_name)) then
    raise exception 'يوجد عام دراسي بهذا الاسم مسبقًا' using errcode = '23505';
  end if;
  if p_new_starts_on is null or p_new_ends_on is null or p_new_ends_on <= p_new_starts_on then
    raise exception 'تاريخ نهاية العام الجديد يجب أن يكون بعد تاريخ بدايته' using errcode = '22023';
  end if;
  if p_new_starts_on <= v_old.ends_on then
    raise exception 'يجب أن يبدأ العام الجديد بعد نهاية العام الحالي (%)', v_old.ends_on using errcode = '22023';
  end if;
  if exists (select 1 from public.academic_years
             where daterange(starts_on, ends_on, '[]') && daterange(p_new_starts_on, p_new_ends_on, '[]')) then
    raise exception 'تواريخ العام الجديد تتداخل مع عام دراسي آخر' using errcode = '23P01';
  end if;

  perform set_config('app.trusted', 'on', true);
  v_end := least(v_old.ends_on, public.kw_today());

  -- Students of the graduating grade become graduates; everyone else enrolled
  -- this year is archived until they are enrolled again.
  with enrolled as (
    select e.student_id, c.grade_level
    from public.enrollments e join public.school_classes c on c.id = e.class_id
    where e.academic_year_id = v_old.id and e.status = 'active'
  )
  update public.students s set status = 'graduated'
  from enrolled where enrolled.student_id = s.id and enrolled.grade_level = p_graduating_grade and s.status = 'active';
  get diagnostics v_graduated = row_count;

  update public.students s set status = 'archived'
  where s.status = 'active'
    and exists (select 1 from public.enrollments e where e.student_id = s.id and e.academic_year_id = v_old.id and e.status = 'active');
  get diagnostics v_archived = row_count;

  update public.enrollments set status = 'completed', ended_on = greatest(enrolled_on, v_end)
  where academic_year_id = v_old.id and status = 'active';
  get diagnostics v_enrollments = row_count;

  update public.academic_years set is_current = false, status = 'closed' where id = v_old.id;

  insert into public.academic_years (name, starts_on, ends_on, is_current, status)
  values (btrim(p_new_name), p_new_starts_on, p_new_ends_on, true, 'active')
  returning id into v_new;

  if p_copy_classes then
    insert into public.school_classes (academic_year_id, grade_level, section, name, track, capacity, room)
    select v_new, grade_level, section, name, track, capacity, room
    from public.school_classes where academic_year_id = v_old.id and not is_archived;
    get diagnostics v_classes = row_count;
  end if;

  perform public.write_audit('academic_year_closed', 'academic_years', v_old.id::text,
    jsonb_build_object('closed', v_old.name, 'new_year', btrim(p_new_name), 'enrollments_completed', v_enrollments,
                       'graduated', v_graduated, 'archived', v_archived, 'classes_copied', v_classes));
  return v_new;
end;
$$;

revoke execute on function public.academic_year_close_preview(), public.close_academic_year(text, text, date, date, boolean, smallint) from public, anon;
grant execute on function public.academic_year_close_preview(), public.close_academic_year(text, text, date, date, boolean, smallint) to authenticated;

-- ---------------------------------------------------------------------
-- Archive: read-only summary of any year (managers)
-- ---------------------------------------------------------------------
create or replace function public.academic_year_summary(p_year_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  with yr as (select * from public.academic_years where id = p_year_id),
  rec as (
    select r.status, count(*) as n
    from public.attendance_records r
    join public.attendance_sessions s on s.id = r.session_id
    join public.school_classes c on c.id = s.class_id
    where c.academic_year_id = p_year_id
    group by r.status
  )
  select jsonb_build_object(
    'students', (select count(distinct e.student_id) from public.enrollments e where e.academic_year_id = p_year_id),
    'classes', (select count(*) from public.school_classes c where c.academic_year_id = p_year_id),
    'sessions', (select count(*) from public.attendance_sessions s join public.school_classes c on c.id = s.class_id where c.academic_year_id = p_year_id),
    'present', coalesce((select n from rec where status = 'present'), 0),
    'late', coalesce((select n from rec where status = 'late'), 0),
    'absent', coalesce((select n from rec where status = 'absent'), 0),
    'excused', coalesce((select n from rec where status = 'excused'), 0),
    'incidents', (select count(*) from public.behavior_incidents i where i.academic_year_id = p_year_id),
    'follow_ups', (select count(*) from public.follow_up_tasks t where t.academic_year_id = p_year_id),
    'excuses', (select count(*) from public.absence_excuses x where x.academic_year_id = p_year_id)
  )
  from (select 1) one
  where exists (select 1 from yr);
$$;

revoke execute on function public.academic_year_summary(uuid) from public, anon;
grant execute on function public.academic_year_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Returning students (used by the yearly import)
-- A student archived at year-end is re-activated and enrolled in a class
-- of the current year, keeping one record (and history) per student.
-- ---------------------------------------------------------------------
create or replace function public.return_student(
  p_student_number text, p_full_name text, p_guardian_name text, p_guardian_phone text, p_class_id uuid
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_student public.students;
begin
  if not public.is_manager() then
    raise exception 'لا تملك صلاحية تسجيل الطلاب' using errcode = '42501';
  end if;
  select * into v_student from public.students where lower(student_number) = lower(btrim(p_student_number)) for update;
  if not found then
    raise exception 'الطالب غير موجود' using errcode = 'P0002';
  end if;
  if v_student.status = 'graduated' then
    raise exception 'الطالب متخرج ولا يمكن إعادة تسجيله' using errcode = '23514';
  end if;
  if v_student.status = 'transferred' then
    raise exception 'الطالب منقول من المدرسة' using errcode = '23514';
  end if;
  if p_class_id is null then
    raise exception 'حدّد فصل الطالب في العام الحالي' using errcode = '22023';
  end if;
  update public.students
  set status = 'active',
      full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
      guardian_name = coalesce(nullif(btrim(p_guardian_name), ''), guardian_name),
      guardian_phone = coalesce(nullif(btrim(p_guardian_phone), ''), guardian_phone)
  where id = v_student.id;
  perform public.enroll_student(v_student.id, p_class_id, null);
  return v_student.id;
end;
$$;

revoke execute on function public.return_student(text, text, text, text, uuid) from public, anon;
grant execute on function public.return_student(text, text, text, text, uuid) to authenticated;
